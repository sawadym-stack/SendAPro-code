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

	fmt.Println("--- USERS ---")
	rows, err := db.Query(ctx, `SELECT id, full_name, email, role FROM users`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, name, email, role string
			rows.Scan(&id, &name, &email, &role)
			fmt.Printf("User: ID=%s, Name=%s, Email=%s, Role=%s\n", id, name, email, role)
		}
	}

	fmt.Println("--- TECHNICIANS ---")
	trows, err := db.Query(ctx, `SELECT id, user_id, avg_rating, review_count FROM technicians`)
	if err == nil {
		defer trows.Close()
		for trows.Next() {
			var id, uid string
			var rating float64
			var count int
			trows.Scan(&id, &uid, &rating, &count)
			fmt.Printf("Tech: ProfileID=%s, UserID=%s, Rating=%f, Count=%d\n", id, uid, rating, count)
		}
	}

	fmt.Println("--- REVIEWS ---")
	rrows, err := db.Query(ctx, `SELECT id, job_id, reviewer_id, reviewee_id, rating, comment FROM reviews`)
	if err == nil {
		defer rrows.Close()
		for rrows.Next() {
			var id, jid, rver, rvee, comment string
			var rating int
			rrows.Scan(&id, &jid, &rver, &rvee, &rating, &comment)
			fmt.Printf("Review: ID=%s, JobID=%s, ReviewerID=%s, RevieweeID=%s, Rating=%d, Comment=%s\n", id, jid, rver, rvee, rating, comment)
		}
	}
}
