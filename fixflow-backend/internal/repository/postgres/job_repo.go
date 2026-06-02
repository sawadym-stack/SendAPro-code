package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/domain/job"
)

type JobRepository struct {
	db *pgxpool.Pool
}

func NewJobRepository(db *pgxpool.Pool) *JobRepository { return &JobRepository{db: db} }

func (r *JobRepository) Create(ctx context.Context, j *job.Job) error {
	q := `INSERT INTO jobs (customer_id, technician_id, title, description, status, priority, address, location, is_emergency, scheduled_at, created_at, updated_at)
VALUES ($1,NULL,$2,$3,$4,$5,'',ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9,NOW(),NOW()) RETURNING id, created_at, updated_at`
	return r.db.QueryRow(ctx, q, j.CustomerID, j.ServiceType, j.Description, domainToDBStatus(j.Status), domainToDBPriority(j.Urgency), j.Longitude, j.Latitude, j.IsEmergency, j.ScheduledAt).Scan(&j.ID, &j.CreatedAt, &j.UpdatedAt)
}

func (r *JobRepository) GetByID(ctx context.Context, id string) (*job.Job, error) {
	q := `SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
COALESCE(ST_Y(j.location::geometry),0), COALESCE(ST_X(j.location::geometry),0), j.priority, j.is_emergency, j.status, 
COALESCE(j.before_images, ARRAY[]::text[]), COALESCE(j.after_images, ARRAY[]::text[]), j.scheduled_at, j.created_at, j.updated_at, 
j.accepted_at, j.arrived_at, j.started_at, j.completed_at, j.is_paid,
u_cust.full_name AS customer_name, COALESCE(u_cust.phone, '') AS customer_phone,
COALESCE(u_tech.full_name, '') AS technician_name, COALESCE(u_tech.phone, '') AS technician_phone
FROM jobs j
JOIN users u_cust ON j.customer_id = u_cust.id
LEFT JOIN technicians t ON j.technician_id = t.id
LEFT JOIN users u_tech ON t.user_id = u_tech.id
WHERE j.id = $1`
	j := &job.Job{}
	var status string
	var priority string
	if err := r.db.QueryRow(ctx, q, id).Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.ServiceType, &j.Description, &j.Latitude, &j.Longitude, &priority, &j.IsEmergency, &status, &j.BeforeImages, &j.AfterImages, &j.ScheduledAt, &j.CreatedAt, &j.UpdatedAt, &j.AcceptedAt, &j.ArrivedAt, &j.StartedAt, &j.CompletedAt, &j.IsPaid, &j.CustomerName, &j.CustomerPhone, &j.TechnicianName, &j.TechnicianPhone); err != nil {
		return nil, err
	}
	parsed, err := job.ParseStatus(statusToDomain(status))
	if err != nil {
		return nil, err
	}
	j.Status = parsed
	j.Urgency = priorityToDomain(priority)
	return j, nil
}

func (r *JobRepository) UpdateStatus(ctx context.Context, jobID string, status job.JobStatus, technicianID string) error {
	statusDB := domainToDBStatus(status)
	resolvedTechID := technicianID

	if technicianID != "" {
		var techID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, technicianID).Scan(&techID)
		if err == nil {
			resolvedTechID = techID
		}
	}

	var q string
	switch status {
	case job.StatusAccepted:
		q = `UPDATE jobs SET status=$1, technician_id = NULLIF($2,'')::uuid, accepted_at=NOW(), updated_at=NOW() WHERE id=$3`
	case job.StatusArrived:
		q = `UPDATE jobs SET status=$1, technician_id = NULLIF($2,'')::uuid, arrived_at=NOW(), updated_at=NOW() WHERE id=$3`
	case job.StatusWorking:
		q = `UPDATE jobs SET status=$1, technician_id = NULLIF($2,'')::uuid, started_at=NOW(), updated_at=NOW() WHERE id=$3`
	case job.StatusCompleted:
		q = `UPDATE jobs SET status=$1, technician_id = NULLIF($2,'')::uuid, completed_at=NOW(), updated_at=NOW() WHERE id=$3`
	default:
		if statusDB == "Accepted" {
			q = `UPDATE jobs SET status=$1, technician_id = NULLIF($2,'')::uuid, accepted_at=NOW(), updated_at=NOW() WHERE id=$3`
		} else {
			q = `UPDATE jobs SET status=$1, technician_id = NULLIF($2,'')::uuid, updated_at=NOW() WHERE id=$3`
		}
	}

	ct, err := r.db.Exec(ctx, q, statusDB, resolvedTechID, jobID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("job not found")
	}
	return nil
}

