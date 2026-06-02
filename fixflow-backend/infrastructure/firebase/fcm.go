package firebase

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/google/uuid"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/api/option"
)

type PushRequest struct {
	UserID string
	Title  string
	Body   string
	Type   string
}

type FCMClient struct {
	msg *messaging.Client
	db  *pgxpool.Pool
	rdb *redis.Client
}

func NewFCMClient(ctx context.Context, credentialsFile string) (*FCMClient, error) {
	app, err := firebase.NewApp(ctx, nil, option.WithCredentialsFile(credentialsFile))
	if err != nil {
		return nil, fmt.Errorf("firebase app init: %w", err)
	}
	msg, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase messaging init: %w", err)
	}
	return &FCMClient{msg: msg}, nil
}

func (c *FCMClient) SetDBAndRedis(db *pgxpool.Pool, rdb *redis.Client) {
	c.db = db
	c.rdb = rdb
}

func (c *FCMClient) SendPush(ctx context.Context, token, title, body string, data map[string]string) (string, error) {
	resp, err := c.msg.Send(ctx, &messaging.Message{
		Token: token,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: data,
	})
	if err != nil {
		return "", err
	}
	return resp, nil
}

func (c *FCMClient) SendPushBatch(ctx context.Context, tokens []string, title, body string, data map[string]string) (*messaging.BatchResponse, error) {
	if len(tokens) == 0 {
		return &messaging.BatchResponse{}, nil
	}
	messages := make([]*messaging.Message, 0, len(tokens))
	for _, token := range tokens {
		messages = append(messages, &messaging.Message{
			Token: token,
			Notification: &messaging.Notification{
				Title: title,
				Body:  body,
			},
			Data: data,
		})
	}
	return c.msg.SendEach(ctx, messages)
}

func (c *FCMClient) SendPushWithRetry(ctx context.Context, req PushRequest, maxRetries int) error {
	if c.rdb == nil {
		return fmt.Errorf("redis client not configured in FCMClient")
	}

	tokenVal, err := c.rdb.Get(ctx, "user:fcm_token:"+req.UserID).Result()
	if err != nil || tokenVal == "" {
		c.logFailedDelivery(ctx, req, fmt.Errorf("FCM token not found in redis: %v", err))
		return fmt.Errorf("FCM token not found for user %s", req.UserID)
	}

	var pushErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		_, pushErr = c.SendPush(ctx, tokenVal, req.Title, req.Body, map[string]string{
			"type": req.Type,
		})
		if pushErr == nil {
			c.logSuccessfulDelivery(ctx, req)
			return nil
		}
		if attempt < maxRetries-1 {
			backoff := time.Duration(math.Pow(2, float64(attempt))) * time.Second
			time.Sleep(backoff)
		}
	}

	c.logFailedDelivery(ctx, req, pushErr)
	return fmt.Errorf("failed to send push after %d retries: %w", maxRetries, pushErr)
}

func (c *FCMClient) logSuccessfulDelivery(ctx context.Context, req PushRequest) {
	if c.db == nil {
		return
	}
	q := `INSERT INTO notifications (id, user_id, title, message, type, metadata, is_read, status, created_at)
          VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, false, 'sent', NOW())`
	_, err := c.db.Exec(ctx, q, uuid.New().String(), req.UserID, req.Title, req.Body, req.Type)
	if err != nil {
		log.Printf("FCMClient error: failed to log successful delivery to notifications table: %v", err)
	}
}

func (c *FCMClient) logFailedDelivery(ctx context.Context, req PushRequest, lastErr error) {
	if c.db == nil {
		log.Printf("FCMClient warning: db not configured, cannot log failed delivery for user %s: %v", req.UserID, lastErr)
		return
	}

	q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, status, created_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, false, 'failed', NOW())`
	
	errMsg := "unknown error"
	if lastErr != nil {
		errMsg = lastErr.Error()
	}
	metaStr := fmt.Sprintf(`{"error": %q}`, errMsg)
	
	_, err := c.db.Exec(ctx, q, req.UserID, req.Title, req.Body, req.Type, metaStr)
	if err != nil {
		log.Printf("FCMClient error: failed to log failed delivery to notifications table: %v", err)
	}
}
