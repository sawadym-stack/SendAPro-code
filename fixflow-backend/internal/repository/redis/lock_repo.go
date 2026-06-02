package redisrepo

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type LockRepository struct {
	rdb *redis.Client
}

func NewLockRepository(rdb *redis.Client) *LockRepository {
	return &LockRepository{rdb: rdb}
}

func (r *LockRepository) AcquireJobLock(ctx context.Context, jobID string) (bool, error) {
	return r.rdb.SetNX(ctx, "job:lock:"+jobID, "1", 30*time.Second).Result()
}

func (r *LockRepository) ReleaseJobLock(ctx context.Context, jobID string) error {
	return r.rdb.Del(ctx, "job:lock:"+jobID).Err()
}