func (r *JobRepository) ListByCustomer(ctx context.Context, customerID string, page, pageSize int32) ([]*job.Job, int32, error) {
	if page < 1 { page = 1 }
	if pageSize < 1 { pageSize = 10 }
	offset := (page - 1) * pageSize

	var total int32
	var rows pgx.Rows
	var err error

	if customerID == "" {
		if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs`).Scan(&total); err != nil {
			return nil, 0, err
		}

		q := `SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
COALESCE(ST_Y(j.location::geometry),0), COALESCE(ST_X(j.location::geometry),0), j.priority, j.is_emergency, j.status, 
COALESCE(j.before_images, ARRAY[]::text[]), COALESCE(j.after_images, ARRAY[]::text[]), j.scheduled_at, j.created_at, j.updated_at, 
j.accepted_at, j.arrived_at, j.started_at, j.completed_at, j.is_paid,
u_cust.full_name AS customer_name, COALESCE(u_cust.phone, '') AS customer_phone,
COALESCE(u_tech.full_name, '') AS technician_name, COALESCE(u_tech.phone, '') AS technician_phone
FROM jobs j
JOIN users u_cust ON j.customer_id = u_cust.id
LEFT JOIN technicians t ON j.technician_id = t.id
LEFT JOIN users u_tech ON t.user_id = u_tech.id
ORDER BY j.created_at DESC LIMIT $1 OFFSET $2`
		rows, err = r.db.Query(ctx, q, pageSize, offset)
	} else {
		if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE customer_id=$1`, customerID).Scan(&total); err != nil {
			return nil, 0, err
		}

		q := `SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
COALESCE(ST_Y(j.location::geometry),0), COALESCE(ST_X(j.location::geometry),0), j.priority, j.is_emergency, j.status, 
COALESCE(j.before_images, ARRAY[]::text[]), COALESCE(j.after_images, ARRAY[]::text[]), j.scheduled_at, j.created_at, j.updated_at, 
j.accepted_at, j.arrived_at, j.started_at, j.completed_at, j.is_paid,
u_cust.full_name AS customer_name, COALESCE(u_cust.phone, '') AS customer_phone,
COALESCE(u_tech.full_name, '') AS technician_name, COALESCE(u_tech.phone, '') AS technician_phone
FROM jobs j
JOIN users u_cust ON j.customer_id = u_cust.id
LEFT JOIN technicians t ON j.technician_id = t.id
LEFT JOIN users u_tech ON t.user_id = u_tech.id
WHERE j.customer_id=$1 ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`
		rows, err = r.db.Query(ctx, q, customerID, pageSize, offset)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]*job.Job, 0)
	for rows.Next() {
		j := &job.Job{}
		var status string
		var priority string
		if err := rows.Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.ServiceType, &j.Description, &j.Latitude, &j.Longitude, &priority, &j.IsEmergency, &status, &j.BeforeImages, &j.AfterImages, &j.ScheduledAt, &j.CreatedAt, &j.UpdatedAt, &j.AcceptedAt, &j.ArrivedAt, &j.StartedAt, &j.CompletedAt, &j.IsPaid, &j.CustomerName, &j.CustomerPhone, &j.TechnicianName, &j.TechnicianPhone); err != nil {
			return nil, 0, err
		}
		parsed, err := job.ParseStatus(statusToDomain(status))
		if err != nil {
			return nil, 0, err
		}
		j.Status = parsed
		j.Urgency = priorityToDomain(priority)
		out = append(out, j)
	}
	return out, total, nil
}

