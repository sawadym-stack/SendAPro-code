package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
)

func RunSchedulerWorker(
	ctx context.Context,
	rdb *redis.Client,
	jobRepo jobdomain.Repository,
	fcmClient *firebase.FCMClient,
	db *pgxpool.Pool,
	geoRepo *redisrepo.GeoRepository,
	pubsubRepo redisrepo.PubSubRepo,
) {
	now := time.Now()
	reminderTime := now.Add(15 * time.Minute)

	// Get jobs scheduled within next 15 minutes
	results, err := rdb.ZRangeByScore(ctx, "job:scheduled", &redis.ZRangeBy{
		Min: "-inf",
		Max: fmt.Sprintf("%d", reminderTime.Unix()),
	}).Result()
	if err != nil {
		log.Printf("[Scheduler Worker] Redis error querying scheduled jobs: %v", err)
		return
	}

	for _, jobID := range results {
		// Check reminder not already sent
		exists, err := rdb.Exists(ctx, "reminder:sent:"+jobID).Result()
		if err != nil || exists > 0 {
			continue
		}

		job, err := jobRepo.GetByID(ctx, jobID)
		if err != nil || job == nil {
			continue
		}

		// Ensure status is Scheduled
		if job.Status != jobdomain.StatusScheduled {
			// Clean up from Redis if already assigned or cancelled
			_ = rdb.ZRem(ctx, "job:scheduled", jobID).Err()
			continue
		}

		// Send reminder push notification to customer
		if fcmClient != nil {
			reqPush := firebase.PushRequest{
				UserID: job.CustomerID,
				Title:  "Upcoming Booking Reminder",
				Body:   fmt.Sprintf("Your scheduled %s starts in 15 minutes", job.ServiceType),
				Type:   "reminder",
			}
			if err := fcmClient.SendPushWithRetry(context.Background(), reqPush, 3); err != nil {
				log.Printf("[Scheduler Worker] Failed to send reminder: %v", err)
			}
		}

		// Mark reminder as sent in Redis (expires in 20 minutes)
		_ = rdb.Set(ctx, "reminder:sent:"+jobID, "1", 20*time.Minute).Err()

		// Update database scheduled_jobs table
		_, _ = db.Exec(ctx, "UPDATE scheduled_jobs SET reminder_sent=true WHERE job_id=$1", jobID)

		// Find and notify 3 nearby online technicians
		techs, err := geoRepo.NearbyTechnicians(ctx, job.Latitude, job.Longitude, 25.0, job.ServiceType, 3)
		if err == nil {
			for _, tech := range techs {
				var userID string
				err = db.QueryRow(ctx, "SELECT user_id::text FROM technicians WHERE id = $1", tech.TechnicianID).Scan(&userID)
				if err != nil {
					continue
				}

				// Publish WS booking_request event
				_ = pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
					Type:   "booking_request",
					RoomID: "user:" + userID,
					Payload: map[string]interface{}{
						"jobId":        job.ID,
						"serviceType":  job.ServiceType,
						"description":  job.Description,
						"urgency":      job.Urgency,
						"scheduled":    true,
						"scheduledAt":  job.ScheduledAt.Format(time.RFC3339),
					},
				})
			}
		}
	}
}
