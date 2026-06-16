package job

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	"github.com/yourname/fixflow-backend/internal/domain/job"
	repopg "github.com/yourname/fixflow-backend/internal/repository/postgres"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
)

type Usecase interface {
	CreateJob(ctx context.Context, customerID, serviceType, description string, lat, lng float64, urgency string, isEmergency bool, technicianID string) (*job.Job, error)
	GetJob(ctx context.Context, jobID string) (*job.Job, error)
	UpdateJobStatus(ctx context.Context, jobID, newStatus, technicianID string) (*job.Job, error)
	ListCustomerJobs(ctx context.Context, customerID string, page, pageSize int32) ([]*job.Job, int32, error)
	Subscribe(jobID string) (<-chan *job.Job, func())
	ScheduleJob(ctx context.Context, customerID, serviceType, description string, lat, lng float64, scheduledAt time.Time) (*job.Job, error)
	ListScheduledJobs(ctx context.Context, customerID string) ([]*job.Job, error)
	CancelScheduledJob(ctx context.Context, jobID string) error
	RescheduleJob(ctx context.Context, jobID string, scheduledAt time.Time) error
}

type NotificationSender interface {
	NotifyCustomer(ctx context.Context, customerID, title, message string) error
	Create(ctx context.Context, userID, title, message, typ string) (*repopg.Notification, error)
}

type usecase struct {
	repo        job.Repository
	notifier    NotificationSender
	mu          sync.RWMutex
	subscribers map[string][]chan *job.Job
	stateCache  map[string]job.JobStatus
	rdb         *redis.Client
	db          *pgxpool.Pool
	geoRepo     *redisrepo.GeoRepository
	pubsubRepo  redisrepo.PubSubRepo
	fcmClient   *firebase.FCMClient
}

func NewUsecase(repo job.Repository, notifier NotificationSender, rdb *redis.Client, db *pgxpool.Pool, geoRepo *redisrepo.GeoRepository, pubsubRepo redisrepo.PubSubRepo, fcmClient *firebase.FCMClient) Usecase {
	return &usecase{
		repo:        repo,
		notifier:    notifier,
		subscribers: map[string][]chan *job.Job{},
		stateCache:  map[string]job.JobStatus{},
		rdb:         rdb,
		db:          db,
		geoRepo:     geoRepo,
		pubsubRepo:  pubsubRepo,
		fcmClient:   fcmClient,
	}
}

func (u *usecase) CreateJob(ctx context.Context, customerID, serviceType, description string, lat, lng float64, urgency string, isEmergency bool, technicianID string) (*job.Job, error) {
	j := &job.Job{CustomerID: customerID, TechnicianID: technicianID, ServiceType: serviceType, Description: description, Latitude: lat, Longitude: lng, Urgency: urgency, IsEmergency: isEmergency, Status: job.StatusRequested}
	if err := u.repo.Create(ctx, j); err != nil {
		return nil, err
	}
	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "analytics:overview").Err()
	}

	// Booking request distribution - realistic matching
	if !j.IsEmergency && u.geoRepo != nil && u.pubsubRepo != nil {
		go func() {
			ctx := context.Background()
			
			var techs []redisrepo.TechnicianLocation
			var err error
			if technicianID != "" {
				techs = []redisrepo.TechnicianLocation{{TechnicianID: technicianID, DistanceKm: 0.0}}
			} else {
				// Find nearby online technicians: 10km radius, same service type, max 5 technicians
				techs, err = u.geoRepo.NearbyTechnicians(ctx, j.Latitude, j.Longitude, 10.0, j.ServiceType, 5)
				if err != nil {
					log.Printf("CreateJob: failed to scan nearby technicians: %v", err)
					return
				}
			}
			
			// Get customer name
			var customerName string
			_ = u.db.QueryRow(ctx, "SELECT full_name FROM users WHERE id = $1", j.CustomerID).Scan(&customerName)
			
			for _, tech := range techs {
				// Resolve tech's user ID from database
				var userID string
				err := u.db.QueryRow(ctx, "SELECT user_id::text FROM technicians WHERE id = $1 OR user_id = $1", tech.TechnicianID).Scan(&userID)
				if err != nil {
					continue
				}
				
				// Verify availability from Redis: status must be Online (not Busy/Offline) unless directly assigned
				availabilityKey := "tech:availability:" + tech.TechnicianID
				availStatus, err := u.rdb.HGet(ctx, availabilityKey, "status").Result()
				if err != nil || (availStatus != "Online" && technicianID == "") {
					continue
				}
				
				// WS notification
				_ = u.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
					Type:   "booking_request",
					RoomID: "user:" + userID,
					Payload: map[string]interface{}{
						"jobId":        j.ID,
						"serviceType":  j.ServiceType,
						"description":  j.Description,
						"urgency":      j.Urgency,
						"isEmergency":  j.IsEmergency,
						"distanceKm":   tech.DistanceKm,
						"customerName": customerName,
						"customerArea": "Kerala",
						"createdAt":    j.CreatedAt.Format(time.RFC3339),
					},
				})

				// Save persistent DB notification for the technician
				_, _ = u.notifier.Create(ctx, userID, "New Booking Request", fmt.Sprintf("A new %s request is available near you: %s", j.ServiceType, j.Description), "booking_request")
				
				// FCM Push
				if u.fcmClient != nil {
					bodyText := j.Description
					if len(bodyText) > 50 {
						bodyText = bodyText[:50]
					}
					reqPush := firebase.PushRequest{
						UserID: userID,
						Title:  "New " + j.ServiceType + " Request",
						Body:   bodyText + "...",
						Type:   "booking_request",
					}
					_ = u.fcmClient.SendPushWithRetry(ctx, reqPush, 3)
				}
			}
		}()
	}

	return j, nil
}

