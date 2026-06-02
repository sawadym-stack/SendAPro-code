package grpcserver

import (
	"context"
	"net"

	grpcmiddleware "github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/logging"
	"go.uber.org/zap"
	"google.golang.org/grpc"

	authv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/auth/v1"
	chatv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/chat/v1"
	jobv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/job/v1"
	notificationv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/notification/v1"
	supplierv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/supplier/v1"
	trackingv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/tracking/v1"
	authgrpc "github.com/yourname/fixflow-backend/internal/grpc/auth"
	chatgrpc "github.com/yourname/fixflow-backend/internal/grpc/chat"
	jobgrpc "github.com/yourname/fixflow-backend/internal/grpc/job"
	notificationgrpc "github.com/yourname/fixflow-backend/internal/grpc/notification"
	suppliergrpc "github.com/yourname/fixflow-backend/internal/grpc/supplier"
	trackinggrpc "github.com/yourname/fixflow-backend/internal/grpc/tracking"
	paymentv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/payment/v1"
	paymentgrpc "github.com/yourname/fixflow-backend/internal/grpc/payment"
	reviewv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/review/v1"
	reviewgrpc "github.com/yourname/fixflow-backend/internal/grpc/review"
	disputev1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/dispute/v1"
	disputegrpc "github.com/yourname/fixflow-backend/internal/grpc/dispute"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

type Server struct {
	grpc *grpc.Server
	lis  net.Listener
}

func interceptorLogger(l *zap.Logger) grpcmiddleware.Logger {
	return grpcmiddleware.LoggerFunc(func(ctx context.Context, lvl grpcmiddleware.Level, msg string, fields ...any) {
		switch lvl {
		case grpcmiddleware.LevelDebug:
			l.Debug(msg, zap.Any("fields", fields))
		case grpcmiddleware.LevelInfo:
			l.Info(msg, zap.Any("fields", fields))
		case grpcmiddleware.LevelWarn:
			l.Warn(msg, zap.Any("fields", fields))
		case grpcmiddleware.LevelError:
			l.Error(msg, zap.Any("fields", fields))
		}
	})
}

func New(addr string, logger *zap.Logger, tokenManager *token.Manager, authSvc *authgrpc.Server, jobSvc *jobgrpc.Server, notificationSvc *notificationgrpc.Server, trackingSvc *trackinggrpc.Server, chatSvc *chatgrpc.Server, supplierSvc *suppliergrpc.Server, paymentSvc *paymentgrpc.Server, reviewSvc *reviewgrpc.Server, disputeSvc *disputegrpc.Server, rateLimitInterceptor grpc.UnaryServerInterceptor) (*Server, error) {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}

	grpcZapOpts := []grpcmiddleware.Option{grpcmiddleware.WithLogOnEvents(grpcmiddleware.StartCall, grpcmiddleware.FinishCall)}
	gs := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			middleware.JWTAuthInterceptor(tokenManager),
			middleware.GRPCRBACInterceptor(),
			grpcmiddleware.UnaryServerInterceptor(interceptorLogger(logger), grpcZapOpts...),
			rateLimitInterceptor,
		),
		grpc.ChainStreamInterceptor(
			middleware.JWTAuthStreamInterceptor(tokenManager),
			middleware.GRPCRBACStreamInterceptor(),
		),
	)
	authv1.RegisterAuthServiceServer(gs, authSvc)
	jobv1.RegisterJobServiceServer(gs, jobSvc)
	if notificationSvc != nil {
		notificationv1.RegisterNotificationServiceServer(gs, notificationSvc)
	}
	if trackingSvc != nil {
		trackingv1.RegisterTrackingServiceServer(gs, trackingSvc)
	}
	if chatSvc != nil {
		chatv1.RegisterChatServiceServer(gs, chatSvc)
	}
	if supplierSvc != nil {
		supplierv1.RegisterSupplierServiceServer(gs, supplierSvc)
	}
	if paymentSvc != nil {
		paymentv1.RegisterPaymentServiceServer(gs, paymentSvc)
	}
	if reviewSvc != nil {
		reviewv1.RegisterReviewServiceServer(gs, reviewSvc)
	}
	if disputeSvc != nil {
		disputev1.RegisterDisputeServiceServer(gs, disputeSvc)
	}
	return &Server{grpc: gs, lis: lis}, nil
}

func (s *Server) Start() error { return s.grpc.Serve(s.lis) }
func (s *Server) Stop()        { s.grpc.GracefulStop() }
