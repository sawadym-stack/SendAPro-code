package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	disputev1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/dispute/v1"
	disputegrpc "github.com/yourname/fixflow-backend/internal/grpc/dispute"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/pkg/response"
)

type DisputeHandler struct {
	grpcServer *disputegrpc.Server
	db         *pgxpool.Pool
}

func NewDisputeHandler(grpcServer *disputegrpc.Server, db *pgxpool.Pool) *DisputeHandler {
	return &DisputeHandler{grpcServer: grpcServer, db: db}
}

func (h *DisputeHandler) RaiseDispute(c *fiber.Ctx) error {
	var body struct {
		JobID       string `json:"jobId"`
		Reason      string `json:"reason"`
		Description string `json:"description"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.RaiseDispute(grpcCtx, &disputev1.RaiseDisputeRequest{
		JobId:       body.JobID,
		Reason:      body.Reason,
		Description: body.Description,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, resp)
}

func (h *DisputeHandler) UploadEvidence(c *fiber.Ctx) error {
	disputeID := c.Params("id")
	var body struct {
		FileUrl string `json:"fileUrl"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.UploadEvidence(grpcCtx, &disputev1.UploadEvidenceRequest{
		DisputeId: disputeID,
		FileUrl:   body.FileUrl,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, resp)
}

func (h *DisputeHandler) ResolveDispute(c *fiber.Ctx) error {
	disputeID := c.Params("id")
	var body struct {
		Action    string `json:"action"` // refund | warn | dismiss
		AdminNote string `json:"adminNote"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.ResolveDispute(grpcCtx, &disputev1.ResolveDisputeRequest{
		DisputeId: disputeID,
		Action:    body.Action,
		AdminNote: body.AdminNote,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, resp)
}

func (h *DisputeHandler) GetDisputes(c *fiber.Ctx) error {
	statusVal := c.Query("status", "")
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

	resp, err := h.grpcServer.GetDisputes(grpcCtx, &disputev1.GetDisputesRequest{
		Status: statusVal,
		Page:   int32(page),
		Limit:  int32(limit),
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

	return response.Paginated(c, resp.Disputes, meta)
}

func (h *DisputeHandler) GetDispute(c *fiber.Ctx) error {
	disputeID := c.Params("id")

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.GetDispute(grpcCtx, &disputev1.GetDisputeRequest{
		DisputeId: disputeID,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(resp)
}

func (h *DisputeHandler) UpdateDisputeStatus(c *fiber.Ctx) error {
	disputeID := c.Params("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	role, _ := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "only admin can update dispute status"})
	}

	_, err := h.db.Exec(c.Context(), "UPDATE disputes SET status = $1 WHERE id = $2", body.Status, disputeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": body.Status})
}
