package redisrepo

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type AvailabilityRepository struct {
	rdb *redis.Client
}

func NewAvailabilityRepository(rdb *redis.Client) *AvailabilityRepository {
	return &AvailabilityRepository{rdb: rdb}
}

func (r *AvailabilityRepository) SetAvailability(ctx context.Context, techID, status string) error {
	key := "tech:availability:" + techID
	if err := r.rdb.HSet(ctx, key, "status", status).Err(); err != nil {
		return err
	}
	if status == "Online" {
		return r.rdb.SAdd(ctx, "tech:online", techID).Err()
	}
	return r.rdb.SRem(ctx, "tech:online", techID).Err()
}

func (r *AvailabilityRepository) GetAvailability(ctx context.Context, techID string) (string, error) {
	return r.rdb.HGet(ctx, "tech:availability:"+techID, "status").Result()
}

func (r *AvailabilityRepository) ListOnlineTechnicians(ctx context.Context) ([]string, error) {
	return r.rdb.SMembers(ctx, "tech:online").Result()
}
