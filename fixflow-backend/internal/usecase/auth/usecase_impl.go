package auth

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"net/smtp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"github.com/yourname/fixflow-backend/internal/domain/user"
	"github.com/yourname/fixflow-backend/internal/pkg/config"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

type Usecase interface {
	AdminLogin(ctx context.Context, email, password string) (userID, accessToken, refreshToken string, accessExp, refreshExp time.Time, err error)
	RegisterCustomer(ctx context.Context, name, phone, email, password string) (userID string, err error)
	SendOTP(ctx context.Context, contact string, otpType ...string) (otp string, err error)
	VerifyOTP(ctx context.Context, contact string, otp string) (bool, error)
	VerifyOTPAndLogin(ctx context.Context, userID string, otp string) (accessToken, refreshToken string, accessExp, refreshExp time.Time, err error)
	RegisterTechnician(ctx context.Context, name, phone, email, password string, skills []string, yearsExperience int) (userID string, err error)
	RegisterSupplier(ctx context.Context, name, phone, email, password string, address string, lat, lng float64) (userID string, err error)
	Register(ctx context.Context, name, phone, email, password, role string) (userID, accessToken, refreshToken string, accessExp, refreshExp time.Time, err error)
	Login(ctx context.Context, email, password string) (userID, role, accessToken, refreshToken string, accessExp, refreshExp time.Time, err error)
	ValidateToken(ctx context.Context, tokenStr string) (*token.Claims, error)
	RefreshToken(ctx context.Context, refreshToken string) (string, time.Time, error)
	GetApprovalStatus(ctx context.Context, userID string) (string, error)
	GetApprovalRequests(ctx context.Context, status, role string) ([]map[string]interface{}, error)
	ApproveRequest(ctx context.Context, approvalID, adminID string) error
	RejectRequest(ctx context.Context, approvalID, adminID, reason string) error
	GetUsers(ctx context.Context, search, role string) ([]*user.User, error)
	UpdateUserStatus(ctx context.Context, userID string, suspended bool) error
}

type usecase struct {
	repo user.UserRepository
	rdb  *redis.Client
	tm   *token.Manager
	cfg  *config.Config
}

func NewUsecase(repo user.UserRepository, rdb *redis.Client, tm *token.Manager, cfg *config.Config) Usecase {
	return &usecase{
		repo: repo,
		rdb:  rdb,
		tm:   tm,
		cfg:  cfg,
	}
}

func (uc *usecase) normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (uc *usecase) normalizePhone(phone string) string {
	return strings.TrimSpace(phone)
}

func (uc *usecase) generateTokens(userID, email, role string) (accessToken, refreshToken string, accessExp, refreshExp time.Time, err error) {
	accessExpiry := 15 * time.Minute
	if uc.cfg != nil && uc.cfg.JWTAccessExpiryMinutes > 0 {
		accessExpiry = time.Duration(uc.cfg.JWTAccessExpiryMinutes) * time.Minute
	}
	refreshExpiry := 7 * 24 * time.Hour
	if uc.cfg != nil && uc.cfg.JWTRefreshExpiryDays > 0 {
		refreshExpiry = time.Duration(uc.cfg.JWTRefreshExpiryDays) * 24 * time.Hour
	}

	accessToken, accessExp, err = uc.tm.Generate(userID, email, role, "access", accessExpiry)
	if err != nil {
		return
	}
	refreshToken, refreshExp, err = uc.tm.Generate(userID, email, role, "refresh", refreshExpiry)
	return
}

