package payment

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	paymentv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/payment/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	paymentdomain "github.com/yourname/fixflow-backend/internal/domain/payment"
	userdomain "github.com/yourname/fixflow-backend/internal/domain/user"
	"github.com/yourname/fixflow-backend/internal/middleware"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	"github.com/yourname/fixflow-backend/infrastructure/razorpay"
	"github.com/yourname/fixflow-backend/infrastructure/storage"
	"github.com/yourname/fixflow-backend/pkg/pdf"
)

type Server struct {
	paymentv1.UnimplementedPaymentServiceServer
	db             *pgxpool.Pool
	redis          *redis.Client
	paymentRepo    paymentdomain.PaymentRepository
	invoiceRepo    paymentdomain.InvoiceRepository
	jobRepo        jobdomain.Repository
	userRepo       userdomain.UserRepository
	razorpayClient *razorpay.RazorpayClient
	s3Client       *storage.S3Client
	fcmClient      *firebase.FCMClient
	pubsubRepo     redisrepo.PubSubRepo
	razorpayKeyID  string
}

func NewServer(
	db *pgxpool.Pool,
	redis *redis.Client,
	paymentRepo paymentdomain.PaymentRepository,
	invoiceRepo paymentdomain.InvoiceRepository,
	jobRepo jobdomain.Repository,
	userRepo userdomain.UserRepository,
	razorpayClient *razorpay.RazorpayClient,
	s3Client *storage.S3Client,
	fcmClient *firebase.FCMClient,
	pubsubRepo redisrepo.PubSubRepo,
	razorpayKeyID string,
) *Server {
	return &Server{
		db:             db,
		redis:          redis,
		paymentRepo:    paymentRepo,
		invoiceRepo:    invoiceRepo,
		jobRepo:        jobRepo,
		userRepo:       userRepo,
		razorpayClient: razorpayClient,
		s3Client:       s3Client,
		fcmClient:      fcmClient,
		pubsubRepo:     pubsubRepo,
		razorpayKeyID:  razorpayKeyID,
	}
}

