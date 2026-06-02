package user

import (
	"context"
)

type UserRepository interface {
	Create(ctx context.Context, u *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByPhone(ctx context.Context, phone string) (*User, error)
	UpdateVerificationByPhone(ctx context.Context, phone string, verified bool) error
	UpdateVerificationByEmail(ctx context.Context, email string, verified bool) error
	UpdatePasswordHashByID(ctx context.Context, userID, passwordHash string) error
	UpdateApprovalStatus(ctx context.Context, userID, status string) error
	UpdateTechnicianDetails(ctx context.Context, userID string, skills []string, yearsExperience int) error
	UpdateSupplierDetails(ctx context.Context, userID string, address string, lat, lng float64) error
	GetApprovalRequests(ctx context.Context, status, role string) ([]map[string]interface{}, error)
	ApproveRequest(ctx context.Context, approvalID, adminID string) (userID string, role string, err error)
	RejectRequest(ctx context.Context, approvalID, adminID, reason string) error
	GetSupplierGeo(ctx context.Context, userID string, sid *string, lat *float64, lng *float64) error
	GetUsers(ctx context.Context, search, role string) ([]*User, error)
	UpdateSuspensionStatus(ctx context.Context, userID string, suspended bool) error
}
