package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/domain/dispute"
)

type DisputeRepository struct {
	db *pgxpool.Pool
}

func NewDisputeRepository(db *pgxpool.Pool) *DisputeRepository {
	return &DisputeRepository{db: db}
}

func (r *DisputeRepository) CreateDispute(ctx context.Context, d dispute.Dispute) (dispute.Dispute, error) {
	q := `INSERT INTO disputes (job_id, raised_by_id, against_id, reason, description, evidence_urls, status, created_at)
VALUES ($1, $2, $3, $4, $5, $6, 'Open', NOW())
RETURNING id, job_id, raised_by_id, against_id, reason, description, evidence_urls, status, created_at`

	var saved dispute.Dispute
	err := r.db.QueryRow(ctx, q, d.JobID, d.RaisedByID, d.AgainstID, d.Reason, d.Description, d.EvidenceURLs).
		Scan(&saved.ID, &saved.JobID, &saved.RaisedByID, &saved.AgainstID, &saved.Reason, &saved.Description, &saved.EvidenceURLs, &saved.Status, &saved.CreatedAt)
	if err != nil {
		return dispute.Dispute{}, err
	}
	return saved, nil
}

func (r *DisputeRepository) GetDispute(ctx context.Context, disputeID string) (dispute.Dispute, error) {
	q := `SELECT d.id, d.job_id, d.raised_by_id, d.against_id, d.reason, d.description, d.evidence_urls, d.status,
COALESCE(d.admin_note, ''), COALESCE(d.action, ''), d.resolved_at, d.created_at, u.name as raised_by_name
FROM disputes d
JOIN users u ON u.id = d.raised_by_id
WHERE d.id = $1`

	var d dispute.Dispute
	err := r.db.QueryRow(ctx, q, disputeID).
		Scan(&d.ID, &d.JobID, &d.RaisedByID, &d.AgainstID, &d.Reason, &d.Description, &d.EvidenceURLs, &d.Status, &d.AdminNote, &d.Action, &d.ResolvedAt, &d.CreatedAt, &d.RaisedByName)
	if err != nil {
		return dispute.Dispute{}, err
	}
	return d, nil
}

func (r *DisputeRepository) UpdateDispute(ctx context.Context, d dispute.Dispute) (dispute.Dispute, error) {
	q := `UPDATE disputes SET status = $1, admin_note = $2, action = $3, resolved_at = $4 WHERE id = $5
RETURNING id, job_id, raised_by_id, against_id, reason, description, evidence_urls, status, COALESCE(admin_note, ''), COALESCE(action, ''), resolved_at, created_at`

	var updated dispute.Dispute
	err := r.db.QueryRow(ctx, q, d.Status, d.AdminNote, d.Action, d.ResolvedAt, d.ID).
		Scan(&updated.ID, &updated.JobID, &updated.RaisedByID, &updated.AgainstID, &updated.Reason, &updated.Description, &updated.EvidenceURLs, &updated.Status, &updated.AdminNote, &updated.Action, &updated.ResolvedAt, &updated.CreatedAt)
	if err != nil {
		return dispute.Dispute{}, err
	}
	return updated, nil
}

func (r *DisputeRepository) ListDisputes(ctx context.Context, filter dispute.DisputeFilter) ([]dispute.Dispute, int, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 10
	}
	offset := (filter.Page - 1) * filter.Limit

	// Build count query
	countQ := `SELECT COUNT(*) FROM disputes d WHERE (1=1)`
	var countArgs []interface{}
	argIdx := 1

	if !filter.IsAdmin {
		countQ += fmt.Sprintf(" AND (d.raised_by_id = $%d OR d.against_id = $%d)", argIdx, argIdx)
		countArgs = append(countArgs, filter.RaisedByID)
		argIdx++
	}
	if filter.Status != "" {
		countQ += fmt.Sprintf(" AND d.status = $%d", argIdx)
		countArgs = append(countArgs, filter.Status)
		argIdx++
	}
	if filter.JobID != "" {
		countQ += fmt.Sprintf(" AND d.job_id = $%d", argIdx)
		countArgs = append(countArgs, filter.JobID)
		argIdx++
	}

	var total int
	err := r.db.QueryRow(ctx, countQ, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Build select query
	selectQ := `SELECT d.id, d.job_id, d.raised_by_id, d.against_id, d.reason, d.description, d.evidence_urls, d.status,
COALESCE(d.admin_note, ''), COALESCE(d.action, ''), d.resolved_at, d.created_at, u.name as raised_by_name
FROM disputes d
JOIN users u ON u.id = d.raised_by_id
WHERE (1=1)`

	var selectArgs []interface{}
	argIdx = 1

	if !filter.IsAdmin {
		selectQ += fmt.Sprintf(" AND (d.raised_by_id = $%d OR d.against_id = $%d)", argIdx, argIdx)
		selectArgs = append(selectArgs, filter.RaisedByID)
		argIdx++
	}
	if filter.Status != "" {
		selectQ += fmt.Sprintf(" AND d.status = $%d", argIdx)
		selectArgs = append(selectArgs, filter.Status)
		argIdx++
	}
	if filter.JobID != "" {
		selectQ += fmt.Sprintf(" AND d.job_id = $%d", argIdx)
		selectArgs = append(selectArgs, filter.JobID)
		argIdx++
	}

	// Order by Open first, then UnderReview, then others, then created_at DESC
	selectQ += ` ORDER BY 
		CASE d.status 
			WHEN 'Open' THEN 1 
			WHEN 'UnderReview' THEN 2 
			ELSE 3 
		END,
		d.created_at DESC`

	selectQ += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	selectArgs = append(selectArgs, filter.Limit, offset)

	rows, err := r.db.Query(ctx, selectQ, selectArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := make([]dispute.Dispute, 0)
	for rows.Next() {
		var d dispute.Dispute
		err := rows.Scan(&d.ID, &d.JobID, &d.RaisedByID, &d.AgainstID, &d.Reason, &d.Description, &d.EvidenceURLs, &d.Status, &d.AdminNote, &d.Action, &d.ResolvedAt, &d.CreatedAt, &d.RaisedByName)
		if err != nil {
			return nil, 0, err
		}
		list = append(list, d)
	}
	return list, total, nil
}

func (r *DisputeRepository) AppendEvidence(ctx context.Context, disputeID, url string) error {
	q := `UPDATE disputes SET evidence_urls = array_append(evidence_urls, $1) WHERE id = $2`
	ct, err := r.db.Exec(ctx, q, url, disputeID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("dispute not found")
	}
	return nil
}
