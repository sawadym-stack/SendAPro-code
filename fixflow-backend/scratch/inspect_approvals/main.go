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

	fmt.Println("--- ADMIN APPROVALS ---")
	rows, err := db.Query(ctx, `SELECT id, user_id, user_role, status, reviewed_by, reviewed_at FROM admin_approvals`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, userID, userRole, status string
		var reviewedBy, reviewedAt interface{}
		if err := rows.Scan(&id, &userID, &userRole, &status, &reviewedBy, &reviewedAt); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Approval: ID=%s, UserID=%s, Role=%s, Status=%s, ReviewedBy=%v, ReviewedAt=%v\n", id, userID, userRole, status, reviewedBy, reviewedAt)
	}

	fmt.Println("--- USER STATUS ---")
	uRows, err := db.Query(ctx, `SELECT id, full_name, email, role, approval_status, is_verified FROM users WHERE id IN (SELECT user_id FROM admin_approvals)`)
	if err != nil {
		log.Fatal(err)
	}
	defer uRows.Close()
	for uRows.Next() {
		var id, fullName, email, role, approvalStatus string
		var isVerified bool
		if err := uRows.Scan(&id, &fullName, &email, &role, &approvalStatus, &isVerified); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("User: ID=%s, Name=%s, Email=%s, Role=%s, ApprovalStatus=%s, Verified=%v\n", id, fullName, email, role, approvalStatus, isVerified)
	}
}
