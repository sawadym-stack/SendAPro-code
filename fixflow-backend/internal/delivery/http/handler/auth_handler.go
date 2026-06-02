package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	authuc "github.com/yourname/fixflow-backend/internal/usecase/auth"
	"github.com/yourname/fixflow-backend/pkg/validator"
)

const (
	AdminEmail    = "admin@gmail.com"
	AdminPassword = "admin@123"
)

type AuthHandler struct {
	uc  authuc.Usecase
	db  *pgxpool.Pool
	rdb *redis.Client
}

func NewAuthHandler(uc authuc.Usecase, db *pgxpool.Pool, rdb *redis.Client) *AuthHandler {
	return &AuthHandler{uc: uc, db: db, rdb: rdb}
}

// AdminLogin - Hardcoded admin login
func (h *AuthHandler) AdminLogin(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email" validate:"required,email"`
		Password string `json:"password" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"errors": details})
	}

	// Check hardcoded admin credentials
	if req.Email != AdminEmail || req.Password != AdminPassword {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid admin credentials"})
	}

	// Login via usecase (will create/get admin user)
	userID, accessToken, refreshToken, accessExp, refreshExp, err := h.uc.AdminLogin(c.UserContext(), req.Email, req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"userID":       userID,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"accessExp":    accessExp,
		"refreshExp":   refreshExp,
		"role":         "admin",
	})
}

// CustomerRegister - Customer registration with email/phone verification
func (h *AuthHandler) CustomerRegister(c *fiber.Ctx) error {
	var req struct {
		FullName string `json:"fullName" validate:"required,min=2"`
		Email    string `json:"email" validate:"required,email"`
		Phone    string `json:"phone" validate:"required,min=10"`
		Password string `json:"password" validate:"required,min=8"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"errors": details})
	}

	userID, err := h.uc.RegisterCustomer(c.UserContext(), req.FullName, req.Phone, req.Email, req.Password)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Send OTP to email
	_, err = h.uc.SendOTP(c.UserContext(), req.Email, "email")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to send OTP"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"userID":  userID,
		"message": "registration successful, OTP sent to email",
	})
}

// SendOTP - Send OTP to email or phone
func (h *AuthHandler) SendOTP(c *fiber.Ctx) error {
	var req struct {
		Contact string `json:"contact" validate:"required"` // email or phone
		Type    string `json:"type" validate:"required,oneof=email sms"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	_, err := h.uc.SendOTP(c.UserContext(), req.Contact, req.Type)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to send OTP"})
	}

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("OTP sent to %s", req.Contact),
	})
}

// VerifyOTP - Verify OTP and complete registration
func (h *AuthHandler) VerifyOTP(c *fiber.Ctx) error {
	var req struct {
		UserID string `json:"userId" validate:"required"`
		OTP    string `json:"otp" validate:"required,len=6"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"errors": details})
	}

	accessToken, refreshToken, accessExp, refreshExp, err := h.uc.VerifyOTPAndLogin(c.UserContext(), req.UserID, req.OTP)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"accessExp":    accessExp,
		"refreshExp":   refreshExp,
		"message":      "OTP verified successfully",
	})
}

// TechnicianRegister - Technician registration with approval pending
func (h *AuthHandler) TechnicianRegister(c *fiber.Ctx) error {
	var req struct {
		FullName string   `json:"fullName" validate:"required,min=2"`
		Email    string   `json:"email" validate:"required,email"`
		Phone    string   `json:"phone" validate:"required,min=10"`
		Password string   `json:"password" validate:"required,min=8"`
		Skills   []string `json:"skills" validate:"required,min=1"`
		Years    int      `json:"yearsExperience" validate:"required,min=0"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"errors": details})
	}

	userID, err := h.uc.RegisterTechnician(c.UserContext(), req.FullName, req.Phone, req.Email, req.Password, req.Skills, req.Years)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Send OTP
	_, err = h.uc.SendOTP(c.UserContext(), req.Email, "email")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to send OTP"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"userID":  userID,
		"message": "registration submitted, OTP sent to email",
	})
}

// SupplierRegister - Supplier registration with approval pending
func (h *AuthHandler) SupplierRegister(c *fiber.Ctx) error {
	var req struct {
		FullName string  `json:"fullName" validate:"required,min=2"`
		Email    string  `json:"email" validate:"required,email"`
		Phone    string  `json:"phone" validate:"required,min=10"`
		Password string  `json:"password" validate:"required,min=8"`
		Address  string  `json:"address" validate:"required"`
		Lat      float64 `json:"lat" validate:"required"`
		Lng      float64 `json:"lng" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"errors": details})
	}

	userID, err := h.uc.RegisterSupplier(c.UserContext(), req.FullName, req.Phone, req.Email, req.Password, req.Address, req.Lat, req.Lng)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Send OTP
	_, err = h.uc.SendOTP(c.UserContext(), req.Email, "email")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to send OTP"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"userID":  userID,
		"message": "registration submitted, OTP sent to email. Awaiting admin approval.",
	})
}

