package review

import (
	"context"
	"time"
)

type Review struct {
	ID           string    `json:"id"`
	JobID        string    `json:"jobId"`
	ReviewerID   string    `json:"reviewerId"`
	RevieweeID   string    `json:"revieweeId"`
	ReviewerName string    `json:"reviewerName"`
	Rating       int       `json:"rating"` // 1-5
	Comment      string    `json:"comment"`
	ImageURLs    []string  `json:"imageUrls"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Repository interface {
	SubmitReview(ctx context.Context, review Review) (Review, error)
	GetReviews(ctx context.Context, revieweeID string, page, limit int) ([]Review, int, error)
	HasReviewed(ctx context.Context, jobID, reviewerID string) (bool, error)
	GetAverageRating(ctx context.Context, revieweeID string) (float64, int, error)
}