func (u *usecase) GetJob(ctx context.Context, jobID string) (*job.Job, error) {
	return u.repo.GetByID(ctx, jobID)
}

func (u *usecase) UpdateJobStatus(ctx context.Context, jobID, newStatus, technicianID string) (*job.Job, error) {
	j, err := u.repo.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	next, err := job.ParseStatus(newStatus)
	if err != nil {
		return nil, err
	}
	current := j.Status
	u.mu.RLock()
	if cached, ok := u.stateCache[jobID]; ok {
		current = cached
	}
	u.mu.RUnlock()
	if !job.CanTransition(current, next) {
		return nil, fmt.Errorf("invalid transition: %s -> %s", current, next)
	}
	if err := u.repo.UpdateStatus(ctx, jobID, next, technicianID); err != nil {
		return nil, err
	}
	
	// Refetch job from DB to populate all fields (TechnicianName, TechnicianPhone, CustomerName, CustomerPhone)
	refetched, err := u.repo.GetByID(ctx, jobID)
	if err == nil {
		j = refetched
	} else {
		j.Status = next
		if technicianID != "" {
			j.TechnicianID = technicianID
		}
		j.UpdatedAt = time.Now()
	}

	nowTime := time.Now()
	switch next {
	case job.StatusAccepted:
		j.AcceptedAt = &nowTime
	case job.StatusArrived:
		j.ArrivedAt = &nowTime
	case job.StatusWorking:
		j.StartedAt = &nowTime
	case job.StatusCompleted:
		j.CompletedAt = &nowTime
	}

	// Hardening completed/cancelled aggregates
	if next == job.StatusCompleted {
		if u.db != nil {
			_, errTech := u.db.Exec(ctx, "UPDATE technicians SET completed_jobs = completed_jobs + 1 WHERE id = $1 OR user_id = $1", j.TechnicianID)
			if errTech != nil {
				log.Printf("UpdateJobStatus: failed to increment completed jobs: %v", errTech)
			}
		}

		// Set availability back to Online automatically
		if u.rdb != nil {
			key := "tech:availability:" + j.TechnicianID
			_ = u.rdb.HSet(ctx, key, "status", "Online", "jobId", "").Err()
			// Set is_available in DB
			if u.db != nil {
				_, _ = u.db.Exec(ctx, "UPDATE technicians SET is_available = true, updated_at = NOW() WHERE id = $1 OR user_id = $1", j.TechnicianID)
			}
		}
	} else if next == job.StatusCancelled {
		if j.TechnicianID != "" && u.rdb != nil {
			key := "tech:availability:" + j.TechnicianID
			_ = u.rdb.HSet(ctx, key, "status", "Online", "jobId", "").Err()
			// Set is_available in DB
			if u.db != nil {
				_, _ = u.db.Exec(ctx, "UPDATE technicians SET is_available = true, updated_at = NOW() WHERE id = $1 OR user_id = $1", j.TechnicianID)
			}
		}
	}

	u.mu.Lock()
	u.stateCache[jobID] = next
	u.mu.Unlock()
	u.publish(jobID, j)
	u.notifyStatusChange(ctx, j)
	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "analytics:overview").Err()
	}
	return j, nil
}