func (uc *usecase) AdminLogin(ctx context.Context, email, password string) (userID, accessToken, refreshToken string, accessExp, refreshExp time.Time, err error) {
	email = uc.normalizeEmail(email)
	u, err := uc.repo.GetByEmail(ctx, email)
	if err != nil {
		return "", "", "", time.Time{}, time.Time{}, err
	}

	if u == nil {
		// Seed admin if not exists
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return "", "", "", time.Time{}, time.Time{}, err
		}
		u = &user.User{
			ID:             uuid.NewString(),
			Name:           "Admin",
			Email:          email,
			Phone:          "00000000000",
			PasswordHash:   string(hash),
			Role:           user.RoleAdmin,
			IsVerified:     true,
			ApprovalStatus: "auto_approved",
		}
		if err := uc.repo.Create(ctx, u); err != nil {
			return "", "", "", time.Time{}, time.Time{}, err
		}
	} else {
		if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
			return "", "", "", time.Time{}, time.Time{}, errors.New("invalid admin credentials")
		}
	}

	accessToken, refreshToken, accessExp, refreshExp, err = uc.generateTokens(u.ID, u.Email, string(u.Role))
	return u.ID, accessToken, refreshToken, accessExp, refreshExp, err
}

func (uc *usecase) RegisterCustomer(ctx context.Context, name, phone, email, password string) (string, error) {
	email = uc.normalizeEmail(email)
	phone = uc.normalizePhone(phone)

	existingEmail, err := uc.repo.GetByEmail(ctx, email)
	if err == nil && existingEmail != nil {
		return "", errors.New("email already registered")
	}

	existingPhone, err := uc.repo.GetByPhone(ctx, phone)
	if err == nil && existingPhone != nil {
		return "", errors.New("phone number already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	u := &user.User{
		Name:           name,
		Phone:          phone,
		Email:          email,
		PasswordHash:   string(hash),
		Role:           user.RoleCustomer,
		IsVerified:     false,
		ApprovalStatus: "auto_approved",
	}

	if err := uc.repo.Create(ctx, u); err != nil {
		return "", err
	}

	return u.ID, nil
}

func (uc *usecase) SendOTP(ctx context.Context, contact string, otpType ...string) (string, error) {
	contact = strings.TrimSpace(contact)
	// Random 6 digit OTP
	otp := fmt.Sprintf("%06d", rand.New(rand.NewSource(time.Now().UnixNano())).Intn(900000)+100000)

	// Save to Redis
	err := uc.rdb.Set(ctx, "otp:"+contact, otp, 5*time.Minute).Err()
	if err != nil {
		return "", err
	}

	// Send email asynchronously
	isEmail := true
	if len(otpType) > 0 && otpType[0] == "sms" {
		isEmail = false
	}
	if isEmail || strings.Contains(contact, "@") {
		go func(emailAddr, code string) {
			_ = uc.sendOTPEmail(emailAddr, code)
		}(contact, otp)
	} else {
		fmt.Printf("[SMS MOCK] Verification Code for %s: %s\n", contact, otp)
	}

	return otp, nil
}

func (uc *usecase) sendOTPEmail(to, otp string) error {
	if uc.cfg == nil {
		fmt.Printf("[SMTP MOCK] Verification Code for %s: %s\n", to, otp)
		return nil
	}
	host := uc.cfg.SMTPHost
	port := uc.cfg.SMTPPort
	user := uc.cfg.SMTPUser
	pass := uc.cfg.SMTPPass
	sender := uc.cfg.SMTPSender

	if host == "" || user == "" || pass == "" {
		fmt.Printf("[SMTP MOCK] Verification Code for %s: %s\n", to, otp)
		return nil
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	subject := "SendAPro Verification Code"
	body := fmt.Sprintf("Subject: %s\r\n"+
		"MIME-version: 1.0;\r\n"+
		"Content-Type: text/html; charset=\"UTF-8\";\r\n\r\n"+
		"<html><body>"+
		"<h2>Welcome to SendAPro!</h2>"+
		"<p>Your email verification code is: <strong>%s</strong></p>"+
		"<p>This code is valid for 5 minutes.</p>"+
		"</body></html>", subject, otp)

	auth := smtp.PlainAuth("", user, pass, host)
	err := smtp.SendMail(addr, auth, sender, []string{to}, []byte(body))
	if err != nil {
		fmt.Printf("[SMTP ERROR] Failed to send email to %s: %v\n", to, err)
		return err
	}
	fmt.Printf("[SMTP SUCCESS] Verification email sent to %s\n", to)
	return nil
}

func (uc *usecase) VerifyOTP(ctx context.Context, contact string, otp string) (bool, error) {
	contact = strings.TrimSpace(contact)
	val, err := uc.rdb.Get(ctx, "otp:"+contact).Result()
	if err == redis.Nil {
		return false, errors.New("OTP expired or not found")
	} else if err != nil {
		return false, err
	}

	if val != otp {
		return false, errors.New("invalid OTP")
	}

	uc.rdb.Del(ctx, "otp:"+contact)

	if strings.Contains(contact, "@") {
		_ = uc.repo.UpdateVerificationByEmail(ctx, contact, true)
	} else {
		_ = uc.repo.UpdateVerificationByPhone(ctx, contact, true)
	}

	return true, nil
}

func (uc *usecase) VerifyOTPAndLogin(ctx context.Context, userID string, otp string) (accessToken, refreshToken string, accessExp, refreshExp time.Time, err error) {
	u, err := uc.repo.GetByID(ctx, userID)
	if err != nil || u == nil {
		return "", "", time.Time{}, time.Time{}, errors.New("user not found")
	}

	// Try verifying against email first, then phone
	val, redisErr := uc.rdb.Get(ctx, "otp:"+u.Email).Result()
	contactUsed := u.Email
	if redisErr != nil {
		val, redisErr = uc.rdb.Get(ctx, "otp:"+u.Phone).Result()
		contactUsed = u.Phone
	}

	if redisErr == redis.Nil {
		return "", "", time.Time{}, time.Time{}, errors.New("OTP expired or not found")
	} else if redisErr != nil {
		return "", "", time.Time{}, time.Time{}, redisErr
	}

	if val != otp {
		return "", "", time.Time{}, time.Time{}, errors.New("invalid OTP")
	}

	uc.rdb.Del(ctx, "otp:"+contactUsed)

	_ = uc.repo.UpdateVerificationByEmail(ctx, u.Email, true)
	_ = uc.repo.UpdateVerificationByPhone(ctx, u.Phone, true)

	accessToken, refreshToken, accessExp, refreshExp, err = uc.generateTokens(u.ID, u.Email, string(u.Role))
	return
}

func (uc *usecase) RegisterTechnician(ctx context.Context, name, phone, email, password string, skills []string, yearsExperience int) (string, error) {
	email = uc.normalizeEmail(email)
	phone = uc.normalizePhone(phone)

	existingEmail, err := uc.repo.GetByEmail(ctx, email)
	if err == nil && existingEmail != nil {
		return "", errors.New("email already registered")
	}

	existingPhone, err := uc.repo.GetByPhone(ctx, phone)
	if err == nil && existingPhone != nil {
		return "", errors.New("phone number already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	u := &user.User{
		Name:           name,
		Phone:          phone,
		Email:          email,
		PasswordHash:   string(hash),
		Role:           user.RoleTechnician,
		IsVerified:     false,
		ApprovalStatus: "pending",
	}

	if err := uc.repo.Create(ctx, u); err != nil {
		return "", err
	}

	_ = uc.repo.UpdateTechnicianDetails(ctx, u.ID, skills, yearsExperience)

	return u.ID, nil
}

func (uc *usecase) RegisterSupplier(ctx context.Context, name, phone, email, password string, address string, lat, lng float64) (string, error) {
	email = uc.normalizeEmail(email)
	phone = uc.normalizePhone(phone)

	existingEmail, err := uc.repo.GetByEmail(ctx, email)
	if err == nil && existingEmail != nil {
		return "", errors.New("email already registered")
	}

	existingPhone, err := uc.repo.GetByPhone(ctx, phone)
	if err == nil && existingPhone != nil {
		return "", errors.New("phone number already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	u := &user.User{
		Name:           name,
		Phone:          phone,
		Email:          email,
		PasswordHash:   string(hash),
		Role:           user.RoleSupplier,
		IsVerified:     false,
		ApprovalStatus: "pending",
	}

	if err := uc.repo.Create(ctx, u); err != nil {
		return "", err
	}

	_ = uc.repo.UpdateSupplierDetails(ctx, u.ID, address, lat, lng)

	return u.ID, nil
}

func (uc *usecase) Register(ctx context.Context, name, phone, email, password, role string) (userID, accessToken, refreshToken string, accessExp, refreshExp time.Time, err error) {
	var uid string
	switch user.UserRole(role) {
	case user.RoleCustomer:
		uid, err = uc.RegisterCustomer(ctx, name, phone, email, password)
	case user.RoleTechnician:
		uid, err = uc.RegisterTechnician(ctx, name, phone, email, password, []string{"electrical"}, 1)
	case user.RoleSupplier:
		uid, err = uc.RegisterSupplier(ctx, name, phone, email, password, "India", 11.0, 76.0)
	default:
		err = errors.New("invalid role")
	}

	if err != nil {
		return "", "", "", time.Time{}, time.Time{}, err
	}

	accessToken, refreshToken, accessExp, refreshExp, err = uc.generateTokens(uid, email, role)
	return uid, accessToken, refreshToken, accessExp, refreshExp, err
}

func (uc *usecase) Login(ctx context.Context, email, password string) (userID, role, accessToken, refreshToken string, accessExp, refreshExp time.Time, err error) {
	email = uc.normalizeEmail(email)
	u, err := uc.repo.GetByEmail(ctx, email)
	if err != nil {
		return "", "", "", "", time.Time{}, time.Time{}, err
	}
	if u == nil {
		return "", "", "", "", time.Time{}, time.Time{}, errors.New("invalid credentials")
	}

	if u.IsSuspended {
		return "", "", "", "", time.Time{}, time.Time{}, errors.New("user account is suspended")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return "", "", "", "", time.Time{}, time.Time{}, errors.New("invalid credentials")
	}

	if !u.IsVerified {
		return u.ID, string(u.Role), "", "", time.Time{}, time.Time{}, errors.New("email not verified")
	}

	accessToken, refreshToken, accessExp, refreshExp, err = uc.generateTokens(u.ID, u.Email, string(u.Role))
	return u.ID, string(u.Role), accessToken, refreshToken, accessExp, refreshExp, err
}

func (uc *usecase) ValidateToken(ctx context.Context, tokenStr string) (*token.Claims, error) {
	return uc.tm.Parse(tokenStr)
}

func (uc *usecase) RefreshToken(ctx context.Context, refreshToken string) (string, time.Time, error) {
	claims, err := uc.tm.Parse(refreshToken)
	if err != nil {
		return "", time.Time{}, err
	}

	if claims.Type != "refresh" {
		return "", time.Time{}, errors.New("invalid token type")
	}

	accessExpiry := 15 * time.Minute
	if uc.cfg != nil && uc.cfg.JWTAccessExpiryMinutes > 0 {
		accessExpiry = time.Duration(uc.cfg.JWTAccessExpiryMinutes) * time.Minute
	}

	accessToken, accessExp, err := uc.tm.Generate(claims.UserID, claims.Email, claims.Role, "access", accessExpiry)
	return accessToken, accessExp, err
}

func (uc *usecase) GetApprovalStatus(ctx context.Context, userID string) (string, error) {
	u, err := uc.repo.GetByID(ctx, userID)
	if err != nil || u == nil {
		return "", errors.New("user not found")
	}
	return u.ApprovalStatus, nil
}

func (uc *usecase) GetApprovalRequests(ctx context.Context, status, role string) ([]map[string]interface{}, error) {
	return uc.repo.GetApprovalRequests(ctx, status, role)
}

func (uc *usecase) ApproveRequest(ctx context.Context, approvalID, adminID string) error {
	_, _, err := uc.repo.ApproveRequest(ctx, approvalID, adminID)
	return err
}

func (uc *usecase) RejectRequest(ctx context.Context, approvalID, adminID, reason string) error {
	return uc.repo.RejectRequest(ctx, approvalID, adminID, reason)
}

func (uc *usecase) GetUsers(ctx context.Context, search, role string) ([]*user.User, error) {
	return uc.repo.GetUsers(ctx, search, role)
}

func (uc *usecase) UpdateUserStatus(ctx context.Context, userID string, suspended bool) error {
	return uc.repo.UpdateSuspensionStatus(ctx, userID, suspended)
}
