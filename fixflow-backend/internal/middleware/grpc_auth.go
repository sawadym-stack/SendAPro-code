package middleware

import (
	"context"
	"log"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

type contextKey string

const userIDContextKey contextKey = "userID"
const roleContextKey contextKey = "role"

func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDContextKey).(string)
	return v
}
func RoleFromContext(ctx context.Context) string {
	v, _ := ctx.Value(roleContextKey).(string)
	return v
}

func JWTAuthInterceptor(tm *token.Manager) grpc.UnaryServerInterceptor {
	publicMethods := map[string]bool{
		"/auth.v1.AuthService/Register":      true,
		"/auth.v1.AuthService/Login":         true,
		"/auth.v1.AuthService/RefreshToken":  true,
		"/auth.v1.AuthService/SendOTP":       true,
		"/auth.v1.AuthService/VerifyOTP":     true,
		"/auth.v1.AuthService/ValidateToken": true,
	}
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		if publicMethods[info.FullMethod] {
			return handler(ctx, req)
		}
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			log.Printf("jwt auth failed for %s: missing metadata", info.FullMethod)
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}
		authHeader := ""
		if vals := md.Get("authorization"); len(vals) > 0 {
			authHeader = vals[0]
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			log.Printf("jwt auth failed for %s: missing bearer token", info.FullMethod)
			return nil, status.Error(codes.Unauthenticated, "missing bearer token")
		}
		claims, err := tm.Parse(parts[1])
		if err != nil || claims.Type != "access" {
			log.Printf("jwt auth failed for %s: invalid token: %v", info.FullMethod, err)
			return nil, status.Error(codes.Unauthenticated, "invalid token")
		}
		ctx = context.WithValue(ctx, userIDContextKey, claims.UserID)
		ctx = context.WithValue(ctx, roleContextKey, claims.Role)
		return handler(ctx, req)
	}
}

func JWTAuthStreamInterceptor(tm *token.Manager) grpc.StreamServerInterceptor {
	publicMethods := map[string]bool{}
	return func(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		if publicMethods[info.FullMethod] {
			return handler(srv, ss)
		}
		md, ok := metadata.FromIncomingContext(ss.Context())
		if !ok {
			log.Printf("jwt stream auth failed for %s: missing metadata", info.FullMethod)
			return status.Error(codes.Unauthenticated, "missing metadata")
		}
		authHeader := ""
		if vals := md.Get("authorization"); len(vals) > 0 {
			authHeader = vals[0]
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			log.Printf("jwt stream auth failed for %s: missing bearer token", info.FullMethod)
			return status.Error(codes.Unauthenticated, "missing bearer token")
		}
		claims, err := tm.Parse(parts[1])
		if err != nil || claims.Type != "access" {
			log.Printf("jwt stream auth failed for %s: invalid token: %v", info.FullMethod, err)
			return status.Error(codes.Unauthenticated, "invalid token")
		}
		wrapped := &wrappedServerStream{ServerStream: ss, ctx: context.WithValue(context.WithValue(ss.Context(), userIDContextKey, claims.UserID), roleContextKey, claims.Role)}
		return handler(srv, wrapped)
	}
}

type wrappedServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (w *wrappedServerStream) Context() context.Context { return w.ctx }

func ContextWithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDContextKey, userID)
}

func ContextWithUserIDAndRole(ctx context.Context, userID, role string) context.Context {
	return context.WithValue(context.WithValue(ctx, userIDContextKey, userID), roleContextKey, role)
}
