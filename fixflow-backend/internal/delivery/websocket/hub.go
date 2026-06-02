package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/metrics"
)

// WSEvent represents the shared event payload format used across WebSockets and Redis pub/sub.
type WSEvent struct {
	Type    string      `json:"type"`    // e.g. location_update, job_status, new_message, notification, booking_request, quotation_update
	RoomID  string      `json:"roomId"`  // e.g. job:{jobId} or user:{userId} or admin:all
	Payload interface{} `json:"payload"` // event-specific data
}

// Hub maintains the set of active clients and broadcasts messages to clients.
type Hub struct {
	clients    map[string]map[*Client]bool // roomID -> set of clients
	broadcast  chan WSEvent
	register   chan *Client
	unregister chan *Client
	redis      *redis.Client
	mu         sync.RWMutex
	DB         *pgxpool.Pool // Custom extension to allow DB lookups in handlers
}

// NewHub creates a new Hub instance.
func NewHub(redis *redis.Client) *Hub {
	return &Hub{
		clients:    make(map[string]map[*Client]bool),
		broadcast:  make(chan WSEvent),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		redis:      redis,
	}
}

// Run starts the main select loop to handle registration, unregistration, and broadcasting.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.clients[client.roomID] == nil {
				h.clients[client.roomID] = make(map[*Client]bool)
			}
			h.clients[client.roomID][client] = true
			h.mu.Unlock()
			metrics.WSConnectionsActive.Inc()

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.roomID]; ok {
				if _, exists := clients[client]; exists {
					delete(clients, client)
					close(client.send)
					if len(clients) == 0 {
						delete(h.clients, client.roomID)
					}
					metrics.WSConnectionsActive.Dec()
				}
			}
			h.mu.Unlock()

		case event := <-h.broadcast:
			h.mu.Lock()
			clients, ok := h.clients[event.RoomID]
			if ok && len(clients) > 0 {
				msgBytes, err := json.Marshal(event)
				if err == nil {
					for client := range clients {
						select {
						case client.send <- msgBytes:
						default:
							// Slow client: unregister
							go func(c *Client) {
								h.unregister <- c
							}(client)
						}
					}
				}
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastToRoom sends a WSEvent to the broadcast channel.
func (h *Hub) BroadcastToRoom(roomID string, event WSEvent) {
	h.broadcast <- event
}

// GetRoomCount returns the number of active clients per room (for monitoring and metrics).
func (h *Hub) GetRoomCount() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	counts := make(map[string]int)
	for roomID, clients := range h.clients {
		counts[roomID] = len(clients)
	}
	return counts
}

// StartRedisSubscriber subscribes to the Redis pub/sub bridge and forwards events to rooms.
func (h *Hub) StartRedisSubscriber(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			sub := h.redis.Subscribe(ctx, "ws:rooms")
			_, err := sub.Receive(ctx)
			if err != nil {
				log.Printf("[WS Hub] Redis subscription error: %v. Retrying in 5s...", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
					continue
				}
			}

			log.Println("[WS Hub] Subscribed to Redis pub/sub channel 'ws:rooms'")
			ch := sub.Channel()

			// inner loop to process messages until channel closes
			func() {
				defer sub.Close()
				for {
					select {
					case <-ctx.Done():
						return
					case msg, ok := <-ch:
						if !ok {
							log.Println("[WS Hub] Redis pub/sub channel closed. Reconnecting...")
							return
						}
						var event WSEvent
						if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
							log.Printf("[WS Hub] Error unmarshalling pub/sub payload: %v", err)
							continue
						}
						h.BroadcastToRoom(event.RoomID, event)
					}
				}
			}()

			// Backoff before reconnecting on failure
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	}
}

// BroadcastShutdown sends a server_shutdown message to all connected clients.
func (h *Hub) BroadcastShutdown() {
	h.mu.Lock()
	defer h.mu.Unlock()

	event := WSEvent{
		Type: "server_shutdown",
	}

	msgBytes, err := json.Marshal(event)
	if err != nil {
		return
	}

	log.Println("[WS Hub] Broadcasting server_shutdown to all active rooms...")
	for _, clients := range h.clients {
		for client := range clients {
			select {
			case client.send <- msgBytes:
			default:
				// Skip if channel is full/slow
			}
		}
	}
}
