package main

import (
	"context"
	"fmt"
	"log"

	"github.com/yourname/fixflow-backend/internal/pkg/config"
	"github.com/yourname/fixflow-backend/internal/pkg/database"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := database.NewPostgres(ctx, cfg.PostgresURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	var count int
	err = db.QueryRow(ctx, "SELECT COUNT(*) FROM materials WHERE supplier_id = 'fea17e7d-c59d-4564-b753-825384bd02e8'").Scan(&count)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Current Materials Count for Supplier: %d\n", count)

	var totalCount int
	err = db.QueryRow(ctx, "SELECT COUNT(*) FROM materials").Scan(&totalCount)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Total Materials Count: %d\n", totalCount)
}
