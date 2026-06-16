package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	reviewv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/review/v1"
	reviewgrpc "github.com/yourname/fixflow-backend/internal/grpc/review"
	userrepo "github.com/yourname/fixflow-backend/internal/repository/postgres"
)

func main() {
	ctx := context.Background()
	postgresURL := "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable"
	db, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer db.Close()

	reviewRepository := userrepo.NewReviewRepository(db)
	jobRepository := userrepo.NewJobRepository(db)
	userRepository := userrepo.NewUserRepository(db)

	reviewService := reviewgrpc.NewServer(reviewRepository, jobRepository, userRepository, db, nil, nil)

	// Call GetReviews with Profile ID
	resp1, err := reviewService.GetReviews(ctx, &reviewv1.GetReviewsRequest{
		RevieweeId: "7b96133e-4955-4712-95eb-a3c09a53000b",
		Page:       1,
		Limit:      10,
	})
	if err != nil {
		log.Fatalf("GetReviews with Profile ID error: %v", err)
	}
	fmt.Printf("Profile ID Response: total=%d, averageRating=%f, totalRatings=%d, len(reviews)=%d\n",
		resp1.Total, resp1.AverageRating, resp1.TotalRatings, len(resp1.Reviews))

	// Call GetReviews with User ID
	resp2, err := reviewService.GetReviews(ctx, &reviewv1.GetReviewsRequest{
		RevieweeId: "6fd5c6a0-84f3-4748-89fb-2ba967405387",
		Page:       1,
		Limit:      10,
	})
	if err != nil {
		log.Fatalf("GetReviews with User ID error: %v", err)
	}
	fmt.Printf("User ID Response: total=%d, averageRating=%f, totalRatings=%d, len(reviews)=%d\n",
		resp2.Total, resp2.AverageRating, resp2.TotalRatings, len(resp2.Reviews))
}
