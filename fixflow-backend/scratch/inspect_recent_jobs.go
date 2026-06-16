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

	fmt.Println("=== LATEST 10 JOBS ===")
	rows, err := db.Query(ctx, `
		SELECT id, title, description, status, technician_id, created_at
		FROM jobs
		ORDER BY created_at DESC
		LIMIT 10
	`)
	if err != nil {
		log.Fatalf("query error: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var jid, title, desc, status string
		var techID *string
		var createdAt interface{}
		_ = rows.Scan(&jid, &title, &desc, &status, &techID, &createdAt)
		techStr := "nil"
		if techID != nil {
			techStr = *techID
		}
		fmt.Printf("Job: ID=%s, Title=%s, Status=%s, Tech=%s, Created=%v\n", jid, title, status, techStr, createdAt)
	}
}
