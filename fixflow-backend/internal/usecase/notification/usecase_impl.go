package notification

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	repopg "github.com/yourname/fixflow-backend/internal/repository/postgres"
)

type PushSender interface {
	SendPush(ctx context.Context, token, title, body string, data map[string]string) (string, error)
	SendPushBatch(ctx context.Context, tokens []string, title, body string, data map[string]string) (any, error)
}

type DeviceTokenRepository interface {
	TokensByUserID(ctx context.Context, userID string) ([]string, error)
}

type Usecase interface {
	Create(ctx context.Context, userID, title, message, typ string) (*repopg.Notification, error)
	List(ctx context.Context, userID string, page, pageSize int32) ([]*repopg.Notification, int32, error)
	MarkRead(ctx context.Context, notificationID, userID string) error
	Subscribe(userID string) (<-chan *repopg.Notification, func())
	NotifyCustomer(ctx context.Context, userID, title, message string) error
}

type usecase struct {
	repo NotificationRepository
	push PushSender
	rdb  *redis.Client
	mu   sync.RWMutex
	subs map[string][]chan *repopg.Notification
}

type NotificationRepository interface {
	Create(ctx context.Context, userID, title, message, typ string) (*repopg.Notification, error)
	ListByUser(ctx context.Context, userID string, page, pageSize int32) ([]*repopg.Notification, int32, error)
	MarkRead(ctx context.Context, notificationID, userID string) error
}

func NewUsecase(repo NotificationRepository, push PushSender, rdb *redis.Client) Usecase {
	return &usecase{repo: repo, push: push, rdb: rdb, subs: map[string][]chan *repopg.Notification{}}
}

func (u *usecase) Create(ctx context.Context, userID, title, message, typ string) (*repopg.Notification, error) {
	n, err := u.repo.Create(ctx, userID, title, message, typ)
	if err != nil {
		return nil, err
	}
	u.publish(userID, n)

	// Publish to Redis for WebSocket real-time delivery
	if u.rdb != nil {
		event := websocket.WSEvent{
			Type:   "notification",
			RoomID: "user:" + userID,
			Payload: map[string]interface{}{
				"id":        n.ID,
				"userId":    n.UserID,
				"title":     n.Title,
				"message":   n.Message,
				"type":      n.Type,
				"isRead":    n.IsRead,
				"createdAt": n.CreatedAt,
			},
		}
		if payload, err := json.Marshal(event); err == nil {
			_ = u.rdb.Publish(ctx, "ws:rooms", string(payload)).Err()
		}
	}

	return n, nil
}

func (u *usecase) List(ctx context.Context, userID string, page, pageSize int32) ([]*repopg.Notification, int32, error) {
	return u.repo.ListByUser(ctx, userID, page, pageSize)
}

func (u *usecase) MarkRead(ctx context.Context, notificationID, userID string) error {
	return u.repo.MarkRead(ctx, notificationID, userID)
}

func (u *usecase) Subscribe(userID string) (<-chan *repopg.Notification, func()) {
	ch := make(chan *repopg.Notification, 8)
	u.mu.Lock()
	u.subs[userID] = append(u.subs[userID], ch)
	u.mu.Unlock()
	cancel := func() {
		u.mu.Lock()
		defer u.mu.Unlock()
		lst := u.subs[userID]
		for i := range lst {
			if lst[i] == ch {
				u.subs[userID] = append(lst[:i], lst[i+1:]...)
				close(ch)
				break
			}
		}
	}
	return ch, cancel
}

func (u *usecase) NotifyCustomer(ctx context.Context, userID, title, message string) error {
	_, err := u.Create(ctx, userID, title, message, "job")
	return err
}

func (u *usecase) publish(userID string, n *repopg.Notification) {
	u.mu.RLock()
	lst := append([]chan *repopg.Notification(nil), u.subs[userID]...)
	u.mu.RUnlock()
	for _, ch := range lst {
		select {
		case ch <- n:
		default:
		}
	}
}
