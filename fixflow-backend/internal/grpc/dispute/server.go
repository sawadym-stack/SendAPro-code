package dispute

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	disputev1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/dispute/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	disputedomain "github.com/yourname/fixflow-backend/internal/domain/dispute"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	paymentdomain "github.com/yourname/fixflow-backend/internal/domain/payment"
	"github.com/yourname/fixflow-backend/internal/middleware"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	"github.com/yourname/fixflow-backend/infrastructure/razorpay"
)

type Server struct {
	disputev1.UnimplementedDisputeServiceServer
	db             *pgxpool.Pool
	disputeRepo    disputedomain.Repository
	jobRepo        jobdomain.Repository
	paymentRepo    paymentdomain.PaymentRepository
	razorpayClient *razorpay.RazorpayClient
	fcmClient      *firebase.FCMClient
	pubsubRepo     redisrepo.PubSubRepo
}

func NewServer(
	db *pgxpool.Pool,
	disputeRepo disputedomain.Repository,
	jobRepo jobdomain.Repository,
	paymentRepo paymentdomain.PaymentRepository,
	razorpayClient *razorpay.RazorpayClient,
	fcmClient *firebase.FCMClient,
	pubsubRepo redisrepo.PubSubRepo,
) *Server {
	return &Server{
		db:             db,
		disputeRepo:    disputeRepo,
		jobRepo:        jobRepo,
		paymentRepo:    paymentRepo,
		razorpayClient: razorpayClient,
		fcmClient:      fcmClient,
		pubsubRepo:     pubsubRepo,
	}
}

