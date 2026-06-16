package auth

import (
	"context"
	"log"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	authv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/auth/v1"
	authuc "github.com/yourname/fixflow-backend/internal/usecase/auth"
)

type Server struct {
	authv1.UnimplementedAuthServiceServer
	uc authuc.Usecase
}

func NewServer(uc authuc.Usecase) *Server {
	return &Server{uc: uc}
}

func (s *Server) Register(ctx context.Context, req *authv1.RegisterRequest) (*authv1.AuthTokensResponse, error) {
	uid, at, rt, aexp, rexp, err := s.uc.Register(ctx, req.GetName(), req.GetPhone(), req.GetEmail(), req.GetPassword(), req.GetRole())
	if err != nil {
		if err.Error() == "email already registered" {
			return nil, status.Error(codes.AlreadyExists, "email already registered")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &authv1.AuthTokensResponse{UserId: uid, AccessToken: at, RefreshToken: rt, AccessExpiresAtUnix: aexp.Unix(), RefreshExpiresAtUnix: rexp.Unix()}, nil
}

func (s *Server) Login(ctx context.Context, req *authv1.LoginRequest) (*authv1.AuthTokensResponse, error) {
	uid, role, at, rt, aexp, rexp, err := s.uc.Login(ctx, req.GetEmail(), req.GetPassword())
	if err != nil {
		if err.Error() == "invalid credentials" {
			log.Printf("auth login failed for email=%s: invalid credentials", req.GetEmail())
			return nil, status.Error(codes.Unauthenticated, "invalid credentials")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Check if technician/supplier needs approval
	if role == "technician" || role == "supplier" {
		approvalStatus, err := s.uc.GetApprovalStatus(ctx, uid)
		if err == nil && approvalStatus == "pending" {
			return nil, status.Errorf(codes.PermissionDenied, "%s registration pending admin approval", role)
		} else if err == nil && approvalStatus == "rejected" {
			return nil, status.Errorf(codes.PermissionDenied, "%s registration was rejected by admin", role)
		}
	}

	return &authv1.AuthTokensResponse{UserId: uid, AccessToken: at, RefreshToken: rt, AccessExpiresAtUnix: aexp.Unix(), RefreshExpiresAtUnix: rexp.Unix()}, nil
}

func (s *Server) RefreshToken(ctx context.Context, req *authv1.RefreshTokenRequest) (*authv1.RefreshTokenResponse, error) {
	at, exp, err := s.uc.RefreshToken(ctx, req.GetRefreshToken())
	if err != nil {
		return nil, err
	}
	return &authv1.RefreshTokenResponse{AccessToken: at, AccessExpiresAtUnix: exp.Unix()}, nil
}

func (s *Server) ValidateToken(ctx context.Context, req *authv1.ValidateTokenRequest) (*authv1.ValidateTokenResponse, error) {
	claims, err := s.uc.ValidateToken(ctx, req.GetToken())
	if err != nil {
		return &authv1.ValidateTokenResponse{Valid: false}, nil
	}
	return &authv1.ValidateTokenResponse{UserId: claims.UserID, Email: claims.Email, Role: claims.Role, ExpiresAtUnix: claims.ExpiresAt.Unix(), Valid: true}, nil
}

func (s *Server) SendOTP(ctx context.Context, req *authv1.SendOTPRequest) (*authv1.SendOTPResponse, error) {
	if _, err := s.uc.SendOTP(ctx, req.GetPhone(), "sms"); err != nil {
		return nil, err
	}
	return &authv1.SendOTPResponse{Sent: true, TtlSeconds: 300}, nil
}

func (s *Server) VerifyOTP(ctx context.Context, req *authv1.VerifyOTPRequest) (*authv1.VerifyOTPResponse, error) {
	ok, err := s.uc.VerifyOTP(ctx, req.GetPhone(), req.GetOtp())
	if err != nil {
		return nil, err
	}
	return &authv1.VerifyOTPResponse{Verified: ok}, nil
}
