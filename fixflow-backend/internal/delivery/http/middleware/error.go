package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/yourname/fixflow-backend/pkg/response"
)

// FiberGRPCErrorToHTTP maps a gRPC status error to a Fiber response using the standard envelope.
func FiberGRPCErrorToHTTP(c *fiber.Ctx, err error) error {
	return response.GRPCError(c, err)
}

