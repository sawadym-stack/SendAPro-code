package chat

import "context"

type Repository interface {
	SaveMessage(ctx context.Context, msg ChatMessage) (ChatMessage, error)
	GetHistory(ctx context.Context, roomID string, limit int, beforeID string) ([]ChatMessage, error)
	CreateRoom(ctx context.Context, jobID, customerID, technicianID string) (ChatRoom, error)
	GetRoom(ctx context.Context, roomID string) (ChatRoom, error)
	GetRoomByJobID(ctx context.Context, jobID string) (ChatRoom, error)
	MarkRead(ctx context.Context, roomID, userID string) error
}
