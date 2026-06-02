package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/domain/user"
)

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, u *user.User) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := `INSERT INTO users (full_name, phone, email, password_hash, role, is_verified, approval_status, approval_requested_at, approval_expires_at)
	      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	      RETURNING id, created_at, updated_at`
	approvalStatus := "auto_approved"
	if u.Role == "technician" || u.Role == "supplier" {
		approvalStatus = "pending"
	}
	err = tx.QueryRow(ctx, q, u.Name, u.Phone, u.Email, u.PasswordHash, string(u.Role), u.IsVerified, approvalStatus, u.ApprovalRequestedAt, u.ApprovalExpiresAt).
		Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return err
	}

	if u.Role == "technician" || u.Role == "supplier" {
		var approvalID string
		qApproval := `INSERT INTO admin_approvals (user_id, user_role, expires_at)
		              VALUES ($1, $2, NOW() + INTERVAL '48 hours')
		              RETURNING id`
		err = tx.QueryRow(ctx, qApproval, u.ID, string(u.Role)).Scan(&approvalID)
		if err != nil {
			return err
		}

		if u.Role == "technician" {
			qTech := `INSERT INTO technicians (user_id, skills, years_experience, service_radius_km, is_available, approval_id)
			          VALUES ($1, $2, 1, 50.0, true, $3)`
			_, err = tx.Exec(ctx, qTech, u.ID, []string{"electrical", "plumbing", "ac_repair"}, approvalID)
			if err != nil {
				return err
			}
		}

		if u.Role == "supplier" {
			qSupp := `INSERT INTO suppliers (user_id, name, email, phone, address, business_name, contact_email, contact_phone, approval_id)
			          VALUES ($1, $2, $3, $4, 'India', $2, $3, $4, $5) ON CONFLICT DO NOTHING`
			_, err = tx.Exec(ctx, qSupp, u.ID, u.Name, u.Email, u.Phone, approvalID)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*user.User, error) {
	q := `SELECT id, full_name, phone, email, password_hash, role, is_verified, COALESCE(approval_status, 'auto_approved'), approval_requested_at, approval_expires_at, is_email_verified, is_phone_verified, is_suspended, created_at, updated_at
	      FROM users WHERE id = $1`
	u := &user.User{}
	err := r.db.QueryRow(ctx, q, id).Scan(
		&u.ID, &u.Name, &u.Phone, &u.Email, &u.PasswordHash, &u.Role, &u.IsVerified, &u.ApprovalStatus, &u.ApprovalRequestedAt, &u.ApprovalExpiresAt, &u.IsEmailVerified, &u.IsPhoneVerified, &u.IsSuspended, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*user.User, error) {
	q := `SELECT id, full_name, phone, email, password_hash, role, is_verified, COALESCE(approval_status, 'auto_approved'), approval_requested_at, approval_expires_at, is_email_verified, is_phone_verified, is_suspended, created_at, updated_at
	      FROM users WHERE email = $1`

	u := &user.User{}
	err := r.db.QueryRow(ctx, q, email).Scan(
		&u.ID, &u.Name, &u.Phone, &u.Email, &u.PasswordHash, &u.Role, &u.IsVerified, &u.ApprovalStatus, &u.ApprovalRequestedAt, &u.ApprovalExpiresAt, &u.IsEmailVerified, &u.IsPhoneVerified, &u.IsSuspended, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) GetByPhone(ctx context.Context, phone string) (*user.User, error) {
	q := `SELECT id, full_name, phone, email, password_hash, role, is_verified, COALESCE(approval_status, 'auto_approved'), approval_requested_at, approval_expires_at, is_email_verified, is_phone_verified, is_suspended, created_at, updated_at
	      FROM users WHERE phone = $1`
	u := &user.User{}
	err := r.db.QueryRow(ctx, q, phone).Scan(
		&u.ID, &u.Name, &u.Phone, &u.Email, &u.PasswordHash, &u.Role, &u.IsVerified, &u.ApprovalStatus, &u.ApprovalRequestedAt, &u.ApprovalExpiresAt, &u.IsEmailVerified, &u.IsPhoneVerified, &u.IsSuspended, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) UpdateVerificationByPhone(ctx context.Context, phone string, verified bool) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET is_verified = $1, is_phone_verified = $2, updated_at = NOW() WHERE phone = $3`, verified, verified, phone)
	return err
}

func (r *UserRepository) UpdateVerificationByEmail(ctx context.Context, email string, verified bool) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET is_email_verified = $1, is_verified = $2, updated_at = NOW() WHERE email = $3`, verified, verified, email)
	return err
}

func (r *UserRepository) UpdatePasswordHashByID(ctx context.Context, userID, passwordHash string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, passwordHash, userID)
	return err
}

func (r *UserRepository) UpdateApprovalStatus(ctx context.Context, userID, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET approval_status = $1, updated_at = NOW() WHERE id = $2`, status, userID)
	return err
}

func (r *UserRepository) UpdateTechnicianDetails(ctx context.Context, userID string, skills []string, yearsExperience int) error {
	_, err := r.db.Exec(ctx, `UPDATE technicians SET skills = $1, years_experience = $2 WHERE user_id = $3`, skills, yearsExperience, userID)
	return err
}

func (r *UserRepository) UpdateSupplierDetails(ctx context.Context, userID string, address string, lat, lng float64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE suppliers 
		SET address = $1, location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography 
		WHERE user_id = $4
	`, address, lng, lat, userID)
	return err
}

