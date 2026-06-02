package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	reviewv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/review/v1"
	reviewgrpc "github.com/yourname/fixflow-backend/internal/grpc/review"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/pkg/response"
)

type ReviewHandler struct {
	grpcServer *reviewgrpc.Server
}

func NewReviewHandler(grpcServer *reviewgrpc.Server) *ReviewHandler {
	return &ReviewHandler{grpcServer: grpcServer}
}

func (h *ReviewHandler) SubmitReview(c *fiber.Ctx) error {
	var body struct {
		JobID      string   `json:"jobId"`
		RevieweeID string   `json:"revieweeId"`
		Rating     int32    `json:"rating"`
		Comment    string   `json:"comment"`
		ImageURLs  []string `json:"imageUrls"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.SubmitReview(grpcCtx, &reviewv1.SubmitReviewRequest{
		JobId:      body.JobID,
		RevieweeId: body.RevieweeID,
		Rating:     body.Rating,
		Comment:    body.Comment,
		ImageUrls:  body.ImageURLs,
	})
	if err != nil {
		return response.GRPCError(c, err)
	}

	return response.OK(c, resp)
}

func (h *ReviewHandler) GetReviews(c *fiber.Ctx) error {
	revieweeID := c.Params("id")
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

	resp, err := h.grpcServer.GetReviews(grpcCtx, &reviewv1.GetReviewsRequest{
		RevieweeId: revieweeID,
		Page:       int32(page),
		Limit:      int32(limit),
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

	return response.Paginated(c, resp.Reviews, meta)
}

func (h *ReviewHandler) GetRating(c *fiber.Ctx) error {
	revieweeID := c.Params("id")

	userID, _ := c.Locals("user_id").(string)
	role, _ := c.Locals("role").(string)
	grpcCtx := middleware.ContextWithUserIDAndRole(c.Context(), userID, role)

	resp, err := h.grpcServer.GetReviews(grpcCtx, &reviewv1.GetReviewsRequest{
		RevieweeId: revieweeID,
		Page:       1,
		Limit:      1,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"averageRating": resp.AverageRating,
		"totalRatings":  resp.TotalRatings,
	})
}
