package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	paymentv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/payment/v1"
	websocket "github.com/yourname/fixflow-backend/internal/delivery/websocket"
	paymentdomain "github.com/yourname/fixflow-backend/internal/domain/payment"
	paymentgrpc "github.com/yourname/fixflow-backend/internal/grpc/payment"
	"github.com/yourname/fixflow-backend/internal/middleware"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	"github.com/yourname/fixflow-backend/infrastructure/razorpay"
	"github.com/yourname/fixflow-backend/pkg/response"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PaymentHandler struct {
	grpcServer     *paymentgrpc.Server
	paymentRepo    paymentdomain.PaymentRepository
	razorpayClient *razorpay.RazorpayClient
	fcmClient      *firebase.FCMClient
	pubsubRepo     redisrepo.PubSubRepo
	db             *pgxpool.Pool
}

func NewPaymentHandler(
	grpcServer *paymentgrpc.Server,
	paymentRepo paymentdomain.PaymentRepository,
	razorpayClient *razorpay.RazorpayClient,
	fcmClient *firebase.FCMClient,
	pubsubRepo redisrepo.PubSubRepo,
	db *pgxpool.Pool,
) *PaymentHandler {
	return &PaymentHandler{
		grpcServer:     grpcServer,
		paymentRepo:    paymentRepo,
		razorpayClient: razorpayClient,
		fcmClient:      fcmClient,
		pubsubRepo:     pubsubRepo,
		db:             db,
	}
}

// RazorpayWebhookEvent structures the incoming webhook payload.
type RazorpayWebhookEvent struct {
	Event   string `json:"event"`
	Payload struct {
		Payment struct {
			Entity struct {
				ID               string `json:"id"`
				OrderID          string `json:"order_id"`
				Amount           int    `json:"amount"`
				Status           string `json:"status"`
				ErrorDescription string `json:"error_description"`
			} `json:"entity"`
		} `json:"payment"`
	} `json:"payload"`
}

