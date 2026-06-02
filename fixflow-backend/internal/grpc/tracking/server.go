package tracking

import (
	"context"
	"fmt"
	"io"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	pb "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/tracking/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	"github.com/yourname/fixflow-backend/internal/domain/job"
	"github.com/yourname/fixflow-backend/internal/metrics"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
	postgres "github.com/yourname/fixflow-backend/internal/repository/postgres"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/pkg/utils"
)

// Server implements the TrackingService gRPC server.
type Server struct {
	pb.UnimplementedTrackingServiceServer
	db           *pgxpool.Pool
	geoRepo      *redisrepo.GeoRepository
	redis        *redis.Client
	jobRepo      *postgres.JobRepository
	pubsubRepo   redisrepo.PubSubRepo
	fcmClient    *firebase.FCMClient
	tokenManager *token.Manager
}

// NewServer creates a new Tracking gRPC Server.
func NewServer(
	db *pgxpool.Pool,
	geoRepo *redisrepo.GeoRepository,
	redis *redis.Client,
	jobRepo *postgres.JobRepository,
	pubsubRepo redisrepo.PubSubRepo,
	fcmClient *firebase.FCMClient,
	tokenManager *token.Manager,
) *Server {
	return &Server{
		db:           db,
		geoRepo:      geoRepo,
		redis:        redis,
		jobRepo:      jobRepo,
		pubsubRepo:   pubsubRepo,
		fcmClient:    fcmClient,
		tokenManager: tokenManager,
	}
}

// StreamLocation handles the bidirectional stream of location updates from technicians.
func (s *Server) StreamLocation(stream pb.TrackingService_StreamLocationServer) error {
	metrics.GRPCStreamActive.Inc()
	defer metrics.GRPCStreamActive.Dec()

	ctx := stream.Context()

	// 1. Authenticate and extract user ID from JWT claims
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		// Fallback: extract manually from metadata if the interceptor hasn't run or wasn't configured
		md, ok := metadata.FromIncomingContext(ctx)
		if ok {
			if vals := md.Get("authorization"); len(vals) > 0 {
				parts := strings.SplitN(vals[0], " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
					claims, err := s.tokenManager.Parse(parts[1])
					if err == nil {
						userID = claims.UserID
					}
				}
			}
		}
	}

	if userID == "" {
		return status.Error(codes.Unauthenticated, "unauthenticated request")
	}

	// 2. Resolve and verify the technician UUID associated with the user ID
	var techID string
	err := s.db.QueryRow(ctx, "SELECT id FROM technicians WHERE user_id = $1", userID).Scan(&techID)
	if err != nil {
		// Fallback in case they log in with technician UUID directly
		err = s.db.QueryRow(ctx, "SELECT id FROM technicians WHERE id = $1", userID).Scan(&techID)
		if err != nil {
			return status.Error(codes.PermissionDenied, "authenticated user is not a registered technician")
		}
	}

	// 3. Receive loop
	for {
		update, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("stream recv error: %v", err))
		}

		// Update database and Redis GEO index
		if err := s.geoRepo.UpdateLocation(ctx, techID, update.GetLat(), update.GetLng()); err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("failed to update geo repository: %v", err))
		}

		// Store latest position details in a Redis Hash
		redisKey := "tech:location:" + techID
		err = s.redis.HSet(ctx, redisKey,
			"lat", fmt.Sprintf("%f", update.GetLat()),
			"lng", fmt.Sprintf("%f", update.GetLng()),
			"timestamp", time.Now().Unix(),
			"jobId", update.GetJobId(),
		).Err()
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("failed to set location cache hash: %v", err))
		}
		s.redis.Expire(ctx, redisKey, 24*time.Hour)

		// Fetch job details to get customer destination coordinates
		jobEntity, err := s.jobRepo.GetByID(ctx, update.GetJobId())
		if err != nil {
			return status.Error(codes.NotFound, fmt.Sprintf("job not found: %v", err))
		}

		// Calculate ETA and Distance
		distKm := utils.Haversine(update.GetLat(), update.GetLng(), jobEntity.Latitude, jobEntity.Longitude)
		etaMin := utils.CalculateETA(distKm)

		// Check for technician arrival (under 50 meters)
		if distKm < 0.05 {
			s.notifyArrival(ctx, update.GetJobId(), techID)
		}

		// Publish room update via Redis Pub/Sub to reach WebSocket clients
		event := websocket.WSEvent{
			Type:   "location_update",
			RoomID: "job:" + update.GetJobId(),
			Payload: map[string]interface{}{
				"lat":    update.GetLat(),
				"lng":    update.GetLng(),
				"eta":    etaMin,
				"distKm": distKm,
			},
		}
		if pubErr := s.pubsubRepo.Publish(ctx, "ws:rooms", event); pubErr != nil {
			log.Printf("[Tracking Server] Redis pubsub publish error: %v", pubErr)
		}

		// Return broadcast acknowledgement to the stream caller
		err = stream.Send(&pb.LocationBroadcast{
			Lat:        update.GetLat(),
			Lng:        update.GetLng(),
			EtaMinutes: int32(etaMin),
			DistanceKm: float32(distKm),
		})
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("failed to send acknowledgment broadcast: %v", err))
		}
	}
}

