package middleware

import (
	"context"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func GRPCRBACInterceptor() grpc.UnaryServerInterceptor {
	perm := map[string]map[string]bool{
		"/job.v1.JobService/CreateJob":        {"customer": true, "admin": true},
		"/job.v1.JobService/GetJob":           {"customer": true, "technician": true, "admin": true},
		"/job.v1.JobService/ListCustomerJobs": {"customer": true, "admin": true},
		"/job.v1.JobService/UpdateJobStatus":  {"technician": true, "admin": true},
		"/payment.v1.PaymentService/GenerateInvoice":    {"technician": true, "admin": true},
		"/payment.v1.PaymentService/CreatePaymentOrder": {"customer": true, "admin": true},
		"/payment.v1.PaymentService/VerifyAndCapture":   {"customer": true, "admin": true},
		"/payment.v1.PaymentService/GetHistory":         {"customer": true, "technician": true, "admin": true},
		"/payment.v1.PaymentService/GetInvoice":         {"customer": true, "technician": true, "admin": true},
	}
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		allowed, ok := perm[info.FullMethod]
		if !ok {
			return handler(ctx, req)
		}
		role := strings.ToLower(RoleFromContext(ctx))
		if !allowed[role] {
			return nil, status.Error(codes.PermissionDenied, "forbidden")
		}
		return handler(ctx, req)
	}
}