func (s *Server) GenerateInvoice(ctx context.Context, req *paymentv1.GenerateInvoiceRequest) (*paymentv1.GenerateInvoiceResponse, error) {
	callerUserID := middleware.UserIDFromContext(ctx)
	callerRole := middleware.RoleFromContext(ctx)
	if callerUserID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	// Fetch job details
	job, err := s.jobRepo.GetByID(ctx, req.JobId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "job not found: %v", err)
	}

	// Business rule: only Completed jobs can be invoiced
	if job.Status != jobdomain.StatusCompleted {
		return nil, status.Error(codes.FailedPrecondition, "invoice can only be generated for completed jobs")
	}

	// Business rule: only one invoice per job
	_, err = s.invoiceRepo.GetInvoiceByJobID(ctx, req.JobId)
	if err == nil {
		return nil, status.Error(codes.AlreadyExists, "invoice already generated for this job")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, status.Errorf(codes.Internal, "failed to check existing invoice: %v", err)
	}

	// Fetch technician user ID and rating
	var techUserID string
	var techRating float64
	err = s.db.QueryRow(ctx, "SELECT user_id, COALESCE(avg_rating, 0) FROM technicians WHERE id = $1 OR user_id = $1", job.TechnicianID).Scan(&techUserID, &techRating)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "technician not found: %v", err)
	}

	// Validate technician auth (only assigned technician or admin can invoice)
	if callerUserID != techUserID && callerRole != "admin" {
		return nil, status.Error(codes.PermissionDenied, "forbidden: not the assigned technician")
	}

	// Fetch customer user details
	customerUser, err := s.userRepo.GetByID(ctx, job.CustomerID)
	if err != nil || customerUser == nil {
		return nil, status.Errorf(codes.NotFound, "customer not found: %v", err)
	}

	// Fetch technician user details
	techUser, err := s.userRepo.GetByID(ctx, techUserID)
	if err != nil || techUser == nil {
		return nil, status.Errorf(codes.NotFound, "technician user not found: %v", err)
	}

	// Build Line Items
	lineItems := []paymentdomain.InvoiceItem{
		{
			Description: "Labour - " + job.ServiceType,
			Quantity:    1,
			UnitPrice:   req.LabourCharge,
			Total:       req.LabourCharge,
		},
	}

	for _, item := range req.MaterialItems {
		lineItems = append(lineItems, paymentdomain.InvoiceItem{
			Description: item.Description,
			Quantity:    int(item.Quantity),
			UnitPrice:   item.UnitPrice,
			Total:       float64(item.Quantity) * item.UnitPrice,
		})
	}

	if req.LabourCharge < 100 {
		return nil, status.Error(codes.InvalidArgument, "minimum labour charge must be Rs. 100")
	}

	// Calculate totals
	var subtotal float64
	for _, item := range lineItems {
		subtotal += item.Total
	}
	taxAmount := subtotal * 0.18
	total := subtotal + taxAmount

	// Business rule: invoice total must be between Rs.100 and Rs.1,00,000
	const minInvoice = 100.0
	const maxInvoice = 100000.0
	if total < minInvoice {
		return nil, status.Errorf(codes.InvalidArgument, "invoice total Rs.%.2f is below minimum Rs.100", total)
	}
	if total > maxInvoice {
		return nil, status.Errorf(codes.InvalidArgument, "invoice total Rs.%.2f exceeds maximum Rs.1,00,000", total)
	}

	// Build invoice entity
	invoice := paymentdomain.Invoice{
		JobID:        req.JobId,
		CustomerName: customerUser.Name,
		TechName:     techUser.Name,
		ServiceType:  job.ServiceType,
		LineItems:    lineItems,
		Subtotal:     subtotal,
		TaxRate:      0.18,
		TaxAmount:    taxAmount,
		Total:        total,
		CreatedAt:    time.Now(),
	}

	// Fetch job address directly from database as it is not present in job.Job entity
	var jobAddress string
	_ = s.db.QueryRow(ctx, "SELECT address FROM jobs WHERE id = $1", req.JobId).Scan(&jobAddress)
	if jobAddress == "" {
		jobAddress = "Not Specified"
	}

	// Generate PDF
	pdfBytes, err := pdf.GenerateInvoicePDF(invoice, customerUser.Phone, jobAddress, techRating)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate invoice PDF: %v", err)
	}

	// Upload PDF to MinIO
	key := fmt.Sprintf("invoices/%s_%d.pdf", req.JobId, time.Now().Unix())
	pdfURL, err := s3ClientUpload(ctx, s.s3Client, key, pdfBytes)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to upload PDF: %v", err)
	}

	// Generate presigned URL
	presignedURL, err := s.s3Client.GeneratePresignedURL(ctx, key, 24*time.Hour)
	if err != nil {
		presignedURL = pdfURL // Fallback to raw MinIO URL if presigned fails
	}

	invoice.PdfURL = pdfURL
	saved, err := s.invoiceRepo.SaveInvoice(ctx, invoice)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save invoice: %v", err)
	}

	// Save persistent notification + WS dispatch for customer
	s.createNotificationHelper(ctx, job.CustomerID, "New Invoice Generated", fmt.Sprintf("An invoice of Rs.%.2f has been generated for your %s job.", saved.Total, job.ServiceType), "invoice")

	// Map to response protobuf
	pbItems := make([]*paymentv1.InvoiceItemPB, 0, len(saved.LineItems))
	for _, item := range saved.LineItems {
		pbItems = append(pbItems, &paymentv1.InvoiceItemPB{
			Description: item.Description,
			Quantity:    int32(item.Quantity),
			UnitPrice:   item.UnitPrice,
			Total:       item.Total,
		})
	}

	return &paymentv1.GenerateInvoiceResponse{
		InvoiceId: saved.ID,
		PdfUrl:    presignedURL,
		Total:     saved.Total,
		LineItems: pbItems,
	}, nil
}

