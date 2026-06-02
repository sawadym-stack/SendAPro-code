package emergency

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
)

type EmergencyRequest struct {
	CustomerID   string
	CustomerName string
	ServiceType  string
	Description  string
	Lat          float64
	Lng          float64
}

type Usecase interface {
	CreateEmergency(ctx context.Context, req EmergencyRequest) (*jobdomain.Job, error)
}

type usecase struct {
	db          *pgxpool.Pool
	redisClient *redis.Client
	jobRepo     jobdomain.Repository
	geoRepo     *redisrepo.GeoRepository
	fcmClient   *firebase.FCMClient
	pubsubRepo  redisrepo.PubSubRepo
}

func NewUsecase(
	db *pgxpool.Pool,
	redisClient *redis.Client,
	jobRepo jobdomain.Repository,
	geoRepo *redisrepo.GeoRepository,
	fcmClient *firebase.FCMClient,
	pubsubRepo redisrepo.PubSubRepo,
) Usecase {
	return &usecase{
		db:          db,
		redisClient: redisClient,
		jobRepo:     jobRepo,
		geoRepo:     geoRepo,
		fcmClient:   fcmClient,
		pubsubRepo:  pubsubRepo,
	}
}

func (u *usecase) CreateEmergency(ctx context.Context, req EmergencyRequest) (*jobdomain.Job, error) {
	// Step 1: Create job with emergency flags
	job := &jobdomain.Job{
		CustomerID:  req.CustomerID,
		ServiceType: req.ServiceType,
		Description: req.Description,
		Latitude:    req.Lat,
		Longitude:   req.Lng,
		Urgency:     "Emergency",
		IsEmergency: true,
		Status:      jobdomain.StatusRequested,
	}
	if err := u.jobRepo.Create(ctx, job); err != nil {
		return nil, err
	}

	// Step 2: Add to Redis priority queue
	score := float64(time.Now().Unix()) * 10
	err := u.redisClient.ZAdd(ctx, "emergency:queue", redis.Z{
		Score:  score,
		Member: job.ID,
	}).Err()
	if err != nil {
		log.Printf("[Emergency Usecase] Failed to add to priority queue: %v", err)
	}

	// Step 3: Find 5 nearest online technicians
	techLocations, err := u.geoRepo.NearbyTechnicians(ctx, req.Lat, req.Lng, 25.0, req.ServiceType, 5)
	if err != nil {
		log.Printf("[Emergency Usecase] Failed to scan nearby technicians: %v", err)
	}

	// Step 4: Notify each technician in parallel goroutines
	var wg sync.WaitGroup
	for _, tl := range techLocations {
		wg.Add(1)
		go func(techID string) {
			defer wg.Done()

			// Resolve tech's user ID from database
			var userID string
			err := u.db.QueryRow(ctx, "SELECT user_id::text FROM technicians WHERE id = $1", techID).Scan(&userID)
			if err != nil {
				log.Printf("[Emergency Usecase] Failed to resolve user ID for tech %s: %v", techID, err)
				return
			}

			// FCM push notification (high priority)
			if u.fcmClient != nil {
				reqPush := firebase.PushRequest{
					UserID: userID,
					Title:  "EMERGENCY Request",
					Body:   fmt.Sprintf("%s needed urgently nearby", req.ServiceType),
					Type:   "emergency",
				}
				if err := u.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3); err != nil {
					log.Printf("[Emergency Usecase] Push failed for user %s: %v", userID, err)
				}
			}

			// WS booking_request event
			_ = u.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
				Type:   "booking_request",
				RoomID: "user:" + userID,
				Payload: map[string]interface{}{
					"jobId":        job.ID,
					"serviceType":  job.ServiceType,
					"description":  job.Description,
					"urgency":      "EMERGENCY",
					"isEmergency":  true,
					"lat":          job.Latitude,
					"lng":          job.Longitude,
					"customerName": req.CustomerName,
				},
			})
		}(tl.TechnicianID)
	}
	wg.Wait()

	// Step 5: Return job immediately (don't wait for acceptance)
	return job, nil
}
