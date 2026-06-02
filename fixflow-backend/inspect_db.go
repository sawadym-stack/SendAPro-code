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

	fmt.Println("--- TECHNICIANS ---")
	tRows, err := db.Query(ctx, `SELECT t.id, t.user_id, u.full_name FROM technicians t JOIN users u ON t.user_id = u.id`)
	if err != nil {
		log.Fatal(err)
	}
	defer tRows.Close()
	for tRows.Next() {
		var id, userID, name string
		if err := tRows.Scan(&id, &userID, &name); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Tech: ID=%s, UserID=%s, Name=%s\n", id, userID, name)
	}

	fmt.Println("--- JOBS ---")
	jRows, err := db.Query(ctx, `SELECT id, title, technician_id, status FROM jobs`)
	if err != nil {
		log.Fatal(err)
	}
	defer jRows.Close()
	for jRows.Next() {
		var id, title, status string
		var techID *string
		if err := jRows.Scan(&id, &title, &techID, &status); err != nil {
			log.Fatal(err)
		}
		techStr := "nil"
		if techID != nil {
			techStr = *techID
		}
		fmt.Printf("Job: ID=%s, Title=%s, TechID=%s, Status=%s\n", id, title, techStr, status)
	}
}
