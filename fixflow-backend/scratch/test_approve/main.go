package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx := context.Background()
	postgresURL := "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable"
	db, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer db.Close()

	approvalID := "bab85056-6297-4a7c-9a25-c05a20958433"
	// Reset to pending first
	_, err = db.Exec(ctx, "UPDATE admin_approvals SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL WHERE id = $1", approvalID)
	if err != nil {
		log.Fatalf("reset admin_approvals: %v", err)
	}
	_, err = db.Exec(ctx, "UPDATE users SET approval_status = 'pending' WHERE id = (SELECT user_id FROM admin_approvals WHERE id = $1)", approvalID)
	if err != nil {
		log.Fatalf("reset users: %v", err)
	}
	fmt.Println("Reset approval ID to pending.")

	adminID := "00000000-0000-0000-0000-000000000001" // fallback admin ID

	fmt.Printf("Testing ApproveRequest with fallback AdminID=%s\n", adminID)

	tx, err := db.Begin(ctx)
	if err != nil {
		log.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback(ctx)

	var userID, role string
	err = tx.QueryRow(ctx, `
		SELECT user_id, user_role 
		FROM admin_approvals 
		WHERE id = $1
	`, approvalID).Scan(&userID, &role)
	if err != nil {
		log.Fatalf("step 1 select: %v", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE admin_approvals 
		SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() 
		WHERE id = $2
	`, adminID, approvalID)
	if err != nil {
		log.Fatalf("step 2 update approvals: %v", err)
	}

	err = tx.Commit(ctx)
	if err != nil {
		log.Fatalf("commit: %v", err)
	}
	fmt.Println("Committed successfully with fallback adminID!")
}
