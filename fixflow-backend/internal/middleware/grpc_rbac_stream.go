package middleware

import (
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func GRPCRBACStreamInterceptor() grpc.StreamServerInterceptor {
	perm := map[string]map[string]bool{
		"/job.v1.JobService/StreamJobUpdates": {"customer": true, "technician": true, "admin": true},
	}
	return func(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		allowed, ok := perm[info.FullMethod]
		if !ok {
			return handler(srv, ss)
		}
		role := strings.ToLower(RoleFromContext(ss.Context()))
		if !allowed[role] {
			return status.Error(codes.PermissionDenied, "forbidden")
		}
		return handler(srv, ss)
	}
}
