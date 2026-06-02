package redisrepo

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
)

// PubSubRepo defines the interface for publishing and subscribing to rooms via Redis.
type PubSubRepo interface {
	Publish(ctx context.Context, channel string, event websocket.WSEvent) error
	Subscribe(ctx context.Context, channel string) *redis.PubSub
}

// RedisPubSubRepo implements PubSubRepo using a standard go-redis Client.
type RedisPubSubRepo struct {
	rdb *redis.Client
}

// NewRedisPubSubRepo creates a new RedisPubSubRepo.
func NewRedisPubSubRepo(rdb *redis.Client) *RedisPubSubRepo {
	return &RedisPubSubRepo{rdb: rdb}
}

// Publish serializes and publishes a WSEvent to the specified Redis channel.
func (r *RedisPubSubRepo) Publish(ctx context.Context, channel string, event websocket.WSEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return r.rdb.Publish(ctx, channel, payload).Err()
}

// Subscribe returns a PubSub subscriber for the specified Redis channel.
func (r *RedisPubSubRepo) Subscribe(ctx context.Context, channel string) *redis.PubSub {
	return r.rdb.Subscribe(ctx, channel)
}
