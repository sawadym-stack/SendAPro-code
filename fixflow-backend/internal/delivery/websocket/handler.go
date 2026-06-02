package websocket

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

var (
	uuidPattern   = `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`
	jobRoomRegex  = regexp.MustCompile("^job:" + uuidPattern + "$")
	userRoomRegex = regexp.MustCompile("^user:" + uuidPattern + "$")
)

// WSHandler creates a Fiber handler that upgrades connections to WebSockets, validates parameters, and registers clients.
func WSHandler(hub *Hub, jwtSecret string) fiber.Handler {
	wsConnectionHandler := websocket.New(func(c *websocket.Conn) {
		tokenStr := c.Query("token")
		room := c.Query("room")

		log.Printf("[WS Handler] New connection attempt. Room: '%s', HasToken: %t", room, tokenStr != "")

		if tokenStr == "" {
			log.Println("[WS Handler] Connection rejected: Token is empty")
			_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4001, "Unauthorized"))
			return
		}

		// 1. Validate JWT Token
		tm := token.NewManager(jwtSecret)
		claims, err := tm.Parse(tokenStr)
		if err != nil {
			log.Printf("[WS Handler] Connection rejected: JWT parse/validation failed: %v", err)
			_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4001, "Unauthorized"))
			return
		}

		// 2. Validate Room Parameter and Access
		isValidRoom := false
		if room == "admin:all" {
			isValidRoom = true
			if claims.Role != "admin" {
				log.Printf("[WS Handler] Connection rejected: User '%s' is not admin for admin:all room", claims.UserID)
				_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4001, "Unauthorized"))
				return
			}
		} else if jobRoomRegex.MatchString(room) || userRoomRegex.MatchString(room) {
			isValidRoom = true
		}

		if !isValidRoom {
			log.Printf("[WS Handler] Connection rejected: Invalid room pattern '%s'", room)
			_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4002, "Invalid room"))
			return
		}

		log.Printf("[WS Handler] Connection approved. Room: '%s', User: '%s'", room, claims.UserID)

		// 3. Register client to hub
		client := NewClient(hub, c, room, claims.UserID)
		hub.register <- client

		// 4. If room is job:{jobId}, immediately fetch and send the last known technician position
		if strings.HasPrefix(room, "job:") && hub.DB != nil {
			jobID := strings.TrimPrefix(room, "job:")
			ctx := context.Background()

			var techID string
			err := hub.DB.QueryRow(ctx, "SELECT COALESCE(technician_id::text, '') FROM jobs WHERE id = $1", jobID).Scan(&techID)
			if err == nil && techID != "" {
				location, err := hub.redis.HGetAll(ctx, "tech:location:"+techID).Result()
				if err == nil && len(location) > 0 {
					event := WSEvent{
						Type:   "location_update",
						RoomID: room,
						Payload: map[string]interface{}{
							"lat":       location["lat"],
							"lng":       location["lng"],
							"timestamp": location["timestamp"],
							"jobId":     location["jobId"],
						},
					}
					if msgBytes, err := json.Marshal(event); err == nil {
						select {
						case client.send <- msgBytes:
						default:
						}
					}
				}
			}
		}

		// 5. Run pumps
		go client.WritePump()
		client.ReadPump() // blocks until disconnect
	}, websocket.Config{
		Origins: []string{"*"},
	})

	return func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return wsConnectionHandler(c)
		}
		return fiber.ErrUpgradeRequired
	}
}
