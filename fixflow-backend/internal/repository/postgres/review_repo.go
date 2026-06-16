package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/domain/review"
)

type ReviewRepository struct {
	db *pgxpool.Pool
}

func NewReviewRepository(db *pgxpool.Pool) *ReviewRepository {
	return &ReviewRepository{db: db}
}

func (r *ReviewRepository) SubmitReview(ctx context.Context, rev review.Review) (review.Review, error) {
	q := `INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment, image_urls, created_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
RETURNING id, job_id, reviewer_id, reviewee_id, rating, comment, image_urls, created_at`

	var saved review.Review
	err := r.db.QueryRow(ctx, q, rev.JobID, rev.ReviewerID, rev.RevieweeID, rev.Rating, rev.Comment, rev.ImageURLs).
		Scan(&saved.ID, &saved.JobID, &saved.ReviewerID, &saved.RevieweeID, &saved.Rating, &saved.Comment, &saved.ImageURLs, &saved.CreatedAt)
	if err != nil {
		return review.Review{}, err
	}
	return saved, nil
}

func (r *ReviewRepository) HasReviewed(ctx context.Context, jobID, reviewerID string) (bool, error) {
	var exists bool
	q := `SELECT EXISTS(SELECT 1 FROM reviews WHERE job_id = $1 AND reviewer_id = $2)`
	err := r.db.QueryRow(ctx, q, jobID, reviewerID).Scan(&exists)
	return exists, err
}

func (r *ReviewRepository) GetReviews(ctx context.Context, revieweeID string, page, limit int) ([]review.Review, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	offset := (page - 1) * limit

	var total int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM reviews WHERE reviewee_id = $1`, revieweeID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	q := `SELECT r.id, r.job_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.image_urls, r.created_at, u.full_name as reviewer_name
FROM reviews r
JOIN users u ON u.id = r.reviewer_id
WHERE r.reviewee_id = $1
ORDER BY r.created_at DESC
LIMIT $2 OFFSET $3`

	rows, err := r.db.Query(ctx, q, revieweeID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := make([]review.Review, 0)
	for rows.Next() {
		var rev review.Review
		err := rows.Scan(&rev.ID, &rev.JobID, &rev.ReviewerID, &rev.RevieweeID, &rev.Rating, &rev.Comment, &rev.ImageURLs, &rev.CreatedAt, &rev.ReviewerName)
		if err != nil {
			return nil, 0, err
		}
		list = append(list, rev)
	}
	return list, total, nil
}

func (r *ReviewRepository) GetAverageRating(ctx context.Context, revieweeID string) (float64, int, error) {
	q := `SELECT COALESCE(AVG(rating)::numeric, 0.0), COUNT(*) FROM reviews WHERE reviewee_id = $1`
	var avg float64
	var count int
	err := r.db.QueryRow(ctx, q, revieweeID).Scan(&avg, &count)
	return avg, count, err
}
