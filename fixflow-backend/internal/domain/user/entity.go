package user

import "time"

type UserRole string

const (
	RoleCustomer   UserRole = "customer"
	RoleTechnician UserRole = "technician"
	RoleSupplier   UserRole = "supplier"
	RoleAdmin      UserRole = "admin"
)

type User struct {
	ID                  string     `json:"id"`
	Name                string     `json:"name"`
	Phone               string     `json:"phone"`
	Email               string     `json:"email"`
	PasswordHash        string     `json:"passwordHash"`
	Role                UserRole   `json:"role"`
	IsVerified          bool       `json:"isVerified"`
	ApprovalStatus      string     `json:"approvalStatus"`
	ApprovalRequestedAt *time.Time `json:"approvalRequestedAt"`
	ApprovalExpiresAt   *time.Time `json:"approvalExpiresAt"`
	IsEmailVerified     bool       `json:"isEmailVerified"`
	IsPhoneVerified     bool       `json:"isPhoneVerified"`
	IsSuspended         bool       `json:"isSuspended"`
	ProfilePictureURL   string     `json:"profilePictureUrl"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}