// Login - Generic login for all roles
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email" validate:"required,email"`
		Password string `json:"password" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"errors": details})
	}

	userID, role, accessToken, refreshToken, accessExp, refreshExp, err := h.uc.Login(c.UserContext(), req.Email, req.Password)
	if err != nil {
		if err.Error() == "email not verified" {
			_, _ = h.uc.SendOTP(c.UserContext(), req.Email, "email")
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":  "email not verified",
				"userId": userID,
				"email":  req.Email,
				"role":   role,
			})
		}
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	// Check if technician/supplier needs approval
	if role == "technician" || role == "supplier" {
		approvalStatus, err := h.uc.GetApprovalStatus(c.UserContext(), userID)
		if err == nil && approvalStatus == "pending" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": fmt.Sprintf("%s registration pending admin approval", role),
				"role":  role,
			})
		} else if err == nil && approvalStatus == "rejected" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": fmt.Sprintf("%s registration was rejected by admin", role),
				"role":  role,
			})
		}
	}

	return c.JSON(fiber.Map{
		"userID":       userID,
		"role":         role,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"accessExp":    accessExp,
		"refreshExp":   refreshExp,
	})
}

// RefreshToken - Refresh access token
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refreshToken" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	accessToken, accessExp, err := h.uc.RefreshToken(c.UserContext(), req.RefreshToken)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid refresh token"})
	}

	return c.JSON(fiber.Map{
		"accessToken": accessToken,
		"accessExp":   accessExp,
	})
}

// GetApprovalRequests - Admin endpoint to view pending approval requests
func (h *AuthHandler) GetApprovalRequests(c *fiber.Ctx) error {
	status := c.Query("status", "pending") // pending, approved, rejected, expired
	role := c.Query("role")                // technician, supplier

	requests, err := h.uc.GetApprovalRequests(c.UserContext(), status, role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"requests": requests})
}

// ApproveRequest - Admin endpoint to approve technician/supplier
func (h *AuthHandler) ApproveRequest(c *fiber.Ctx) error {
	var req struct {
		ApprovalID string `json:"approvalId"`
		AdminID    string `json:"adminId" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	approvalID := c.Params("id")
	if approvalID == "" {
		approvalID = req.ApprovalID
	}
	if approvalID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "approvalId is required"})
	}

	if err := h.uc.ApproveRequest(c.UserContext(), approvalID, req.AdminID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "request approved successfully"})
}

// RejectRequest - Admin endpoint to reject technician/supplier
func (h *AuthHandler) RejectRequest(c *fiber.Ctx) error {
	var req struct {
		ApprovalID string `json:"approvalId"`
		AdminID    string `json:"adminId" validate:"required"`
		Reason     string `json:"reason" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	approvalID := c.Params("id")
	if approvalID == "" {
		approvalID = req.ApprovalID
	}
	if approvalID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "approvalId is required"})
	}

	if err := h.uc.RejectRequest(c.UserContext(), approvalID, req.AdminID, req.Reason); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "request rejected"})
}

// GetUsers - Admin endpoint to search and filter all users
func (h *AuthHandler) GetUsers(c *fiber.Ctx) error {
	search := c.Query("search")
	role := c.Query("role")

	users, err := h.uc.GetUsers(c.UserContext(), search, role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	var mappedUsers []fiber.Map
	for _, u := range users {
		roleStr := string(u.Role)
		if len(roleStr) > 0 {
			roleStr = strings.ToUpper(roleStr[:1]) + roleStr[1:]
		}

		status := "Active"
		if u.IsSuspended {
			status = "Suspended"
		}

		mappedUsers = append(mappedUsers, fiber.Map{
			"id":        u.ID,
			"name":      u.Name,
			"phone":     u.Phone,
			"email":     u.Email,
			"role":      roleStr,
			"status":    status,
			"createdAt": u.CreatedAt.Format(time.RFC3339),
		})
	}

	return c.JSON(mappedUsers)
}

// UpdateUserStatus - Admin endpoint to suspend/activate user accounts
func (h *AuthHandler) UpdateUserStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	var req struct {
		Status string `json:"status"` // "Suspended" or "Active"
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	suspended := req.Status == "Suspended"
	if err := h.uc.UpdateUserStatus(c.UserContext(), id, suspended); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "User status updated successfully."})
}

// GetTechnicianVerificationQueue - Admin endpoint to list all pending technician AND supplier verification requests
func (h *AuthHandler) GetTechnicianVerificationQueue(c *fiber.Ctx) error {
	q := `
		SELECT 
			u.id::text, 
			u.full_name, 
			u.phone,
			a.id::text,
			a.user_role
		FROM admin_approvals a
		JOIN users u ON a.user_id = u.id
		WHERE a.status = 'pending' AND a.user_role IN ('technician', 'supplier')
		ORDER BY a.requested_at DESC
	`
	rows, err := h.db.Query(c.UserContext(), q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var pending []fiber.Map
	for rows.Next() {
		var userID, fullName, phone, approvalID, userRole string
		if err := rows.Scan(&userID, &fullName, &phone, &approvalID, &userRole); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		pending = append(pending, fiber.Map{
			"id":         userID,
			"approvalId": approvalID,
			"name":       fullName,
			"phone":      phone,
			"role":       userRole,
		})
	}

	return c.JSON(pending)
}

// VerifyTechnician - Admin endpoint to approve/reject technician or supplier registration
func (h *AuthHandler) VerifyTechnician(c *fiber.Ctx) error {
	id := c.Params("id")
	var req struct {
		Approved bool   `json:"approved"`
		Note     string `json:"note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	// Fetch active approval ID for this user ID or approval ID
	var approvalID string
	err := h.db.QueryRow(c.UserContext(), `
		SELECT id FROM admin_approvals 
		WHERE (user_id::text = $1 OR id::text = $1) AND status = 'pending'
	`, id).Scan(&approvalID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pending verification request not found."})
	}

	adminID, _ := c.Locals("user_id").(string)
	if adminID == "" {
		adminID = "00000000-0000-0000-0000-000000000001" // Fallback admin UUID if context empty
	}

	if req.Approved {
		if err := h.uc.ApproveRequest(c.UserContext(), approvalID, adminID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"message": "Registration approved successfully."})
	} else {
		reason := req.Note
		if reason == "" {
			reason = "Rejected by admin"
		}
		if err := h.uc.RejectRequest(c.UserContext(), approvalID, adminID, reason); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"message": "Registration rejected successfully."})
	}
}