func (s *Server) RaiseDispute(ctx context.Context, req *disputev1.RaiseDisputeRequest) (*disputev1.RaiseDisputeResponse, error) {
	raisedByID := middleware.UserIDFromContext(ctx)
	if raisedByID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	// 1. Validation: Fetch job, must exist
	job, err := s.jobRepo.GetByID(ctx, req.JobId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "job not found: %v", err)
	}

	// 2. Job status must be Completed
	if job.Status != jobdomain.StatusCompleted {
		return nil, status.Error(codes.FailedPrecondition, "job status must be Completed to raise a dispute")
	}

	// 3. Dispute must be raised within 7 days of job completion
	if job.CompletedAt != nil {
		if time.Since(*job.CompletedAt) > 7*24*time.Hour {
			return nil, status.Error(codes.FailedPrecondition, "dispute window closed (7 days after completion)")
		}
	}

	// 4. Job must have a captured payment before a dispute can be raised
	payment, payErr := s.paymentRepo.GetPaymentByJobID(ctx, req.JobId)
	if payErr != nil || payment.Status != paymentdomain.Captured {
		return nil, status.Error(codes.FailedPrecondition, "payment required before raising dispute")
	}

	// 5. RaisedBy must be customer or technician of this job
	var isCustomer = job.CustomerID == raisedByID
	var isTechnician = job.TechnicianID == raisedByID
	if !isCustomer && !isTechnician {
		return nil, status.Error(codes.PermissionDenied, "user is not a participant of this job")
	}

	// 6. Check no existing Open/UnderReview dispute for this job
	existingDisputes, _, err := s.disputeRepo.ListDisputes(ctx, disputedomain.DisputeFilter{
		JobID:   req.JobId,
		Limit:   100,
		IsAdmin: true,
	})
	if err == nil {
		for _, d := range existingDisputes {
			if d.Status == disputedomain.StatusOpen || d.Status == disputedomain.StatusUnderReview {
				return nil, status.Error(codes.AlreadyExists, "dispute already exists for this job")
			}
		}
	}

	// Determine againstID
	var againstID string
	if isCustomer {
		againstID = job.TechnicianID
	} else {
		againstID = job.CustomerID
	}

	// Save dispute
	saved, err := s.disputeRepo.CreateDispute(ctx, disputedomain.Dispute{
		JobID:       req.JobId,
		RaisedByID:  raisedByID,
		AgainstID:   againstID,
		Reason:      disputedomain.DisputeReason(req.Reason),
		Description: req.Description,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to raise dispute: %v", err)
	}

	// Fetch admin list
	var adminUserID string
	_ = s.db.QueryRow(ctx, "SELECT id::text FROM users WHERE role = 'admin' LIMIT 1").Scan(&adminUserID)

	shortJobID := req.JobId
	if len(shortJobID) > 8 {
		shortJobID = shortJobID[0:8]
	}

	// Notify admin via FCM
	if adminUserID != "" && s.fcmClient != nil {
		go func() {
			reqPush := firebase.PushRequest{
				UserID: adminUserID,
				Title:  "New Dispute Filed",
				Body:   fmt.Sprintf("%s — Job #%s", req.Reason, shortJobID),
				Type:   "dispute",
			}
			_ = s.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3)
		}()
	}

	// Save persistent notifications for admin and opponent
	if adminUserID != "" {
		s.createNotificationHelper(ctx, adminUserID, "New Dispute Raised", fmt.Sprintf("A new dispute was raised for job #%s: %s", shortJobID, req.Reason), "dispute")
	}
	s.createNotificationHelper(ctx, againstID, "Dispute Filed Against Job", fmt.Sprintf("A dispute has been raised against job #%s.", shortJobID), "dispute")

	// Publish WS event to admin room
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
		Type:   "new_dispute",
		RoomID: "admin:all",
		Payload: map[string]interface{}{
			"disputeId": saved.ID,
			"reason":    saved.Reason,
			"jobId":     saved.JobID,
		},
	})

	return &disputev1.RaiseDisputeResponse{
		Dispute: &disputev1.DisputePB{
			Id:           saved.ID,
			JobId:        saved.JobID,
			RaisedById:   saved.RaisedByID,
			AgainstId:    saved.AgainstID,
			Reason:      string(saved.Reason),
			Description:  saved.Description,
			EvidenceUrls: saved.EvidenceURLs,
			Status:       string(saved.Status),
			CreatedAt:    saved.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

func (s *Server) UploadEvidence(ctx context.Context, req *disputev1.UploadEvidenceRequest) (*disputev1.UploadEvidenceResponse, error) {
	callerID := middleware.UserIDFromContext(ctx)
	if callerID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	disp, err := s.disputeRepo.GetDispute(ctx, req.DisputeId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "dispute not found: %v", err)
	}

	// Must be dispute raiser
	if disp.RaisedByID != callerID {
		return nil, status.Error(codes.PermissionDenied, "only the dispute raiser can upload evidence")
	}

	// Dispute must not be resolved
	if disp.Status == disputedomain.StatusResolved {
		return nil, status.Error(codes.FailedPrecondition, "cannot upload evidence to a resolved dispute")
	}

	err = s.disputeRepo.AppendEvidence(ctx, req.DisputeId, req.FileUrl)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to append evidence url: %v", err)
	}

	// Reload dispute
	disp, _ = s.disputeRepo.GetDispute(ctx, req.DisputeId)

	return &disputev1.UploadEvidenceResponse{
		Dispute: &disputev1.DisputePB{
			Id:           disp.ID,
			JobId:        disp.JobID,
			RaisedById:   disp.RaisedByID,
			RaisedByName: disp.RaisedByName,
			AgainstId:    disp.AgainstID,
			Reason:      string(disp.Reason),
			Description:  disp.Description,
			EvidenceUrls: disp.EvidenceURLs,
			Status:       string(disp.Status),
			AdminNote:    disp.AdminNote,
			Action:       disp.Action,
			ResolvedAt:   formatTimePtr(disp.ResolvedAt),
			CreatedAt:    disp.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

func (s *Server) ResolveDispute(ctx context.Context, req *disputev1.ResolveDisputeRequest) (*disputev1.ResolveDisputeResponse, error) {
	role := middleware.RoleFromContext(ctx)
	if role != "admin" {
		return nil, status.Error(codes.PermissionDenied, "only admin can resolve disputes")
	}

	disp, err := s.disputeRepo.GetDispute(ctx, req.DisputeId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "dispute not found: %v", err)
	}

	now := time.Now()
	disp.Status = disputedomain.StatusResolved
	disp.AdminNote = req.AdminNote
	disp.Action = req.Action
	disp.ResolvedAt = &now

	// Execute Action
	switch req.Action {
	case "refund":
		p, err := s.paymentRepo.GetPaymentByJobID(ctx, disp.JobID)
		if err == nil && p.Status == paymentdomain.Captured {
			if s.razorpayClient != nil {
				_, refundErr := s.razorpayClient.CreateRefund(ctx, p.RazorpayPaymentID, int(p.Amount*100))
				if refundErr == nil {
					_ = s.paymentRepo.UpdatePaymentStatus(ctx, p.ID, paymentdomain.Refunded, "")
				} else {
					log.Printf("[Razorpay Dispute Resolve] Refund failed: %v", refundErr)
				}
			}
		}
	case "warn":
		// Flag warning in technicians profile
		_, _ = s.db.Exec(ctx, "UPDATE technicians SET review_count = review_count + 1 WHERE user_id = $1", disp.AgainstID)
	case "dismiss":
		// Dismissed, no action
	}

	updated, err := s.disputeRepo.UpdateDispute(ctx, disp)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to resolve dispute in database: %v", err)
	}

	// Save persistent notifications for raiser and opponent
	s.createNotificationHelper(ctx, disp.RaisedByID, "Dispute Resolved", fmt.Sprintf("Your dispute for job #%s has been resolved: %s. Action: %s.", disp.JobID[0:8], disp.AdminNote, disp.Action), "dispute")
	s.createNotificationHelper(ctx, disp.AgainstID, "Dispute Resolved", fmt.Sprintf("The dispute for job #%s has been resolved. Action: %s.", disp.JobID[0:8], disp.Action), "dispute")

	// Notify raiser
	if s.fcmClient != nil {
		go func() {
			reqPush := firebase.PushRequest{
				UserID: disp.RaisedByID,
				Title:  "Dispute Resolved",
				Body:   fmt.Sprintf("Your dispute has been %sd. Note: %s", req.Action, req.AdminNote),
				Type:   "dispute_resolved",
			}
			_ = s.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3)
		}()
	}

	return &disputev1.ResolveDisputeResponse{
		Dispute: &disputev1.DisputePB{
			Id:           updated.ID,
			JobId:        updated.JobID,
			RaisedById:   updated.RaisedByID,
			AgainstId:    updated.AgainstID,
			Reason:      string(updated.Reason),
			Description:  updated.Description,
			EvidenceUrls: updated.EvidenceURLs,
			Status:       string(updated.Status),
			AdminNote:    updated.AdminNote,
			Action:       updated.Action,
			ResolvedAt:   formatTimePtr(updated.ResolvedAt),
			CreatedAt:    updated.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

func (s *Server) GetDisputes(ctx context.Context, req *disputev1.GetDisputesRequest) (*disputev1.GetDisputesResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	role := middleware.RoleFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	isAdmin := role == "admin"

	list, total, err := s.disputeRepo.ListDisputes(ctx, disputedomain.DisputeFilter{
		Status:     req.Status,
		RaisedByID: userID,
		Page:       int(req.Page),
		Limit:      int(req.Limit),
		IsAdmin:    isAdmin,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query disputes: %v", err)
	}

	pbList := make([]*disputev1.DisputePB, 0, len(list))
	for _, d := range list {
		pbList = append(pbList, &disputev1.DisputePB{
			Id:           d.ID,
			JobId:        d.JobID,
			RaisedById:   d.RaisedByID,
			RaisedByName: d.RaisedByName,
			AgainstId:    d.AgainstID,
			Reason:      string(d.Reason),
			Description:  d.Description,
			EvidenceUrls: d.EvidenceURLs,
			Status:       string(d.Status),
			AdminNote:    d.AdminNote,
			Action:       d.Action,
			ResolvedAt:   formatTimePtr(d.ResolvedAt),
			CreatedAt:    d.CreatedAt.Format(time.RFC3339),
		})
	}

	return &disputev1.GetDisputesResponse{
		Disputes: pbList,
		Total:    int32(total),
	}, nil
}

func (s *Server) GetDispute(ctx context.Context, req *disputev1.GetDisputeRequest) (*disputev1.GetDisputeResponse, error) {
	callerID := middleware.UserIDFromContext(ctx)
	role := middleware.RoleFromContext(ctx)
	if callerID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	disp, err := s.disputeRepo.GetDispute(ctx, req.DisputeId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "dispute not found: %v", err)
	}

	// Must be participant or admin
	if role != "admin" && disp.RaisedByID != callerID && disp.AgainstID != callerID {
		return nil, status.Error(codes.PermissionDenied, "permission denied")
	}

	return &disputev1.GetDisputeResponse{
		Dispute: &disputev1.DisputePB{
			Id:           disp.ID,
			JobId:        disp.JobID,
			RaisedById:   disp.RaisedByID,
			RaisedByName: disp.RaisedByName,
			AgainstId:    disp.AgainstID,
			Reason:      string(disp.Reason),
			Description:  disp.Description,
			EvidenceUrls: disp.EvidenceURLs,
			Status:       string(disp.Status),
			AdminNote:    disp.AdminNote,
			Action:       disp.Action,
			ResolvedAt:   formatTimePtr(disp.ResolvedAt),
			CreatedAt:    disp.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

func formatTimePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

func (s *Server) createNotificationHelper(ctx context.Context, userID, title, message, typ string) {
	q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at) 
	      VALUES ($1,$2,$3,$4,'{}',false,NOW()) RETURNING id, created_at`
	var notifID string
	var createdAt time.Time
	err := s.db.QueryRow(ctx, q, userID, title, message, typ).Scan(&notifID, &createdAt)
	if err != nil {
		log.Printf("[Dispute Server] failed to create DB notification: %v", err)
		return
	}

	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
		Type:   "notification",
		RoomID: "user:" + userID,
		Payload: map[string]interface{}{
			"id":        notifID,
			"userId":    userID,
			"title":     title,
			"message":   message,
			"type":      typ,
			"isRead":    false,
			"createdAt": createdAt.Format(time.RFC3339),
		},
	})
}
