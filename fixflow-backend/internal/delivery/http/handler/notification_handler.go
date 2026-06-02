package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	notificationv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/notification/v1"
	notificationgrpc "github.com/yourname/fixflow-backend/internal/grpc/notification"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/pkg/response"
)

type NotificationHandler struct {
	grpcServer *notificationgrpc.Server
	db         *pgxpool.Pool
}

func NewNotificationHandler(grpcServer *notificationgrpc.Server, db *pgxpool.Pool) *NotificationHandler {
	return &NotificationHandler{grpcServer: grpcServer, db: db}
}

func (h *NotificationHandler) ListNotifications(c *fiber.Ctx) error {
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
	if limit > 100 {
		limit = 100
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.ListNotifications(grpcCtx, &notificationv1.ListNotificationsRequest{
		UserId:   userID,
		Page:     int32(page),
		PageSize: int32(limit),
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	// Fetch total count directly from database
	var total int64
	err = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM notifications WHERE user_id = $1", userID).Scan(&total)
	if err != nil {
		total = int64(len(resp.Notifications))
	}

	totalPages := 0
	if limit > 0 {
		totalPages = int((total + int64(limit) - 1) / int64(limit))
	}

	meta := response.PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	return response.Paginated(c, resp.Notifications, meta)
}

func (h *NotificationHandler) MarkRead(c *fiber.Ctx) error {
	notificationID := c.Params("id")

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	_, err := h.grpcServer.MarkNotificationRead(grpcCtx, &notificationv1.MarkNotificationReadRequest{
		NotificationId: notificationID,
		UserId:         userID,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, fiber.Map{"success": true})
}