func (h *PaymentHandler) GenerateInvoice(c *fiber.Ctx) error {
	var body struct {
		JobID        string `json:"jobId"`
		LabourCharge float64 `json:"labourCharge"`
		MaterialItems []struct {
			Description string  `json:"description"`
			Quantity    int32   `json:"quantity"`
			UnitPrice   float64 `json:"unitPrice"`
		} `json:"materialItems"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)

	// Context with grpc auth properties
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	pbItems := make([]*paymentv1.MaterialItem, 0, len(body.MaterialItems))
	for _, item := range body.MaterialItems {
		pbItems = append(pbItems, &paymentv1.MaterialItem{
			Description: item.Description,
			Quantity:    item.Quantity,
			UnitPrice:   item.UnitPrice,
		})
	}

	resp, err := h.grpcServer.GenerateInvoice(grpcCtx, &paymentv1.GenerateInvoiceRequest{
		JobId:         body.JobID,
		LabourCharge: body.LabourCharge,
		MaterialItems: pbItems,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	lineItems := []fiber.Map{}
	for _, item := range resp.LineItems {
		lineItems = append(lineItems, fiber.Map{
			"description": item.Description,
			"quantity":    item.Quantity,
			"unitPrice":   item.UnitPrice,
			"total":       item.Total,
		})
	}

	return response.OK(c, fiber.Map{
		"invoiceId": resp.InvoiceId,
		"pdfUrl":    resp.PdfUrl,
		"total":     resp.Total,
		"lineItems": lineItems,
	})
}

func (h *PaymentHandler) CreatePaymentOrder(c *fiber.Ctx) error {
	var body struct {
		JobID          string `json:"jobId"`
		IdempotencyKey string `json:"idempotencyKey"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.CreatePaymentOrder(grpcCtx, &paymentv1.CreatePaymentOrderRequest{
		JobId:          body.JobID,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, fiber.Map{
		"orderId":  resp.OrderId,
		"amount":   resp.Amount,
		"currency": resp.Currency,
		"keyId":    resp.KeyId,
	})
}

func (h *PaymentHandler) VerifyAndCapture(c *fiber.Ctx) error {
	var body struct {
		OrderID   string `json:"orderId"`
		PaymentID string `json:"paymentId"`
		Signature string `json:"signature"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.VerifyAndCapture(grpcCtx, &paymentv1.VerifyAndCaptureRequest{
		OrderId:   body.OrderID,
		PaymentId: body.PaymentID,
		Signature: body.Signature,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, fiber.Map{
		"success":   resp.Success,
		"paymentId": resp.PaymentId,
	})
}

func (h *PaymentHandler) GetHistory(c *fiber.Ctx) error {
	pageStr := c.Query("page", "1")
	limitStr := c.Query("limit", "10")

	page, err := strconv.Atoi(pageStr)
	if err != nil {
		page = 1
	}
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 10
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.GetHistory(grpcCtx, &paymentv1.GetHistoryRequest{
		Page:  int32(page),
		Limit: int32(limit),
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	paymentsList := []fiber.Map{}
	for _, p := range resp.Payments {
		paymentsList = append(paymentsList, fiber.Map{
			"id":                p.Id,
			"jobId":             p.JobId,
			"customerId":        p.CustomerId,
			"technicianId":      p.TechnicianId,
			"amount":            p.Amount,
			"currency":          p.Currency,
			"status":            p.Status,
			"razorpayOrderId":   p.RazorpayOrderId,
			"razorpayPaymentId": p.RazorpayPaymentId,
			"idempotencyKey":    p.IdempotencyKey,
			"failureReason":     p.FailureReason,
			"createdAt":         p.CreatedAt,
			"updatedAt":         p.UpdatedAt,
		})
	}

	totalPages := 0
	if limit > 0 {
		totalPages = int((int64(resp.Total) + int64(limit) - 1) / int64(limit))
	}

	meta := response.PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int64(resp.Total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	return response.Paginated(c, paymentsList, meta)
}

func (h *PaymentHandler) WebhookHandler(c *fiber.Ctx) error {
	body := c.Body()
	signature := c.Get("X-Razorpay-Signature")

	if !h.razorpayClient.VerifyWebhookSignature(body, signature) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid signature"})
	}

	var event RazorpayWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid webhook json"})
	}

	ctx := context.Background()

	switch event.Event {
	case "payment.captured":
		orderID := event.Payload.Payment.Entity.OrderID
		paymentID := event.Payload.Payment.Entity.ID

		err := h.paymentRepo.UpdatePaymentStatus(ctx, orderID, paymentdomain.Captured, paymentID)
		if err != nil {
			log.Printf("[Razorpay Webhook] failed to update captured status for order %s: %v", orderID, err)
		}
		h.grpcServer.InvalidateAnalyticsCache(ctx)

		// Look up payment details to notify parties
		p, err := h.paymentRepo.GetPayment(ctx, orderID)
		if err == nil {
			// Notify technician asynchronously
			if h.fcmClient != nil {
				go func() {
					reqPush := firebase.PushRequest{
						UserID: p.TechnicianID,
						Title:  "Payment Received",
						Body:   fmt.Sprintf("Rs.%.0f received for job #%s", p.Amount, p.JobID[0:8]),
						Type:   "payment",
					}
					_ = h.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3)
				}()
			}

			// Send WS event to customer room
			_ = h.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
				Type:   "payment_status",
				RoomID: "user:" + p.CustomerID,
				Payload: map[string]interface{}{
					"status": "Captured",
					"jobId":  p.JobID,
					"amount": p.Amount,
				},
			})
		}

	case "payment.failed":
		orderID := event.Payload.Payment.Entity.OrderID
		reason := event.Payload.Payment.Entity.ErrorDescription

		err := h.paymentRepo.UpdatePaymentStatus(ctx, orderID, paymentdomain.Failed, reason)
		if err != nil {
			log.Printf("[Razorpay Webhook] failed to update failed status for order %s: %v", orderID, err)
		}

		// Look up payment details to notify customer to retry
		p, err := h.paymentRepo.GetPayment(ctx, orderID)
		if err == nil {
			// Notify customer asynchronously
			if h.fcmClient != nil {
				go func() {
					reqPush := firebase.PushRequest{
						UserID: p.CustomerID,
						Title:  "Payment Failed",
						Body:   fmt.Sprintf("Payment for job #%s failed: %s. Please try again.", p.JobID[0:8], reason),
						Type:   "payment",
					}
					_ = h.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3)
				}()
			}

			// Send WS event to customer room
			_ = h.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
				Type:   "payment_status",
				RoomID: "user:" + p.CustomerID,
				Payload: map[string]interface{}{
					"status": "Failed",
					"jobId":  p.JobID,
					"amount": p.Amount,
					"reason": reason,
				},
			})
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "ok"})
}

func (h *PaymentHandler) GetInvoice(c *fiber.Ctx) error {
	jobID := c.Params("jobId")

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.GetInvoice(grpcCtx, &paymentv1.GetInvoiceRequest{
		JobId: jobID,
	})
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "invoice not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Determine payment status dynamically from jobs table
	var isPaid bool
	err = h.db.QueryRow(c.Context(), "SELECT COALESCE(is_paid, false) FROM jobs WHERE id = $1", jobID).Scan(&isPaid)
	if err != nil {
		isPaid = false
	}
	statusStr := "Unpaid"
	if isPaid {
		statusStr = "Paid"
	}

	lineItems := []fiber.Map{}
	for _, item := range resp.LineItems {
		lineItems = append(lineItems, fiber.Map{
			"description": item.Description,
			"quantity":    item.Quantity,
			"unitPrice":   item.UnitPrice,
			"total":       item.Total,
		})
	}

	return c.JSON(fiber.Map{
		"id":           resp.Id,
		"jobId":        resp.JobId,
		"paymentId":    resp.PaymentId,
		"customerName": resp.CustomerName,
		"techName":     resp.TechName,
		"serviceType":  resp.ServiceType,
		"lineItems":    lineItems,
		"subtotal":     resp.Subtotal,
		"taxRate":      resp.TaxRate,
		"taxAmount":    resp.TaxAmount,
		"total":        resp.Total,
		"pdfUrl":       resp.PdfUrl,
		"status":       statusStr,
		"createdAt":    resp.CreatedAt,
	})
}

func (h *PaymentHandler) SendInvoiceReminder(c *fiber.Ctx) error {
	jobID := c.Params("jobId")
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	// 1. Retrieve job details to verify that user is the assigned technician
	var techUserID string
	var customerID string
	var isPaid bool
	err := h.db.QueryRow(c.Context(), `
		SELECT COALESCE((SELECT user_id FROM technicians WHERE id = j.technician_id OR user_id = j.technician_id), ''), 
		       customer_id, 
		       COALESCE(is_paid, false) 
		FROM jobs j 
		WHERE id = $1`, jobID).Scan(&techUserID, &customerID, &isPaid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if techUserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden: not the assigned technician"})
	}

	if isPaid {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "job is already paid"})
	}

	// 2. Fetch the invoice to verify it has been at least 30 minutes since creation
	var invoiceCreatedAt time.Time
	var invoiceTotal float64
	err = h.db.QueryRow(c.Context(), "SELECT created_at, total FROM invoices WHERE job_id = $1", jobID).Scan(&invoiceCreatedAt, &invoiceTotal)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "invoice not generated yet"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	elapsed := time.Since(invoiceCreatedAt)
	if elapsed < 30*time.Minute {
		remaining := 30*time.Minute - elapsed
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": fmt.Sprintf("Please wait %.0f minutes and %.0f seconds before sending a reminder", remaining.Minutes(), remaining.Seconds()-float64(int(remaining.Minutes())*60)),
		})
	}

	// 3. Persist notification and dispatch WebSocket event
	h.createNotificationHelper(c.Context(), customerID, "Payment Reminder", fmt.Sprintf("A reminder to pay the invoice of Rs.%.2f for your completed service request.", invoiceTotal), "payment")

	// 4. Send FCM Push if client available
	if h.fcmClient != nil {
		go func() {
			reqPush := firebase.PushRequest{
				UserID: customerID,
				Title:  "Payment Reminder",
				Body:   fmt.Sprintf("Please complete the payment of Rs.%.0f for your recent service request.", invoiceTotal),
				Type:   "payment",
			}
			_ = h.fcmClient.SendPushWithRetry(context.Background(), reqPush, 3)
		}()
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *PaymentHandler) createNotificationHelper(ctx context.Context, userID, title, message, typ string) {
	q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at) 
	      VALUES ($1,$2,$3,$4,'{}',false,NOW()) RETURNING id, created_at`
	var notifID string
	var createdAt time.Time
	err := h.db.QueryRow(ctx, q, userID, title, message, typ).Scan(&notifID, &createdAt)
	if err != nil {
		log.Printf("[Payment Handler] failed to create DB notification: %v", err)
		return
	}

	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
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

func (h *PaymentHandler) GetPendingPlatformFees(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	var pendingTotal float64
	err := h.db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(amount), 0) 
		FROM technician_platform_fees 
		WHERE technician_id = $1 AND status = 'Pending'
	`, userID).Scan(&pendingTotal)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT id, job_id, amount, created_at 
		FROM technician_platform_fees 
		WHERE technician_id = $1 AND status = 'Pending'
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	feesList := []fiber.Map{}
	for rows.Next() {
		var id, jobID string
		var amount float64
		var createdAt time.Time
		if err := rows.Scan(&id, &jobID, &amount, &createdAt); err == nil {
			feesList = append(feesList, fiber.Map{
				"id":        id,
				"jobId":     jobID,
				"amount":    amount,
				"createdAt": createdAt.Format(time.RFC3339),
			})
		}
	}

	return c.JSON(fiber.Map{
		"pendingAmount": pendingTotal,
		"fees":          feesList,
	})
}

func (h *PaymentHandler) PayPlatformFee(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	var pendingTotal float64
	err := h.db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(amount), 0) 
		FROM technician_platform_fees 
		WHERE technician_id = $1 AND status = 'Pending'
	`, userID).Scan(&pendingTotal)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if pendingTotal <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no pending platform fees"})
	}

	amountPaise := int(pendingTotal * 100)
	receipt := fmt.Sprintf("fee_rec_%d", time.Now().Unix())

	order, err := h.razorpayClient.CreateOrder(c.Context(), amountPaise, "INR", receipt, map[string]string{
		"technicianId": userID,
		"type":         "platform_fee",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Update the order ID on all pending platform fee entries for this technician
	_, err = h.db.Exec(c.Context(), `
		UPDATE technician_platform_fees 
		SET razorpay_order_id = $1 
		WHERE technician_id = $2 AND status = 'Pending'
	`, order.ID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"orderId":  order.ID,
		"amount":   amountPaise,
		"currency": "INR",
		"keyId":    h.razorpayClient.GetKeyID(),
	})
}

func (h *PaymentHandler) VerifyPlatformFee(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	var body struct {
		OrderID   string `json:"orderId"`
		PaymentID string `json:"paymentId"`
		Signature string `json:"signature"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Verify payment signature
	valid := h.razorpayClient.VerifyPaymentSignature(body.OrderID, body.PaymentID, body.Signature)
	if !valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid payment signature"})
	}

	// Update the technician_platform_fees to Paid
	_, err := h.db.Exec(c.Context(), `
		UPDATE technician_platform_fees 
		SET status = 'Paid', razorpay_payment_id = $1, updated_at = NOW() 
		WHERE razorpay_order_id = $2 AND technician_id = $3
	`, body.PaymentID, body.OrderID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *PaymentHandler) GetRewardsStatus(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	// Start of the current week (Monday)
	now := time.Now()
	offset := int(now.Weekday() - time.Monday)
	if offset < 0 {
		offset += 7
	}
	weekStart := now.AddDate(0, 0, -offset)
	weekStartDate := time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, time.Local)

	// Fetch completed jobs count for the technician this week
	var jobsCount int
	err := h.db.QueryRow(c.Context(), `
		SELECT COUNT(*) 
		FROM jobs 
		WHERE technician_id = (SELECT id FROM technicians WHERE user_id = $1)
		AND status = 'Completed'
		AND completed_at >= $2
	`, userID, weekStartDate).Scan(&jobsCount)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Fetch rewards claim record
	var rewardAmount *float64
	var claimedAt *time.Time
	err = h.db.QueryRow(c.Context(), `
		SELECT reward_amount, claimed_at 
		FROM technician_rewards 
		WHERE technician_id = $1 AND week_start = $2
	`, userID, weekStartDate).Scan(&rewardAmount, &claimedAt)

	claimed := false
	var amount float64
	if err == nil {
		if rewardAmount != nil {
			claimed = true
			amount = *rewardAmount
		}
	}

	canClaim := jobsCount >= 10 && !claimed

	return c.JSON(fiber.Map{
		"jobsCount":    jobsCount,
		"target":       10,
		"canClaim":     canClaim,
		"claimed":      claimed,
		"rewardAmount": amount,
	})
}

func (h *PaymentHandler) ClaimReward(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	// Start of the current week (Monday)
	now := time.Now()
	offset := int(now.Weekday() - time.Monday)
	if offset < 0 {
		offset += 7
	}
	weekStart := now.AddDate(0, 0, -offset)
	weekStartDate := time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, time.Local)

	// Fetch completed jobs count
	var jobsCount int
	err := h.db.QueryRow(c.Context(), `
		SELECT COUNT(*) 
		FROM jobs 
		WHERE technician_id = (SELECT id FROM technicians WHERE user_id = $1)
		AND status = 'Completed'
		AND completed_at >= $2
	`, userID, weekStartDate).Scan(&jobsCount)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if jobsCount < 10 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "minimum 10 completed jobs required to claim scratch card"})
	}

	// Check if already claimed
	var existCount int
	_ = h.db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM technician_rewards 
		WHERE technician_id = $1 AND week_start = $2 AND reward_amount IS NOT NULL
	`, userID, weekStartDate).Scan(&existCount)
	if existCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "reward already claimed for this week"})
	}

	// Generate a random reward amount up to 1000rs
	rewardVal := float64(50 + rand.Intn(951)) // Random Rs. 50 to Rs. 1000

	_, err = h.db.Exec(c.Context(), `
		INSERT INTO technician_rewards (technician_id, week_start, jobs_count, reward_amount, claimed_at) 
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (technician_id, week_start) 
		DO UPDATE SET reward_amount = EXCLUDED.reward_amount, claimed_at = NOW(), jobs_count = EXCLUDED.jobs_count
	`, userID, weekStartDate, jobsCount, rewardVal)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"rewardAmount": rewardVal,
	})
}
