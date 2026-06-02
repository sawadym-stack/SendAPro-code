package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/domain/chat"
)

type ChatRepository struct {
	db *pgxpool.Pool
}

func NewChatRepository(db *pgxpool.Pool) *ChatRepository {
	return &ChatRepository{db: db}
}

func (r *ChatRepository) SaveMessage(ctx context.Context, msg chat.ChatMessage) (chat.ChatMessage, error) {
	q := `WITH inserted AS (
		INSERT INTO chat_messages (room_id, sender_id, type, content, media_url, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING id, room_id, sender_id, type, content, media_url, created_at, is_read
	)
	SELECT i.id, i.room_id, i.sender_id, u.full_name, i.type, COALESCE(i.content, ''), COALESCE(i.media_url, ''), i.created_at, i.is_read
	FROM inserted i
	JOIN users u ON u.id = i.sender_id`

	var saved chat.ChatMessage
	var msgType string
	err := r.db.QueryRow(ctx, q, msg.RoomID, msg.SenderID, string(msg.Type), msg.Content, msg.MediaURL).Scan(
		&saved.ID,
		&saved.RoomID,
		&saved.SenderID,
		&saved.SenderName,
		&msgType,
		&saved.Content,
		&saved.MediaURL,
		&saved.CreatedAt,
		&saved.IsRead,
	)
	if err != nil {
		return chat.ChatMessage{}, err
	}
	saved.Type = chat.MessageType(msgType)

	// Update last_message_at on the room
	_, _ = r.db.Exec(ctx, "UPDATE chat_rooms SET last_message_at = $1 WHERE id = $2", saved.CreatedAt, saved.RoomID)

	return saved, nil
}

func (r *ChatRepository) GetHistory(ctx context.Context, roomID string, limit int, beforeID string) ([]chat.ChatMessage, error) {
	if limit <= 0 {
		limit = 20
	}

	q := `SELECT cm.id, cm.room_id, cm.sender_id, u.full_name, cm.type, COALESCE(cm.content, ''), COALESCE(cm.media_url, ''), cm.created_at, cm.is_read
	      FROM chat_messages cm
	      JOIN users u ON u.id = cm.sender_id
	      WHERE cm.room_id = $1
	      AND ($2 = '' OR cm.id < $2::uuid)
	      ORDER BY cm.created_at DESC
	      LIMIT $3`

	rows, err := r.db.Query(ctx, q, roomID, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	history := []chat.ChatMessage{}
	for rows.Next() {
		var msg chat.ChatMessage
		var msgType string
		err := rows.Scan(
			&msg.ID,
			&msg.RoomID,
			&msg.SenderID,
			&msg.SenderName,
			&msgType,
			&msg.Content,
			&msg.MediaURL,
			&msg.CreatedAt,
			&msg.IsRead,
		)
		if err != nil {
			return nil, err
		}
		msg.Type = chat.MessageType(msgType)
		history = append(history, msg)
	}

	// Reverse history so it's ordered oldest first (newest is last)
	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	return history, nil
}

func (r *ChatRepository) CreateRoom(ctx context.Context, jobID, customerID, technicianID string) (chat.ChatRoom, error) {
	q := `INSERT INTO chat_rooms (job_id, customer_id, technician_id, created_at)
	      VALUES ($1, $2, $3, NOW())
	      ON CONFLICT (job_id) DO UPDATE SET job_id = EXCLUDED.job_id
	      RETURNING id, job_id, customer_id, technician_id, created_at, COALESCE(last_message_at, created_at)`

	var room chat.ChatRoom
	err := r.db.QueryRow(ctx, q, jobID, customerID, technicianID).Scan(
		&room.ID,
		&room.JobID,
		&room.CustomerID,
		&room.TechnicianID,
		&room.CreatedAt,
		&room.LastMessageAt,
	)
	return room, err
}

func (r *ChatRepository) GetRoom(ctx context.Context, roomID string) (chat.ChatRoom, error) {
	q := `SELECT id, job_id, customer_id, technician_id, created_at, COALESCE(last_message_at, created_at)
	      FROM chat_rooms WHERE id = $1`

	var room chat.ChatRoom
	err := r.db.QueryRow(ctx, q, roomID).Scan(
		&room.ID,
		&room.JobID,
		&room.CustomerID,
		&room.TechnicianID,
		&room.CreatedAt,
		&room.LastMessageAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return chat.ChatRoom{}, fmt.Errorf("chat room not found: %s", roomID)
	}
	return room, err
}

func (r *ChatRepository) GetRoomByJobID(ctx context.Context, jobID string) (chat.ChatRoom, error) {
	q := `SELECT id, job_id, customer_id, technician_id, created_at, COALESCE(last_message_at, created_at)
	      FROM chat_rooms WHERE job_id = $1`

	var room chat.ChatRoom
	err := r.db.QueryRow(ctx, q, jobID).Scan(
		&room.ID,
		&room.JobID,
		&room.CustomerID,
		&room.TechnicianID,
		&room.CreatedAt,
		&room.LastMessageAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return chat.ChatRoom{}, fmt.Errorf("chat room not found for job: %s", jobID)
	}
	return room, err
}

func (r *ChatRepository) MarkRead(ctx context.Context, roomID, userID string) error {
	q := `UPDATE chat_messages 
	      SET is_read = true 
	      WHERE room_id = $1 AND sender_id != $2 AND is_read = false`
	_, err := r.db.Exec(ctx, q, roomID, userID)
	return err
}
