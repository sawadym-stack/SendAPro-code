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

	fmt.Println("=== JOB DETAIL ===")
	var id, customerID, title, status string
	var techID *string
	err = db.QueryRow(ctx, `
		SELECT id, customer_id, technician_id, title, status
		FROM jobs
		WHERE id = 'beb4dd02-c858-4ab9-9233-7c784e7da8be'
	`).Scan(&id, &customerID, &techID, &title, &status)
	if err != nil {
		log.Fatalf("query error: %v", err)
	}
	techStr := "nil"
	if techID != nil {
		techStr = *techID
	}
	fmt.Printf("Job: ID=%s, CustomerID=%s, TechID=%s, Title=%s, Status=%s\n", id, customerID, techStr, title, status)
}
