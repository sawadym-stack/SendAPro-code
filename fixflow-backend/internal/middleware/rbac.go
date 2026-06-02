package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

func FiberJWTAuth(tm *token.Manager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		a := c.Get("Authorization")
		parts := strings.SplitN(a, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			return fiber.NewError(fiber.StatusUnauthorized, "missing bearer token")
		}
		claims, err := tm.Parse(parts[1])
		if err != nil || claims.Type != "access" {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid token")
		}
		c.Locals("user_id", claims.UserID)
		c.Locals("role", strings.ToLower(claims.Role))
		return c.Next()
	}
}

func RequireRoleFiber(allowed ...string) fiber.Handler {
	set := map[string]bool{}
	for _, r := range allowed {
		set[strings.ToLower(r)] = true
	}
	return func(c *fiber.Ctx) error {
		role, _ := c.Locals("role").(string)
		role = strings.ToLower(role)
		if !set[role] {
			return fiber.NewError(fiber.StatusForbidden, "forbidden")
		}
		return c.Next()
	}
}
