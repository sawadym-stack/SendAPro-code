package worker

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// RunApprovalExpiryWorker cleans up expired approval requests every 10 minutes
func RunApprovalExpiryWorker(db *pgxpool.Pool, rdb *redis.Client) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			expireApprovals(context.Background(), db, rdb)
		}
	}
}

func expireApprovals(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client) {
	// Find all pending approvals that have expired (past 48 hours)
	q := `
		UPDATE admin_approvals
		SET status = 'expired'
		WHERE status = 'pending' 
		AND expires_at < NOW()
	`
	result, err := db.Exec(ctx, q)
	if err != nil {
		fmt.Printf("Error updating expired approvals: %v\n", err)
		return
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected > 0 {
		fmt.Printf("Expired %d pending approval requests\n", rowsAffected)

		// Also update the users table to mark these as 'expired'
		updateUserQ := `
			UPDATE users
			SET approval_status = 'expired'
			WHERE approval_status = 'pending'
			AND approval_expires_at < NOW()
		`
		_, err = db.Exec(ctx, updateUserQ)
		if err != nil {
			fmt.Printf("Error updating user approval statuses: %v\n", err)
		}
	}
}
