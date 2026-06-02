package review

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	reviewv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/review/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	reviewdomain "github.com/yourname/fixflow-backend/internal/domain/review"
	userdomain "github.com/yourname/fixflow-backend/internal/domain/user"
	"github.com/yourname/fixflow-backend/internal/middleware"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
)

type Server struct {
	reviewv1.UnimplementedReviewServiceServer
	reviewRepo reviewdomain.Repository
	jobRepo    jobdomain.Repository
	userRepo   userdomain.UserRepository
	db         *pgxpool.Pool
	fcmClient  *firebase.FCMClient
	pubsubRepo redisrepo.PubSubRepo
}

func NewServer(
	reviewRepo reviewdomain.Repository,
	jobRepo jobdomain.Repository,
	userRepo userdomain.UserRepository,
	db *pgxpool.Pool,
	fcmClient *firebase.FCMClient,
	pubsubRepo redisrepo.PubSubRepo,
) *Server {
	return &Server{
		reviewRepo: reviewRepo,
		jobRepo:    jobRepo,
		userRepo:   userRepo,
		db:         db,
		fcmClient:  fcmClient,
		pubsubRepo: pubsubRepo,
	}
}

func (s *Server) SubmitReview(ctx context.Context, req *reviewv1.SubmitReviewRequest) (*reviewv1.SubmitReviewResponse, error) {
	reviewerID := middleware.UserIDFromContext(ctx)
	if reviewerID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	// 1. Validation: Fetch job, must exist and status = Completed
	job, err := s.jobRepo.GetByID(ctx, req.JobId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "job not found: %v", err)
	}
	if job.Status != jobdomain.StatusCompleted {
		return nil, status.Error(codes.AlreadyExists, "job not completed")
	}

	// 2. Reviewer must be customer or technician of this job
	var reviewerRole string
	if job.CustomerID == reviewerID {
		reviewerRole = "customer"
	} else {
		// Resolve technician user ID from tech profile ID
		var techUserID string
		if s.db != nil {
			_ = s.db.QueryRow(ctx, "SELECT user_id FROM technicians WHERE id = $1 OR user_id = $1", job.TechnicianID).Scan(&techUserID)
		}
		if job.TechnicianID == reviewerID || techUserID == reviewerID {
			reviewerRole = "technician"
		}
	}

	if reviewerRole == "" {
		return nil, status.Error(codes.PermissionDenied, "user is not a participant of this job")
	}

	// 3. Job must be paid before a review is allowed
	var isPaid bool
	if s.db != nil {
		_ = s.db.QueryRow(ctx, "SELECT COALESCE(is_paid, false) FROM jobs WHERE id = $1", req.JobId).Scan(&isPaid)
	}
	if !isPaid {
		return nil, status.Error(codes.FailedPrecondition, "job must be paid before submitting a review")
	}

	// 3. Check HasReviewed
	hasReviewed, err := s.reviewRepo.HasReviewed(ctx, req.JobId, reviewerID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to check review status: %v", err)
	}
	if hasReviewed {
		return nil, status.Error(codes.AlreadyExists, "already reviewed")
	}

	// 4. Rating must be 1-5
	if req.Rating < 1 || req.Rating > 5 {
		return nil, status.Error(codes.InvalidArgument, "rating must be between 1 and 5")
	}

	// 5. Image URLs validation
	for _, url := range req.ImageUrls {
		if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
			return nil, status.Error(codes.InvalidArgument, "invalid image url format")
		}
	}

	// Fetch reviewer name
	reviewerUser, err := s.userRepo.GetByID(ctx, reviewerID)
	reviewerName := "Anonymous"
	if err == nil && reviewerUser != nil {
		reviewerName = reviewerUser.Name
	}

	// Save review
	saved, err := s.reviewRepo.SubmitReview(ctx, reviewdomain.Review{
		JobID:      req.JobId,
		ReviewerID: reviewerID,
		RevieweeID: req.RevieweeId,
		Rating:     int(req.Rating),
		Comment:    req.Comment,
		ImageURLs:  req.ImageUrls,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save review: %v", err)
	}

	// Notify reviewee via FCM
	if s.fcmClient != nil {
		go func() {
			reqPush := firebase.PushRequest{
				UserID: req.RevieweeId,
				Title:  "New Review Received",
				Body:   fmt.Sprintf("%s gave you %d stars", reviewerName, req.Rating),
				Type:   "review",
			}
			if err := s.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3); err != nil {
				log.Printf("[FCM] Error sending review notification: %v", err)
			}
		}()
	}

	// Publish WS event to reviewee room
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
		Type:   "review_received",
		RoomID: "user:" + req.RevieweeId,
		Payload: map[string]interface{}{
			"reviewerName": reviewerName,
			"rating":       req.Rating,
			"comment":      req.Comment,
			"jobId":        req.JobId,
		},
	})

	return &reviewv1.SubmitReviewResponse{
		Review: &reviewv1.ReviewPB{
			Id:           saved.ID,
			JobId:        saved.JobID,
			ReviewerId:   saved.ReviewerID,
			RevieweeId:   saved.RevieweeID,
			ReviewerName: reviewerName,
			Rating:       int32(saved.Rating),
			Comment:      saved.Comment,
			ImageUrls:    saved.ImageURLs,
			CreatedAt:    saved.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

func (s *Server) GetReviews(ctx context.Context, req *reviewv1.GetReviewsRequest) (*reviewv1.GetReviewsResponse, error) {
	list, total, err := s.reviewRepo.GetReviews(ctx, req.RevieweeId, int(req.Page), int(req.Limit))
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get reviews: %v", err)
	}

	avg, count, err := s.reviewRepo.GetAverageRating(ctx, req.RevieweeId)
	if err != nil {
		avg = 0.0
		count = 0
	}

	pbList := make([]*reviewv1.ReviewPB, 0, len(list))
	for _, r := range list {
		pbList = append(pbList, &reviewv1.ReviewPB{
			Id:           r.ID,
			JobId:        r.JobID,
			ReviewerId:   r.ReviewerID,
			RevieweeId:   r.RevieweeID,
			ReviewerName: r.ReviewerName,
			Rating:       int32(r.Rating),
			Comment:      r.Comment,
			ImageUrls:    r.ImageURLs,
			CreatedAt:    r.CreatedAt.Format(time.RFC3339),
		})
	}

	return &reviewv1.GetReviewsResponse{
		Reviews:       pbList,
		Total:         int32(total),
		AverageRating: avg,
		TotalRatings:  int32(count),
	}, nil
}
