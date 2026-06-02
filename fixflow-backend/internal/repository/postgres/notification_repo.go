package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Notification struct {
	ID        string
	UserID    string
	Title     string
	Message   string
	Type      string
	IsRead    bool
	CreatedAt time.Time
}

type NotificationRepository struct{ db *pgxpool.Pool }

func NewNotificationRepository(db *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) Create(ctx context.Context, userID, title, message, typ string) (*Notification, error) {
	q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at) VALUES ($1,$2,$3,$4,'{}',false,NOW()) RETURNING id, user_id, title, message, type, is_read, created_at`
	n := &Notification{}
	if err := r.db.QueryRow(ctx, q, userID, title, message, typ).Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.IsRead, &n.CreatedAt); err != nil {
		return nil, err
	}
	return n, nil
}

func (r *NotificationRepository) MarkRead(ctx context.Context, notificationID, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE notifications SET is_read=true, read_at=NOW() WHERE id=$1 AND user_id=$2`, notificationID, userID)
	return err
}

func (r *NotificationRepository) ListByUser(ctx context.Context, userID string, page, pageSize int32) ([]*Notification, int32, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 10
	}
	offset := (page - 1) * pageSize
	var unread int32
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false`, userID).Scan(&unread); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.Query(ctx, `SELECT id, user_id, title, message, type, is_read, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, userID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]*Notification, 0)
	for rows.Next() {
		n := &Notification{}
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, n)
	}
	return out, unread, rows.Err()
}
