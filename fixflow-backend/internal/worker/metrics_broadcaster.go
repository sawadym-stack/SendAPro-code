package worker

import (
	"context"
	"time"

	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	analyticsuc "github.com/yourname/fixflow-backend/internal/usecase/analytics"
)

func RunMetricsBroadcaster(uc analyticsuc.Usecase, pubsubRepo redisrepo.PubSubRepo) {
	ticker := time.NewTicker(30 * time.Second)
	ctx := context.Background()
	for range ticker.C {
		stats, err := uc.GetOverview(ctx)
		if err != nil {
			continue
		}
		_ = pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
			Type:    "metrics_update",
			RoomID:  "admin:all",
			Payload: stats,
		})
	}
}
