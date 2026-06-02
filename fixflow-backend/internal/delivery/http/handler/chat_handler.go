package handler

import (
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	domain "github.com/yourname/fixflow-backend/internal/domain/chat"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
)

type ChatHandler struct {
	chatRepo   domain.Repository
	pubsubRepo redisrepo.PubSubRepo
	db         *pgxpool.Pool
}

func NewChatHandler(chatRepo domain.Repository, pubsubRepo redisrepo.PubSubRepo, db *pgxpool.Pool) *ChatHandler {
	return &ChatHandler{
		chatRepo:   chatRepo,
		pubsubRepo: pubsubRepo,
		db:         db,
	}
}

func (h *ChatHandler) GetRoomInfo(c *fiber.Ctx) error {
	ctx := c.Context()
	jobID := c.Params("jobId")
	userID, _ := c.Locals("user_id").(string)

	room, err := h.chatRepo.GetRoomByJobID(ctx, jobID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	// Count unread messages in this room sent by the OTHER participant
	var unreadCount int
	if userID != "" {
		q := `SELECT COUNT(*) FROM chat_messages 
		      WHERE room_id = $1 AND sender_id != $2 AND is_read = false`
		err = h.db.QueryRow(ctx, q, room.ID, userID).Scan(&unreadCount)
		if err != nil {
			unreadCount = 0
		}
	}

	return c.JSON(fiber.Map{
		"id":            room.ID,
		"jobId":         room.JobID,
		"customerId":    room.CustomerID,
		"technicianId":  room.TechnicianID,
		"createdAt":     room.CreatedAt,
		"lastMessageAt": room.LastMessageAt,
		"unreadCount":   unreadCount,
	})
}

func (h *ChatHandler) GetMessages(c *fiber.Ctx) error {
	ctx := c.Context()
	jobID := c.Params("jobId")

	limitStr := c.Query("limit", "20")
	beforeID := c.Query("before", "")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}

	room, err := h.chatRepo.GetRoomByJobID(ctx, jobID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	messages, err := h.chatRepo.GetHistory(ctx, room.ID, limit, beforeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(messages)
}

func (h *ChatHandler) PostMessage(c *fiber.Ctx) error {
	ctx := c.Context()
	roomID := c.Params("id")

	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	// Validate room participant membership
	room, err := h.chatRepo.GetRoom(ctx, roomID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	if room.CustomerID != userID && room.TechnicianID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a room participant"})
	}

	// Parse body
	type SendMessageBody struct {
		Type     string  `json:"type"`
		Content  string  `json:"content"`
		MediaURL *string `json:"mediaUrl"`
	}
	var body SendMessageBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if body.Type != "text" && body.Type != "voice" && body.Type != "image" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message type"})
	}

	var mediaUrlStr string
	if body.MediaURL != nil {
		mediaUrlStr = *body.MediaURL
	}

	// Save to DB
	saved, err := h.chatRepo.SaveMessage(ctx, domain.ChatMessage{
		RoomID:   roomID,
		SenderID: userID,
		Type:     domain.MessageType(body.Type),
		Content:  body.Content,
		MediaURL: mediaUrlStr,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Publish to Redis -> WS hub -> browser clients
	event := websocket.WSEvent{
		Type:   "new_message",
		RoomID: "job:" + room.JobID,
		Payload: map[string]interface{}{
			"id":         saved.ID,
			"messageId":  saved.ID,
			"roomId":     saved.RoomID,
			"senderId":   saved.SenderID,
			"senderName": saved.SenderName,
			"type":       saved.Type,
			"content":    saved.Content,
			"mediaUrl":   saved.MediaURL,
			"createdAt":  saved.CreatedAt,
			"isRead":     saved.IsRead,
		},
	}
	if pubErr := h.pubsubRepo.Publish(ctx, "ws:rooms", event); pubErr != nil {
		log.Printf("[Chat HTTP Handler] Redis pubsub publish error: %v", pubErr)
	}

	return c.JSON(saved)
}

func (h *ChatHandler) MarkRead(c *fiber.Ctx) error {
	ctx := c.Context()
	roomID := c.Params("id")

	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	err := h.chatRepo.MarkRead(ctx, roomID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
}

