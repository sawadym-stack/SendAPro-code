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

	fmt.Println("=== SHAMEER PROFILE IN DATABASE ===")
	var id, userID, name string
	var skills []string
	var isAvailable bool
	var location interface{}
	err = db.QueryRow(ctx, `
		SELECT t.id, t.user_id, u.full_name, t.skills, t.is_available, ST_AsText(t.current_location::geometry)
		FROM technicians t
		JOIN users u ON t.user_id = u.id
		WHERE u.email = 'sawadymofficial@gmail.com'
	`).Scan(&id, &userID, &name, &skills, &isAvailable, &location)
	if err != nil {
		log.Fatalf("query error: %v", err)
	}
	fmt.Printf("Tech: ID=%s\nUser ID=%s\nName=%s\nSkills=%v\nIsAvailable=%v\nLocation=%v\n", id, userID, name, skills, isAvailable, location)

	fmt.Println("\n=== REQUESTED JOBS IN DATABASE ===")
	rows, err := db.Query(ctx, `
		SELECT id, title, description, status, ST_AsText(location::geometry), technician_id, created_at
		FROM jobs
		WHERE status = 'Requested'
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var jid, title, desc, status, locStr string
			var techID *string
			var createdAt interface{}
			_ = rows.Scan(&jid, &title, &desc, &status, &locStr, &techID, &createdAt)
			techStr := "nil"
			if techID != nil {
				techStr = *techID
			}
			fmt.Printf("Job: ID=%s, Title=%s, Desc=%s, Status=%s, Location=%s, Tech=%s, Created=%v\n", jid, title, desc, status, locStr, techStr, createdAt)
		}
	}
}
