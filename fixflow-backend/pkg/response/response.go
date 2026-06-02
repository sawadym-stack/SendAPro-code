package response

import (
	"github.com/gofiber/fiber/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Meta    *Meta       `json:"meta,omitempty"`
}

type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    string `json:"code"`
}

type PaginatedResponse struct {
	Success bool           `json:"success"`
	Data    interface{}    `json:"data"`
	Meta    PaginationMeta `json:"meta"`
}

type PaginationMeta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
	HasNext    bool  `json:"hasNext"`
	HasPrev    bool  `json:"hasPrev"`
}

type Meta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

func OK(ctx *fiber.Ctx, data interface{}) error {
	return ctx.Status(200).JSON(SuccessResponse{Success: true, Data: data})
}

func Created(ctx *fiber.Ctx, data interface{}) error {
	return ctx.Status(201).JSON(SuccessResponse{Success: true, Data: data})
}

func Paginated(ctx *fiber.Ctx, data interface{}, meta PaginationMeta) error {
	return ctx.Status(200).JSON(PaginatedResponse{Success: true, Data: data, Meta: meta})
}

func Err(ctx *fiber.Ctx, statusCode int, message, code string) error {
	return ctx.Status(statusCode).JSON(ErrorResponse{
		Success: false, Error: message, Code: code,
	})
}

func GRPCError(ctx *fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return Err(ctx, 500, "Something went wrong, try again", "INTERNAL_ERROR")
	}
	switch st.Code() {
	case codes.NotFound:
		return Err(ctx, 404, st.Message(), "NOT_FOUND")
	case codes.AlreadyExists:
		return Err(ctx, 409, st.Message(), "ALREADY_EXISTS")
	case codes.PermissionDenied:
		return Err(ctx, 403, st.Message(), "FORBIDDEN")
	case codes.Unauthenticated:
		return Err(ctx, 401, st.Message(), "UNAUTHORIZED")
	case codes.InvalidArgument:
		return Err(ctx, 400, st.Message(), "VALIDATION_ERROR")
	case codes.FailedPrecondition:
		return Err(ctx, 422, st.Message(), "VALIDATION_ERROR")
	case codes.ResourceExhausted:
		return Err(ctx, 429, st.Message(), "RATE_LIMITED")
	default:
		return Err(ctx, 500, st.Message(), "INTERNAL_ERROR")
	}
}

func BadRequest(ctx *fiber.Ctx, message string) error {
	return Err(ctx, 400, message, "VALIDATION_ERROR")
}

func Unauthorized(ctx *fiber.Ctx) error {
	return Err(ctx, 401, "Please login again", "UNAUTHORIZED")
}

func Forbidden(ctx *fiber.Ctx) error {
	return Err(ctx, 403, "You don't have permission to perform this action", "FORBIDDEN")
}

func NotFound(ctx *fiber.Ctx, resource string) error {
	return Err(ctx, 404, resource+" not found", "NOT_FOUND")
}

func Conflict(ctx *fiber.Ctx, message string) error {
	return Err(ctx, 409, message, "CONFLICT")
}

func UnprocessableEntity(ctx *fiber.Ctx, message string) error {
	return Err(ctx, 422, message, "VALIDATION_ERROR")
}

func Internal(ctx *fiber.Ctx) error {
	return Err(ctx, 500, "Something went wrong, try again", "INTERNAL_ERROR")
}
