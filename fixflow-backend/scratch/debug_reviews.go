package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable")
	if err != nil {
		fmt.Println("DB connect error:", err)
		os.Exit(1)
	}
	defer db.Close()

	fmt.Println("=== ALL REVIEWS ===")
	rows, err := db.Query(ctx, `
		SELECT r.id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at
		FROM reviews r
		ORDER BY r.created_at DESC
		LIMIT 20
	`)
	if err != nil {
		fmt.Println("Query error:", err)
		os.Exit(1)
	}
	defer rows.Close()
	for rows.Next() {
		var id, reviewerID, revieweeID, comment string
		var rating int
		var createdAt interface{}
		_ = rows.Scan(&id, &reviewerID, &revieweeID, &rating, &comment, &createdAt)
		fmt.Printf("  Review: id=%s reviewer=%s reviewee=%s rating=%d comment=%q createdAt=%v\n", id, reviewerID, revieweeID, rating, comment, createdAt)
	}

	fmt.Println("\n=== ALL TECHNICIANS (id vs user_id) ===")
	trows, err := db.Query(ctx, `SELECT id, user_id, COALESCE(avg_rating, 0), COALESCE(review_count, 0) FROM technicians`)
	if err != nil {
		fmt.Println("Query error:", err)
		os.Exit(1)
	}
	defer trows.Close()
	for trows.Next() {
		var id, userID string
		var avgRating float64
		var reviewCount int
		_ = trows.Scan(&id, &userID, &avgRating, &reviewCount)
		fmt.Printf("  Tech: id=%s user_id=%s avg_rating=%.1f review_count=%d\n", id, userID, avgRating, reviewCount)
	}

	fmt.Println("\n=== CURRENT USER (auth store check) ===")
	fmt.Println("The frontend passes user?.id to ReviewsSection.")
	fmt.Println("user.id comes from the auth store which uses the users table ID.")
	fmt.Println("Reviews are stored with reviewee_id = user_id (resolved from technicians table).")
	fmt.Println("So the query should work if user.id matches reviewee_id in reviews.")

	// Check if any reviews match user_id lookup
	fmt.Println("\n=== MATCHING TEST ===")
	mrows, err := db.Query(ctx, `
		SELECT t.user_id, COUNT(r.id) as review_count
		FROM technicians t
		LEFT JOIN reviews r ON r.reviewee_id = t.user_id
		GROUP BY t.user_id
	`)
	if err != nil {
		fmt.Println("Query error:", err)
		os.Exit(1)
	}
	defer mrows.Close()
	for mrows.Next() {
		var userID string
		var count int
		_ = mrows.Scan(&userID, &count)
		fmt.Printf("  Tech user_id=%s => reviews matched=%d\n", userID, count)
	}
}
