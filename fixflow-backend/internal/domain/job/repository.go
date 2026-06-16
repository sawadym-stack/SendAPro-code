package job

import "context"

type Repository interface {
	Create(ctx context.Context, j *Job) error
	GetByID(ctx context.Context, id string) (*Job, error)
	UpdateStatus(ctx context.Context, jobID string, status JobStatus, technicianID string) error
	ListByCustomer(ctx context.Context, customerID string, page, pageSize int32) ([]*Job, int32, error)
	AddJobImage(ctx context.Context, jobID string, imageType string, url string) error
	GetActiveJobByTechnicianID(ctx context.Context, techID string) (*Job, error)
	HasUnpaidPlatformFee(ctx context.Context, techID string) (bool, float64, error)
}