func (u *usecase) ListCustomerJobs(ctx context.Context, customerID string, page, pageSize int32) ([]*job.Job, int32, error) {
	return u.repo.ListByCustomer(ctx, customerID, page, pageSize)
}

func (u *usecase) Subscribe(jobID string) (<-chan *job.Job, func()) {
	ch := make(chan *job.Job, 8)
	u.mu.Lock()
	u.subscribers[jobID] = append(u.subscribers[jobID], ch)
	u.mu.Unlock()
	cancel := func() {
		u.mu.Lock()
		defer u.mu.Unlock()
		list := u.subscribers[jobID]
		for i := range list {
			if list[i] == ch {
				u.subscribers[jobID] = append(list[:i], list[i+1:]...)
				close(ch)
				break
			}
		}
	}
	return ch, cancel
}

func (u *usecase) publish(jobID string, j *job.Job) {
	u.mu.RLock()
	list := append([]chan *job.Job(nil), u.subscribers[jobID]...)
	u.mu.RUnlock()
	for _, ch := range list {
		select {
		case ch <- j:
		default:
		}
	}
}

func (u *usecase) notifyStatusChange(ctx context.Context, j *job.Job) {
	if u.notifier == nil {
		return
	}
	switch j.Status {
	case job.StatusAccepted:
		_ = u.notifier.NotifyCustomer(ctx, j.CustomerID, "Booking Accepted", "Your job request has been accepted by a technician.")
	case job.StatusOnTheWay:
		_ = u.notifier.NotifyCustomer(ctx, j.CustomerID, "Technician is on the way", "Your technician is heading to your location.")
	case job.StatusArrived:
		_ = u.notifier.NotifyCustomer(ctx, j.CustomerID, "Technician Arrived", "Your technician has arrived at your location.")
	case job.StatusWorking:
		_ = u.notifier.NotifyCustomer(ctx, j.CustomerID, "Work Started", "Your technician has started working on the job.")
	case job.StatusCompleted:
		_ = u.notifier.NotifyCustomer(ctx, j.CustomerID, "Job completed", "Your job has been marked as completed.")
	case job.StatusCancelled:
		// Send cancellation alert to customer
		_ = u.notifier.NotifyCustomer(ctx, j.CustomerID, "Job Cancelled", fmt.Sprintf("Your job request #%s has been cancelled.", j.ID[0:8]))
		// Also send cancellation alert to technician if assigned
		if j.TechnicianID != "" && u.db != nil {
			var techUserID string
			_ = u.db.QueryRow(ctx, "SELECT user_id FROM technicians WHERE id = $1 OR user_id = $1", j.TechnicianID).Scan(&techUserID)
			if techUserID != "" {
				_ = u.notifier.NotifyCustomer(ctx, techUserID, "Job Cancelled", fmt.Sprintf("Job request #%s has been cancelled by the customer.", j.ID[0:8]))
			}
		}
	}
}

func (u *usecase) ScheduleJob(ctx context.Context, customerID, serviceType, description string, lat, lng float64, scheduledAt time.Time) (*job.Job, error) {
	// Validate scheduledAt >= now() + 2 hours
	if scheduledAt.Before(time.Now().Add(2 * time.Hour)) {
		return nil, fmt.Errorf("scheduled booking must be at least 2 hours in the future")
	}

	j := &job.Job{
		CustomerID:  customerID,
		ServiceType: serviceType,
		Description: description,
		Latitude:    lat,
		Longitude:   lng,
		Urgency:     "Normal",
		IsEmergency: false,
		Status:      job.StatusScheduled,
		ScheduledAt: &scheduledAt,
	}

	if err := u.repo.Create(ctx, j); err != nil {
		return nil, err
	}

	if u.rdb != nil {
		// Add to Redis sorted set "job:scheduled"
		score := float64(scheduledAt.Unix())
		err := u.rdb.ZAdd(ctx, "job:scheduled", redis.Z{
			Score:  score,
			Member: j.ID,
		}).Err()
		if err != nil {
			return nil, fmt.Errorf("failed to queue scheduled job: %w", err)
		}
	}

	// Save to scheduled_jobs table
	_, err := u.db.Exec(ctx, "INSERT INTO scheduled_jobs (job_id, scheduled_at) VALUES ($1, $2)", j.ID, scheduledAt)
	if err != nil {
		return nil, fmt.Errorf("failed to save scheduled job details: %w", err)
	}

	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "analytics:overview").Err()
	}
	return j, nil
}

