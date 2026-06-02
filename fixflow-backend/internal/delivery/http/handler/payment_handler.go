package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
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
}

func NewPaymentHandler(
	grpcServer *paymentgrpc.Server,
	paymentRepo paymentdomain.PaymentRepository,
	razorpayClient *razorpay.RazorpayClient,
	fcmClient *firebase.FCMClient,
	pubsubRepo redisrepo.PubSubRepo,
) *PaymentHandler {
	return &PaymentHandler{
		grpcServer:     grpcServer,
		paymentRepo:    paymentRepo,
		razorpayClient: razorpayClient,
		fcmClient:      fcmClient,
		pubsubRepo:     pubsubRepo,
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

	return response.OK(c, resp)
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

	return response.OK(c, resp)
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

	return response.OK(c, resp)
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

	return response.Paginated(c, resp.Payments, meta)
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

	return c.JSON(resp)
}