func (r *JobRepository) GetActiveJobByTechnicianID(ctx context.Context, techID string) (*job.Job, error) {
	resolvedTechID := techID
	if techID != "" {
		var techUUID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, techID).Scan(&techUUID)
		if err == nil {
			resolvedTechID = techUUID
		}
	}
	q := `SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
COALESCE(ST_Y(j.location::geometry),0), COALESCE(ST_X(j.location::geometry),0), j.priority, j.is_emergency, j.status, 
COALESCE(j.before_images, ARRAY[]::text[]), COALESCE(j.after_images, ARRAY[]::text[]), j.scheduled_at, j.created_at, j.updated_at, 
j.accepted_at, j.arrived_at, j.started_at, j.completed_at, j.is_paid,
u_cust.full_name AS customer_name, COALESCE(u_cust.phone, '') AS customer_phone,
COALESCE(u_tech.full_name, '') AS technician_name, COALESCE(u_tech.phone, '') AS technician_phone
FROM jobs j
JOIN users u_cust ON j.customer_id = u_cust.id
LEFT JOIN technicians t ON j.technician_id = t.id
LEFT JOIN users u_tech ON t.user_id = u_tech.id
WHERE j.technician_id = $1 AND j.status NOT IN ('Completed', 'Cancelled') LIMIT 1`
	j := &job.Job{}
	var status string
	var priority string
	err := r.db.QueryRow(ctx, q, resolvedTechID).Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.ServiceType, &j.Description, &j.Latitude, &j.Longitude, &priority, &j.IsEmergency, &status, &j.BeforeImages, &j.AfterImages, &j.ScheduledAt, &j.CreatedAt, &j.UpdatedAt, &j.AcceptedAt, &j.ArrivedAt, &j.StartedAt, &j.CompletedAt, &j.IsPaid, &j.CustomerName, &j.CustomerPhone, &j.TechnicianName, &j.TechnicianPhone)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	parsed, err := job.ParseStatus(statusToDomain(status))
	if err != nil {
		return nil, err
	}
	j.Status = parsed
	j.Urgency = priorityToDomain(priority)
	return j, nil
}

func domainToDBStatus(s job.JobStatus) string {
	return string(s)
}

func statusToDomain(s string) string {
	switch s {
	case "created", "quoted":
		return "Requested"
	case "scheduled":
		return "Scheduled"
	case "assigned":
		return "Accepted"
	case "in_progress":
		return "Working"
	case "completed":
		return "Completed"
	case "cancelled":
		return "Cancelled"
	default:
		return s
	}
}

func domainToDBPriority(p string) string {
	switch p {
	case "Normal":
		return "normal"
	case "High":
		return "high"
	case "Emergency":
		return "urgent"
	case "Low":
		return "low"
	default:
		return "normal"
	}
}

func priorityToDomain(p string) string {
	switch p {
	case "normal":
		return "Normal"
	case "high":
		return "High"
	case "urgent":
		return "Emergency"
	case "low":
		return "Low"
	default:
		return "Normal"
	}
}

func (r *JobRepository) AddJobImage(ctx context.Context, jobID string, imageType string, url string) error {
	var q string
	if imageType == "before" {
		q = `UPDATE jobs SET before_images = array_append(COALESCE(before_images, ARRAY[]::text[]), $1), updated_at = NOW() WHERE id = $2`
	} else if imageType == "after" {
		q = `UPDATE jobs SET after_images = array_append(COALESCE(after_images, ARRAY[]::text[]), $1), updated_at = NOW() WHERE id = $2`
	} else {
		return fmt.Errorf("invalid image type: %s", imageType)
	}
	_, err := r.db.Exec(ctx, q, url, jobID)
	return err
}
