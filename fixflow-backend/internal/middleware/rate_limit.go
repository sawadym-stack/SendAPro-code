package middleware

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// RateLimitInterceptor enforces a Redis-backed token bucket per user ID.
func RateLimitInterceptor(rdb *redis.Client, capacity int, refillPerSecond float64) grpc.UnaryServerInterceptor {
	script := redis.NewScript(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsed = math.max(0, now - ts)
local replenished = elapsed * refill
tokens = math.min(capacity, tokens + replenished)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "ts", now)
redis.call("EXPIRE", key, 3600)
return {allowed, tokens}
`)

	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		uid := UserIDFromContext(ctx)
		if uid == "" {
			uid = "anonymous"
		}
		key := fmt.Sprintf("ratelimit:tb:%s", uid)
		now := float64(time.Now().Unix())

		res, err := script.Run(ctx, rdb, []string{key}, now, capacity, refillPerSecond).Result()
		if err != nil {
			log.Printf("Warning: Rate limiter failed to contact Redis (%v). Proceeding (fail-open).", err)
			return handler(ctx, req)
		}
		vals, ok := res.([]interface{})
		if !ok || len(vals) < 1 {
			return nil, status.Error(codes.Internal, "invalid rate limiter response")
		}
		if vals[0].(int64) == 0 {
			return nil, status.Error(codes.ResourceExhausted, "rate limit exceeded")
		}
		return handler(ctx, req)
	}
}
