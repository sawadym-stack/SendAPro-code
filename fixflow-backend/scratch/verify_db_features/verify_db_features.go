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

	fmt.Println("Checking tables...")

	var existsPlatformFees bool
	err = db.QueryRow(ctx, `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'technician_platform_fees')`).Scan(&existsPlatformFees)
	if err != nil {
		log.Fatalf("error checking platform fees table: %v", err)
	}
	fmt.Printf("Table 'technician_platform_fees' exists: %v\n", existsPlatformFees)

	var existsRewards bool
	err = db.QueryRow(ctx, `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'technician_rewards')`).Scan(&existsRewards)
	if err != nil {
		log.Fatalf("error checking rewards table: %v", err)
	}
	fmt.Printf("Table 'technician_rewards' exists: %v\n", existsRewards)

	if existsPlatformFees {
		var count int
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM technician_platform_fees`).Scan(&count)
		fmt.Printf("Count of technician_platform_fees: %d\n", count)
	}

	if existsRewards {
		var count int
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM technician_rewards`).Scan(&count)
		fmt.Printf("Count of technician_rewards: %d\n", count)
	}

	fmt.Println("Verification complete.")
}