func (s *Server) CreatePaymentOrder(ctx context.Context, req *paymentv1.CreatePaymentOrderRequest) (*paymentv1.CreatePaymentOrderResponse, error) {
	customerID := middleware.UserIDFromContext(ctx)
	if customerID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	// Idempotency check
	existing, _ := s.paymentRepo.GetPaymentByIdempotencyKey(ctx, req.IdempotencyKey)
	if existing != nil {
		amountPaise := int64(existing.Amount * 100)
		return &paymentv1.CreatePaymentOrderResponse{
			OrderId:  existing.RazorpayOrderID,
			Amount:   amountPaise,
			Currency: existing.Currency,
			KeyId:    s.razorpayKeyID,
		}, nil
	}

	// Fetch job and check status + already-paid
	job, err := s.jobRepo.GetByID(ctx, req.JobId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "job not found: %v", err)
	}
	if job.Status != jobdomain.StatusCompleted {
		return nil, status.Error(codes.FailedPrecondition, "payment can only be initiated for completed jobs")
	}
	// Check if job is already paid (using DB flag)
	var isPaid bool
	_ = s.db.QueryRow(ctx, "SELECT COALESCE(is_paid, false) FROM jobs WHERE id = $1", req.JobId).Scan(&isPaid)
	if isPaid {
		return nil, status.Error(codes.AlreadyExists, "this job has already been paid")
	}

	// Get invoice total
	invoice, err := s.invoiceRepo.GetInvoiceByJobID(ctx, req.JobId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "generate invoice first")
	}
	amountPaise := int(invoice.Total * 100)

	// Resolve technician user ID
	var techUserID string
	err = s.db.QueryRow(ctx, "SELECT user_id FROM technicians WHERE id = $1 OR user_id = $1", job.TechnicianID).Scan(&techUserID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "technician user not resolved: %v", err)
	}

	// Create Razorpay order with unique receipt ID (max 40 chars)
	receiptID := fmt.Sprintf("rcpt_%s_%d", req.JobId[:8], time.Now().Unix())
	order, err := s.razorpayClient.CreateOrder(ctx, amountPaise, "INR", receiptID, map[string]string{"jobId": req.JobId})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "razorpay order creation failed: %v", err)
	}

	// Save payment record
	_, err = s.paymentRepo.CreatePayment(ctx, paymentdomain.Payment{
		JobID:           req.JobId,
		CustomerID:      customerID,
		TechnicianID:    techUserID,
		Amount:          invoice.Total,
		Status:          paymentdomain.Pending,
		RazorpayOrderID: order.ID,
		IdempotencyKey:  req.IdempotencyKey,
		Currency:        "INR",
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save payment record: %v", err)
	}

	return &paymentv1.CreatePaymentOrderResponse{
		OrderId:  order.ID,
		Amount:   int64(amountPaise),
		Currency: "INR",
		KeyId:    s.razorpayKeyID,
	}, nil
}

func (s *Server) VerifyAndCapture(ctx context.Context, req *paymentv1.VerifyAndCaptureRequest) (*paymentv1.VerifyAndCaptureResponse, error) {
	customerID := middleware.UserIDFromContext(ctx)
	if customerID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	// Verify HMAC signature
	valid := s.razorpayClient.VerifyPaymentSignature(req.OrderId, req.PaymentId, req.Signature)
	if !valid {
		return nil, status.Error(codes.Unauthenticated, "invalid payment signature")
	}

	// Update payment status
	_ = s.paymentRepo.UpdatePaymentStatus(ctx, req.OrderId, paymentdomain.Captured, req.PaymentId)
	_ = s.redis.Del(ctx, "analytics:overview").Err()

	// Mark job as paid in DB and create platform fee
	if p, pErr := s.paymentRepo.GetPayment(ctx, req.OrderId); pErr == nil {
		_, _ = s.db.Exec(ctx, "UPDATE jobs SET is_paid = true WHERE id = $1", p.JobID)

		// Compute 8% platform fee on labour charge
		var labourCharge float64
		err := s.db.QueryRow(ctx, `
			SELECT COALESCE(
				(
					SELECT (elem->>'unitPrice')::numeric 
					FROM jsonb_array_elements(line_items) AS elem 
					WHERE elem->>'description' LIKE 'Labour - %'
					LIMIT 1
				), 0
			)
			FROM invoices 
			WHERE job_id = $1
		`, p.JobID).Scan(&labourCharge)

		if err == nil && labourCharge > 0 {
			platformFee := labourCharge * 0.08
			_, _ = s.db.Exec(ctx, `
				INSERT INTO technician_platform_fees (technician_id, job_id, amount, status) 
				VALUES ($1, $2, $3, 'Pending')
				ON CONFLICT (job_id) DO NOTHING
			`, p.TechnicianID, p.JobID, platformFee)
		}
	}

	// Fetch payment record for notification & ws dispatch
	payment, err := s.paymentRepo.GetPayment(ctx, req.OrderId)
	if err != nil {
		return &paymentv1.VerifyAndCaptureResponse{Success: true, PaymentId: req.PaymentId}, nil
	}

	// Save persistent notification + WS dispatch for technician
	s.createNotificationHelper(ctx, payment.TechnicianID, "Payment Received", fmt.Sprintf("Payment of Rs.%.2f has been received for job #%s.", payment.Amount, payment.JobID[0:8]), "payment")

	// Notify technician asynchronously
	if s.fcmClient != nil {
		go func() {
			reqPush := firebase.PushRequest{
				UserID: payment.TechnicianID,
				Title:  "Payment Received",
				Body:   fmt.Sprintf("Rs.%.0f received for job #%s", payment.Amount, payment.JobID[0:8]),
				Type:   "payment",
			}
			if err := s.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3); err != nil {
				log.Printf("FCM error sending payment confirmation push: %v", err)
			}
		}()
	}

	// Send WS event to customer room
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
		Type:   "payment_status",
		RoomID: "user:" + customerID,
		Payload: map[string]interface{}{
			"status": "Captured",
			"jobId":  payment.JobID,
			"amount": payment.Amount,
		},
	})

	return &paymentv1.VerifyAndCaptureResponse{
		Success:   true,
		PaymentId: req.PaymentId,
	}, nil
}

