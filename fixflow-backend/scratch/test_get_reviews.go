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

	techUserID := "6fd5c6a0-84f3-4748-89fb-2ba967405387"

	var total int
	err = db.QueryRow(ctx, `SELECT COUNT(*) FROM reviews WHERE reviewee_id = $1`, techUserID).Scan(&total)
	if err != nil {
		log.Fatalf("count error: %v", err)
	}
	fmt.Printf("Total count: %d\n", total)

	q := `SELECT r.id, r.job_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at, u.full_name as reviewer_name
FROM reviews r
JOIN users u ON u.id = r.reviewer_id
WHERE r.reviewee_id = $1`
	rows, err := db.Query(ctx, q, techUserID)
	if err != nil {
		log.Fatalf("query error: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, jid, rver, rvee, comment, rname string
		var rating int
		var created interface{}
		err = rows.Scan(&id, &jid, &rver, &rvee, &rating, &comment, &created, &rname)
		if err != nil {
			log.Fatalf("scan error: %v", err)
		}
		fmt.Printf("Review: ID=%s, ReviewerName=%s, Rating=%d, Comment=%s\n", id, rname, rating, comment)
	}

	var avg float64
	var count int
	err = db.QueryRow(ctx, `SELECT COALESCE(AVG(rating)::numeric, 0.0), COUNT(*) FROM reviews WHERE reviewee_id = $1`, techUserID).Scan(&avg, &count)
	if err != nil {
		log.Fatalf("avg error: %v", err)
	}
	fmt.Printf("Average rating: %f, count: %d\n", avg, count)
}
