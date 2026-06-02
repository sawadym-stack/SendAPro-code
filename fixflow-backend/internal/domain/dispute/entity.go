package dispute

import (
	"context"
	"time"
)

type DisputeReason string

const (
	ReasonPoorQuality    DisputeReason = "poor_quality"
	ReasonNoShow         DisputeReason = "no_show"
	ReasonOvercharged    DisputeReason = "overcharged"
	ReasonUnprofessional DisputeReason = "unprofessional"
	ReasonOther          DisputeReason = "other"
)

type DisputeStatus string

const (
	StatusOpen        DisputeStatus = "Open"
	StatusUnderReview DisputeStatus = "UnderReview"
	StatusResolved    DisputeStatus = "Resolved"
	StatusEscalated   DisputeStatus = "Escalated"
)

type Dispute struct {
	ID           string        `json:"id"`
	JobID        string        `json:"jobId"`
	RaisedByID   string        `json:"raisedById"`
	RaisedByName string        `json:"raisedByName"`
	AgainstID    string        `json:"againstId"`
	Reason       DisputeReason `json:"reason"`
	Description  string        `json:"description"`
	EvidenceURLs []string      `json:"evidenceUrls"`
	Status       DisputeStatus `json:"status"`
	AdminNote    string        `json:"adminNote"`
	Action       string        `json:"action"` // refund | warn | dismiss
	ResolvedAt   *time.Time    `json:"resolvedAt"`
	CreatedAt    time.Time     `json:"createdAt"`
}

type DisputeFilter struct {
	Status     string
	RaisedByID string
	JobID      string
	Page       int
	Limit      int
	IsAdmin    bool
}

type Repository interface {
	CreateDispute(ctx context.Context, d Dispute) (Dispute, error)
	GetDispute(ctx context.Context, disputeID string) (Dispute, error)
	UpdateDispute(ctx context.Context, d Dispute) (Dispute, error)
	ListDisputes(ctx context.Context, filter DisputeFilter) ([]Dispute, int, error)
	AppendEvidence(ctx context.Context, disputeID, url string) error
}