func (s *Server) GetHistory(ctx context.Context, req *paymentv1.GetHistoryRequest) (*paymentv1.GetHistoryResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	role := middleware.RoleFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	page := int(req.Page)
	limit := int(req.Limit)
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 10
	}

	payments, total, err := s.paymentRepo.GetHistory(ctx, userID, role, page, limit)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query payment history: %v", err)
	}

	pbPayments := make([]*paymentv1.PaymentPB, 0, len(payments))
	for _, p := range payments {
		pbPayments = append(pbPayments, &paymentv1.PaymentPB{
			Id:                p.ID,
			JobId:             p.JobID,
			CustomerId:        p.CustomerID,
			TechnicianId:      p.TechnicianID,
			Amount:            p.Amount,
			Currency:          p.Currency,
			Status:            string(p.Status),
			RazorpayOrderId:   p.RazorpayOrderID,
			RazorpayPaymentId: p.RazorpayPaymentID,
			IdempotencyKey:    p.IdempotencyKey,
			FailureReason:     p.FailureReason,
			CreatedAt:         p.CreatedAt.Format(time.RFC3339),
			UpdatedAt:         p.UpdatedAt.Format(time.RFC3339),
		})
	}

	return &paymentv1.GetHistoryResponse{
		Payments: pbPayments,
		Total:     int32(total),
	}, nil
}

func (s *Server) GetInvoice(ctx context.Context, req *paymentv1.GetInvoiceRequest) (*paymentv1.GetInvoiceResponse, error) {
	callerUserID := middleware.UserIDFromContext(ctx)
	if callerUserID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	invoice, err := s.invoiceRepo.GetInvoiceByJobID(ctx, req.JobId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "invoice not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to retrieve invoice: %v", err)
	}

	pbItems := make([]*paymentv1.InvoiceItemPB, 0, len(invoice.LineItems))
	for _, item := range invoice.LineItems {
		pbItems = append(pbItems, &paymentv1.InvoiceItemPB{
			Description: item.Description,
			Quantity:    int32(item.Quantity),
			UnitPrice:   item.UnitPrice,
			Total:       item.Total,
		})
	}

	return &paymentv1.GetInvoiceResponse{
		Id:           invoice.ID,
		JobId:        invoice.JobID,
		PaymentId:    invoice.PaymentID,
		CustomerName: invoice.CustomerName,
		TechName:     invoice.TechName,
		ServiceType:  invoice.ServiceType,
		LineItems:    pbItems,
		Subtotal:     invoice.Subtotal,
		TaxRate:      invoice.TaxRate,
		TaxAmount:    invoice.TaxAmount,
		Total:        invoice.Total,
		PdfUrl:       invoice.PdfURL,
		CreatedAt:    invoice.CreatedAt.Format(time.RFC3339),
	}, nil
}

// helper wrapper to read bytes.NewReader correctly
func s3ClientUpload(ctx context.Context, s3 *storage.S3Client, key string, bytesData []byte) (string, error) {
	return s3.UploadFile(ctx, key, bytes.NewReader(bytesData), int64(len(bytesData)), "application/pdf")
}

func (s *Server) InvalidateAnalyticsCache(ctx context.Context) {
	_ = s.redis.Del(ctx, "analytics:overview").Err()
}

func (s *Server) createNotificationHelper(ctx context.Context, userID, title, message, typ string) {
	q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at) 
	      VALUES ($1,$2,$3,$4,'{}',false,NOW()) RETURNING id, created_at`
	var notifID string
	var createdAt time.Time
	err := s.db.QueryRow(ctx, q, userID, title, message, typ).Scan(&notifID, &createdAt)
	if err != nil {
		log.Printf("[Payment Server] failed to create DB notification: %v", err)
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