// GetLatestLocation returns the last reported location details of a technician assigned to a job.
func (s *Server) GetLatestLocation(ctx context.Context, req *pb.GetLatestLocationRequest) (*pb.GetLatestLocationResponse, error) {
	var techID string
	err := s.db.QueryRow(ctx, "SELECT technician_id FROM jobs WHERE id = $1", req.GetJobId()).Scan(&techID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "job not found")
	}
	if techID == "" {
		return nil, status.Error(codes.FailedPrecondition, "no technician assigned to this job")
	}

	vals, err := s.redis.HMGet(ctx, "tech:location:"+techID, "lat", "lng", "timestamp").Result()
	if err != nil || len(vals) != 3 || vals[0] == nil || vals[1] == nil {
		return nil, status.Error(codes.NotFound, "no location history found for this technician")
	}

	lat, _ := strconv.ParseFloat(vals[0].(string), 64)
	lng, _ := strconv.ParseFloat(vals[1].(string), 64)

	recordedAtStr := ""
	if vals[2] != nil {
		ts, _ := strconv.ParseInt(vals[2].(string), 10, 64)
		recordedAtStr = time.Unix(ts, 0).Format(time.RFC3339)
	}

	return &pb.GetLatestLocationResponse{
		JobId:      req.GetJobId(),
		Latitude:   lat,
		Longitude:  lng,
		RecordedAt: recordedAtStr,
	}, nil
}

// GetNearbyTechnicians searches and returns verified, online technicians matching a service type within a radius.
func (s *Server) GetNearbyTechnicians(ctx context.Context, req *pb.GetNearbyTechniciansRequest) (*pb.GetNearbyTechniciansResponse, error) {
	res, err := s.geoRepo.NearbyTechnicians(ctx, req.GetLat(), req.GetLng(), req.GetRadiusKm(), req.GetServiceType(), 100)
	if err != nil {
		return nil, status.Error(codes.Internal, fmt.Sprintf("failed to fetch nearby technicians: %v", err))
	}

	var techs []*pb.NearbyTechnician
	for _, hit := range res {
		techs = append(techs, &pb.NearbyTechnician{
			TechnicianId: hit.TechnicianID,
			Lat:          hit.Latitude,
			Lng:          hit.Longitude,
			DistanceKm:   hit.DistanceKm,
		})
	}

	return &pb.GetNearbyTechniciansResponse{Technicians: techs}, nil
}

// notifyArrival handles transitions, local pub/sub, and push notification triggers upon technician arrival.
func (s *Server) notifyArrival(ctx context.Context, jobID, techID string) {
	notifiedKey := "arrival:notified:" + jobID
	set, err := s.redis.SetNX(ctx, notifiedKey, "true", 24*time.Hour).Result()
	if err != nil || !set {
		return
	}

	// 1. Update Job status to Arrived
	if err := s.jobRepo.UpdateStatus(ctx, jobID, job.StatusArrived, techID); err != nil {
		log.Printf("[Tracking Server] notifyArrival error: failed to update job status to Arrived: %v", err)
		return
	}
	_ = s.redis.Del(ctx, "analytics:overview").Err()

	// 2. Publish WSEvent to Redis pub/sub
	event := websocket.WSEvent{
		Type:   "job_status",
		RoomID: "job:" + jobID,
		Payload: map[string]interface{}{
			"status": "Arrived",
		},
	}
	if pubErr := s.pubsubRepo.Publish(ctx, "ws:rooms", event); pubErr != nil {
		log.Printf("[Tracking Server] notifyArrival error: failed to publish job status event: %v", pubErr)
	}

	// 3. Send FCM push notification to the customer
	jobEntity, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		log.Printf("[Tracking Server] notifyArrival error: failed to retrieve job %s: %v", jobID, err)
		return
	}

	if s.fcmClient != nil {
		pushErr := s.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
			UserID: jobEntity.CustomerID,
			Title:  "Your technician has arrived!",
			Body:   "Your technician has arrived!",
			Type:   "arrival",
		}, 3)
		if pushErr != nil {
			log.Printf("[Tracking Server] notifyArrival error: FCM push failed: %v", pushErr)
		} else {
			log.Printf("[Tracking Server] notifyArrival success: FCM push sent to customer %s", jobEntity.CustomerID)
		}
	} else {
		log.Printf("[Tracking Server] notifyArrival info: FCM push skipped (client not initialized)")
	}
}
