package auth

import (
	"context"
	"testing"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/domain/user"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

type fakeUserRepo struct {
	user.UserRepository
	byEmail map[string]*user.User
	byPhone map[string]*user.User
}

func (f *fakeUserRepo) Create(_ context.Context, u *user.User) error {
	u.ID = "u1"
	f.byEmail[u.Email] = u
	f.byPhone[u.Phone] = u
	return nil
}
func (f *fakeUserRepo) GetByID(_ context.Context, id string) (*user.User, error) {
	for _, u := range f.byEmail {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, nil
}
func (f *fakeUserRepo) GetByEmail(_ context.Context, email string) (*user.User, error) {
	return f.byEmail[email], nil
}
func (f *fakeUserRepo) GetByPhone(_ context.Context, phone string) (*user.User, error) {
	return f.byPhone[phone], nil
}
func (f *fakeUserRepo) UpdateVerificationByPhone(_ context.Context, phone string, verified bool) error {
	if u := f.byPhone[phone]; u != nil {
		u.IsVerified = verified
	}
	return nil
}
func (f *fakeUserRepo) UpdateVerificationByEmail(_ context.Context, email string, verified bool) error {
	if u := f.byEmail[email]; u != nil {
		u.IsVerified = verified
	}
	return nil
}
func (f *fakeUserRepo) UpdatePasswordHashByID(_ context.Context, userID, passwordHash string) error {
	for _, u := range f.byEmail {
		if u.ID == userID {
			u.PasswordHash = passwordHash
			return nil
		}
	}
	return nil
}

func TestRegisterLoginAndOTP(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	repo := &fakeUserRepo{byEmail: map[string]*user.User{}, byPhone: map[string]*user.User{}}
	tm := token.NewManager("secret")
	uc := NewUsecase(repo, rdb, tm, nil)

	uid, _, _, _, _, err := uc.Register(context.Background(), "Sawad", "9526659669", "sawad@example.com", "Pass@123", "customer")
	if err != nil || uid == "" {
		t.Fatalf("register failed: %v", err)
	}

	// Unverified user login should fail
	_, _, _, _, _, _, err = uc.Login(context.Background(), "sawad@example.com", "Pass@123")
	if err == nil || err.Error() != "email not verified" {
		t.Fatalf("expected email not verified error, got: %v", err)
	}

	// Send OTP
	otpCode, err := uc.SendOTP(context.Background(), "sawad@example.com")
	if err != nil {
		t.Fatalf("send otp: %v", err)
	}

	// Verify OTP
	verified, err := uc.VerifyOTP(context.Background(), "sawad@example.com", otpCode)
	if err != nil || !verified {
		t.Fatalf("verify otp failed: %v", err)
	}

	// Now login should succeed
	_, _, access2, _, _, _, err := uc.Login(context.Background(), "sawad@example.com", "Pass@123")
	if err != nil || access2 == "" {
		t.Fatalf("login failed: %v", err)
	}
}

func TestLoginInvalidPassword(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	repo := &fakeUserRepo{byEmail: map[string]*user.User{}, byPhone: map[string]*user.User{}}
	tm := token.NewManager("secret")
	uc := NewUsecase(repo, rdb, tm, nil)
	_, _, _, _, _, err := uc.Register(context.Background(), "Sawad", "9526659669", "sawad2@example.com", "Pass@123", "customer")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, _, _, _, err := uc.Login(context.Background(), "sawad2@example.com", "bad"); err == nil {
		t.Fatal("expected invalid credentials")
	}
}

func TestEmailNormalization(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	repo := &fakeUserRepo{byEmail: map[string]*user.User{}, byPhone: map[string]*user.User{}}
	tm := token.NewManager("secret")
	uc := NewUsecase(repo, rdb, tm, nil)

	// Register with mixed case and leading/trailing spaces
	uid, _, _, _, _, err := uc.Register(context.Background(), "Sawad", "9526659669", "  Sawad@Example.com  ", "Pass@123", "customer")
	if err != nil || uid == "" {
		t.Fatalf("register failed: %v", err)
	}

	// Send & verify OTP
	otpCode, err := uc.SendOTP(context.Background(), "sawad@example.com")
	if err != nil {
		t.Fatalf("send otp: %v", err)
	}
	_, _ = uc.VerifyOTP(context.Background(), "sawad@example.com", otpCode)

	// Login with different case and trailing spaces
	_, _, access2, _, _, _, err := uc.Login(context.Background(), " sawad@example.com ", "Pass@123")
	if err != nil || access2 == "" {
		t.Fatalf("login failed: %v", err)
	}
}