func (u *usecase) ListScheduledJobs(ctx context.Context, customerID string) ([]*job.Job, error) {
	q := `SELECT id, customer_id, COALESCE(technician_id::text,''), title, description,
COALESCE(ST_Y(location::geometry),0), COALESCE(ST_X(location::geometry),0), priority, is_emergency, status, COALESCE(before_images, ARRAY[]::text[]), COALESCE(after_images, ARRAY[]::text[]), scheduled_at, created_at, updated_at
FROM jobs WHERE customer_id=$1 AND status='scheduled' ORDER BY scheduled_at ASC`

	rows, err := u.db.Query(ctx, q, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*job.Job, 0)
	for rows.Next() {
		j := &job.Job{}
		var statusStr string
		var priority string
		if err := rows.Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.ServiceType, &j.Description, &j.Latitude, &j.Longitude, &priority, &j.IsEmergency, &statusStr, &j.BeforeImages, &j.AfterImages, &j.ScheduledAt, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		parsed, err := job.ParseStatus(statusToDomain(statusStr))
		if err != nil {
			return nil, err
		}
		j.Status = parsed
		j.Urgency = priorityToDomain(priority)
		out = append(out, j)
	}
	return out, nil
}

func (u *usecase) CancelScheduledJob(ctx context.Context, jobID string) error {
	j, err := u.repo.GetByID(ctx, jobID)
	if err != nil {
		return err
	}

	if j.Status != job.StatusScheduled {
		return fmt.Errorf("job is not scheduled")
	}

	if j.ScheduledAt == nil {
		return fmt.Errorf("job scheduled date not resolved")
	}

	// Validate cancellation at least 1 hour before scheduled time
	if time.Now().After(j.ScheduledAt.Add(-1 * time.Hour)) {
		return fmt.Errorf("cancellations must be made at least 1 hour prior to the scheduled booking time")
	}

	// Update status to Cancelled
	if err := u.repo.UpdateStatus(ctx, jobID, job.StatusCancelled, ""); err != nil {
		return err
	}

	if u.rdb != nil {
		// Remove from Redis sorted set
		_ = u.rdb.ZRem(ctx, "job:scheduled", jobID).Err()
	}

	// Delete from scheduled_jobs table
	_, _ = u.db.Exec(ctx, "DELETE FROM scheduled_jobs WHERE job_id = $1", jobID)

	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "analytics:overview").Err()
	}
	return nil
}

func (u *usecase) RescheduleJob(ctx context.Context, jobID string, scheduledAt time.Time) error {
	if scheduledAt.Before(time.Now().Add(2 * time.Hour)) {
		return fmt.Errorf("scheduled booking must be at least 2 hours in the future")
	}
	j, err := u.repo.GetByID(ctx, jobID)
	if err != nil {
		return err
	}
	if j.Status != job.StatusScheduled {
		return fmt.Errorf("job is not scheduled")
	}
	if j.ScheduledAt != nil {
		if time.Now().After(j.ScheduledAt.Add(-24 * time.Hour)) {
			return fmt.Errorf("rescheduling must be made at least 24 hours prior to the scheduled booking time")
		}
	}

	// Update DB scheduled_at
	_, err = u.db.Exec(ctx, "UPDATE jobs SET scheduled_at = $1 WHERE id = $2", scheduledAt, jobID)
	if err != nil {
		return err
	}
	_, err = u.db.Exec(ctx, "UPDATE scheduled_jobs SET scheduled_at = $1 WHERE job_id = $2", scheduledAt, jobID)
	if err != nil {
		return err
	}

	if u.rdb != nil {
		// Update Redis score
		score := float64(scheduledAt.Unix())
		err = u.rdb.ZAdd(ctx, "job:scheduled", redis.Z{
			Score:  score,
			Member: jobID,
		}).Err()
		return err
	}
	return nil
}

func statusToDomain(s string) string {
	switch s {
	case "created", "quoted", "Requested":
		return "Requested"
	case "scheduled", "Scheduled":
		return "Scheduled"
	case "assigned", "Accepted":
		return "Accepted"
	case "in_route", "on_the_way", "OnTheWay":
		return "OnTheWay"
	case "arrived", "Arrived":
		return "Arrived"
	case "in_progress", "Working":
		return "Working"
	case "completed", "Completed":
		return "Completed"
	case "cancelled", "Cancelled":
		return "Cancelled"
	default:
		if s == "Requested" || s == "Scheduled" || s == "Accepted" || s == "OnTheWay" || s == "Arrived" || s == "Working" || s == "Completed" || s == "Cancelled" {
			return s
		}
		return "Requested"
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
