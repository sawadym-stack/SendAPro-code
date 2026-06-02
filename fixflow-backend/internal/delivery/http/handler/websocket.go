package handler

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

var ActiveWSHandler *WSHandler

type WSHandler struct {
	tokenManager *token.Manager
	rooms        map[string]*Room
	roomsMutex   sync.RWMutex
	db           *pgxpool.Pool
}

type Room struct {
	name    string
	clients map[*WSClient]bool
	mutex   sync.RWMutex
}

type WSClient struct {
	conn   *websocket.Conn
	userID string
	send   chan interface{}
	done   chan struct{}
	once   sync.Once
}

func (client *WSClient) Close() {
	client.once.Do(func() {
		close(client.done)
		client.conn.Close()
	})
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data,omitempty"`
}

func NewWSHandler(tokenManager *token.Manager, db *pgxpool.Pool) *WSHandler {
	ActiveWSHandler = &WSHandler{
		tokenManager: tokenManager,
		rooms:        make(map[string]*Room),
		db:           db,
	}
	return ActiveWSHandler
}

func (h *WSHandler) GetTechUserID(ctx context.Context, techID string) (string, error) {
	var userID string
	err := h.db.QueryRow(ctx, `SELECT user_id FROM technicians WHERE id::text = $1 OR user_id::text = $1`, techID).Scan(&userID)
	if err != nil {
		return "", err
	}
	return userID, nil
}

func (h *WSHandler) Handle(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		return websocket.New(h.handleConnection)(c)
	}
	return fiber.ErrUpgradeRequired
}

func (h *WSHandler) handleConnection(c *websocket.Conn) {
	// Get token and room from query parameters
	tokenStr := c.Query("token")
	room := c.Query("room")

	if tokenStr == "" || room == "" {
		c.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"missing token or room"}`))
		c.Close()
		return
	}

	// Validate token
	claims, err := h.tokenManager.Parse(tokenStr)
	if err != nil {
		c.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"invalid token"}`))
		c.Close()
		return
	}

	userID := claims.UserID

	// Create room if not exists
	h.roomsMutex.Lock()
	r, exists := h.rooms[room]
	if !exists {
		r = &Room{
			name:    room,
			clients: make(map[*WSClient]bool),
		}
		h.rooms[room] = r
	}
	h.roomsMutex.Unlock()

	// Add client to room
	client := &WSClient{
		conn:   c,
		userID: userID,
		send:   make(chan interface{}, 256),
		done:   make(chan struct{}),
	}

	r.mutex.Lock()
	r.clients[client] = true
	r.mutex.Unlock()

	// Start goroutine to handle sending messages
	go h.writePump(client)

	// Send confirmation to client
	c.WriteJSON(map[string]interface{}{
		"type": "room_joined",
		"room": room,
	})

	// Notify others that user joined
	h.broadcastToRoom(room, map[string]interface{}{
		"type":   "room_joined",
		"room":   room,
		"userId": userID,
	}, client)

	// Handle incoming messages
	for {
		messageType, message, err := c.ReadMessage()
		if err != nil {
			break
		}

		if messageType == websocket.TextMessage {
			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			msgType, ok := msg["type"].(string)
			if !ok {
				continue
			}

			// Broadcast message to room
			msg["type"] = msgType
			h.broadcastToRoom(room, msg, nil)
		}
	}

	// Remove client from room
	r.mutex.Lock()
	delete(r.clients, client)
	r.mutex.Unlock()

	// Clean up empty room
	h.roomsMutex.Lock()
	if len(r.clients) == 0 {
		delete(h.rooms, room)
	}
	h.roomsMutex.Unlock()

	client.Close()
}

func (h *WSHandler) broadcastToRoom(room string, msg interface{}, exclude *WSClient) {
	h.roomsMutex.RLock()
	r, exists := h.rooms[room]
	h.roomsMutex.RUnlock()

	if !exists {
		return
	}

	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for client := range r.clients {
		if exclude != nil && client == exclude {
			continue
		}
		select {
		case client.send <- msg:
		default:
			// Channel full, skip
		}
	}
}

func (h *WSHandler) SendToRoom(ctx context.Context, room string, msg interface{}) error {
	h.roomsMutex.RLock()
	r, exists := h.rooms[room]
	h.roomsMutex.RUnlock()

	if !exists {
		return nil
	}

	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for client := range r.clients {
		select {
		case client.send <- msg:
		default:
		}
	}
	return nil
}

func (h *WSHandler) writePump(client *WSClient) {
	defer client.Close()
	for {
		select {
		case msg, ok := <-client.send:
			if !ok {
				return
			}
			if err := client.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-client.done:
			return
		}
	}
}
