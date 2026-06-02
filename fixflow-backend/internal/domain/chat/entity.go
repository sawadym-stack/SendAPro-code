package chat

import "time"

type MessageType string

const (
	MessageTypeText  MessageType = "text"
	MessageTypeVoice MessageType = "voice"
	MessageTypeImage MessageType = "image"
)

type ChatMessage struct {
	ID         string      `json:"id"`
	RoomID     string      `json:"roomId"`
	SenderID   string      `json:"senderId"`
	SenderName string      `json:"senderName"`
	Type       MessageType `json:"type"`
	Content    string      `json:"content"`
	MediaURL   string      `json:"mediaUrl"`
	CreatedAt  time.Time   `json:"createdAt"`
	IsRead     bool        `json:"isRead"`
}

type ChatRoom struct {
	ID            string    `json:"id"`
	JobID         string    `json:"jobId"`
	CustomerID    string    `json:"customerId"`
	TechnicianID  string    `json:"technicianId"`
	CreatedAt     time.Time `json:"createdAt"`
	LastMessageAt time.Time `json:"lastMessageAt"`
}