func (r *UserRepository) GetApprovalRequests(ctx context.Context, status, role string) ([]map[string]interface{}, error) {
	q := `
		SELECT 
			a.id::text, 
			a.user_id::text, 
			u.full_name, 
			u.email, 
			u.phone, 
			a.user_role, 
			a.status, 
			a.requested_at, 
			a.expires_at,
			t.skills,
			t.years_experience,
			s.address
		FROM admin_approvals a
		JOIN users u ON a.user_id = u.id
		LEFT JOIN technicians t ON u.id = t.user_id
		LEFT JOIN suppliers s ON u.id = s.user_id
		WHERE ($1 = '' OR a.status = $1)
		  AND ($2 = '' OR a.user_role = $2)
		ORDER BY a.requested_at DESC
	`
	rows, err := r.db.Query(ctx, q, status, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []map[string]interface{}
	for rows.Next() {
		var id, userID, fullName, email, phone, userRole, reqStatus string
		var requestedAt, expiresAt time.Time
		var skills []string
		var yearsExperience *int
		var address *string

		err := rows.Scan(
			&id, &userID, &fullName, &email, &phone, &userRole, &reqStatus, &requestedAt, &expiresAt,
			&skills, &yearsExperience, &address,
		)
		if err != nil {
			return nil, err
		}

		req := map[string]interface{}{
			"id":          id,
			"userId":      userID,
			"userName":    fullName,
			"email":       email,
			"phone":       phone,
			"role":        userRole,
			"status":      reqStatus,
			"requestedAt": requestedAt.Format(time.RFC3339),
			"expiresAt":   expiresAt.Format(time.RFC3339),
		}
		if userRole == "technician" {
			req["skills"] = skills
			if yearsExperience != nil {
				req["yearsExperience"] = *yearsExperience
			} else {
				req["yearsExperience"] = 0
			}
		} else if userRole == "supplier" {
			if address != nil {
				req["address"] = *address
			} else {
				req["address"] = ""
			}
		}
		requests = append(requests, req)
	}
	return requests, nil
}

func (r *UserRepository) ApproveRequest(ctx context.Context, approvalID, adminID string) (string, string, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback(ctx)

	// 1. Fetch details of request
	var userID, role string
	err = tx.QueryRow(ctx, `
		SELECT user_id, user_role 
		FROM admin_approvals 
		WHERE id = $1
	`, approvalID).Scan(&userID, &role)
	if err != nil {
		return "", "", err
	}

	// 2. Update admin_approvals
	_, err = tx.Exec(ctx, `
		UPDATE admin_approvals 
		SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() 
		WHERE id = $2
	`, adminID, approvalID)
	if err != nil {
		return "", "", err
	}

	// 3. Update users table
	_, err = tx.Exec(ctx, `
		UPDATE users 
		SET approval_status = 'approved', updated_at = NOW() 
		WHERE id = $1
	`, userID)
	if err != nil {
		return "", "", err
	}

	err = tx.Commit(ctx)
	if err != nil {
		return "", "", err
	}

	return userID, role, nil
}

func (r *UserRepository) RejectRequest(ctx context.Context, approvalID, adminID, reason string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `
		SELECT user_id FROM admin_approvals WHERE id = $1
	`, approvalID).Scan(&userID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE admin_approvals 
		SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2 
		WHERE id = $3
	`, adminID, reason, approvalID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE users 
		SET approval_status = 'rejected', updated_at = NOW() 
		WHERE id = $1
	`, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *UserRepository) GetSupplierGeo(ctx context.Context, userID string, sid *string, lat *float64, lng *float64) error {
	err := r.db.QueryRow(ctx, `
		SELECT id::text, ST_Y(location::geometry), ST_X(location::geometry) 
		FROM suppliers 
		WHERE user_id = $1
	`, userID).Scan(sid, lat, lng)
	return err
}

func (r *UserRepository) GetUsers(ctx context.Context, search, role string) ([]*user.User, error) {
	q := `SELECT id, full_name, phone, email, password_hash, role, is_verified, COALESCE(approval_status, 'auto_approved'), approval_requested_at, approval_expires_at, is_email_verified, is_phone_verified, is_suspended, created_at, updated_at
	      FROM users
	      WHERE ($1 = '' OR (full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%' OR phone ILIKE '%' || $1 || '%'))
	        AND ($2 = '' OR role = $2)
	      ORDER BY created_at DESC`
	rows, err := r.db.Query(ctx, q, search, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*user.User
	for rows.Next() {
		u := &user.User{}
		err := rows.Scan(
			&u.ID, &u.Name, &u.Phone, &u.Email, &u.PasswordHash, &u.Role, &u.IsVerified, &u.ApprovalStatus, &u.ApprovalRequestedAt, &u.ApprovalExpiresAt, &u.IsEmailVerified, &u.IsPhoneVerified, &u.IsSuspended, &u.CreatedAt, &u.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) UpdateSuspensionStatus(ctx context.Context, userID string, suspended bool) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET is_suspended = $1, updated_at = NOW() WHERE id = $2`, suspended, userID)
	return err
}
