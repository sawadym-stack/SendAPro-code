package matching

import (
	"context"
	"errors"
	"fmt"

	chatdomain "github.com/yourname/fixflow-backend/internal/domain/chat"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
)

var ErrJobAlreadyBeingAccepted = errors.New("job already being accepted")

type NotificationSender interface {
	NotifyCustomer(ctx context.Context, customerID, title, message string) error
}

type noopNotifier struct{}

func (n noopNotifier) NotifyCustomer(_ context.Context, _, _, _ string) error { return nil }

type Usecase interface {
	NearbyTechnicians(ctx context.Context, customerLat, customerLng float64, serviceType string, radiusKm float64, limit int) ([]redisrepo.TechnicianLocation, error)
	AcceptBooking(ctx context.Context, techID, jobID string) (*jobdomain.Job, error)
	RejectBooking(ctx context.Context, techID, jobID string) error
	UpdateTechnicianLocation(ctx context.Context, techID string, lat, lng float64) error
}

type usecase struct {
	jobs     jobdomain.Repository
	geo      GeoRepository
	locks    LockRepository
	notifier NotificationSender
	chat     chatdomain.Repository
}

type GeoRepository interface {
	NearbyTechnicians(ctx context.Context, lat, lng, radiusKm float64, serviceType string, limit int) ([]redisrepo.TechnicianLocation, error)
	UpdateLocation(ctx context.Context, techID string, lat, lng float64) error
	GetAvailability(ctx context.Context, techID string) (string, error)
	SetAvailability(ctx context.Context, techID, status, jobID string) error
}

type LockRepository interface {
	AcquireJobLock(ctx context.Context, jobID string) (bool, error)
	ReleaseJobLock(ctx context.Context, jobID string) error
}

func NewUsecase(jobs jobdomain.Repository, geo GeoRepository, locks LockRepository, notifier NotificationSender, chat chatdomain.Repository) Usecase {
	if notifier == nil {
		notifier = noopNotifier{}
	}
	return &usecase{jobs: jobs, geo: geo, locks: locks, notifier: notifier, chat: chat}
}

func (u *usecase) NearbyTechnicians(ctx context.Context, customerLat, customerLng float64, serviceType string, radiusKm float64, limit int) ([]redisrepo.TechnicianLocation, error) {
	if radiusKm <= 0 {
		radiusKm = 10
	}
	if limit <= 0 {
		limit = 20
	}
	return u.geo.NearbyTechnicians(ctx, customerLat, customerLng, radiusKm, serviceType, limit)
}

func (u *usecase) AcceptBooking(ctx context.Context, techID, jobID string) (*jobdomain.Job, error) {
	locked, err := u.locks.AcquireJobLock(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if !locked {
		return nil, ErrJobAlreadyBeingAccepted
	}
	defer func() { _ = u.locks.ReleaseJobLock(ctx, jobID) }()

	j, err := u.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if j.Status == jobdomain.StatusAccepted && j.TechnicianID == techID {
		return j, nil
	}
	if j.Status != jobdomain.StatusRequested {
		return nil, fmt.Errorf("job is not in Requested state")
	}

	// 1. Existing active job check
	existingJob, _ := u.jobs.GetActiveJobByTechnicianID(ctx, techID)
	if existingJob != nil {
		return nil, fmt.Errorf("you already have an active job — complete it first")
	}

	// 2. Platform fee check
	hasUnpaid, amount, err := u.jobs.HasUnpaidPlatformFee(ctx, techID)
	if err == nil && hasUnpaid {
		return nil, fmt.Errorf("unpaid_platform_fee: You have outstanding platform fees of Rs. %.2f. Please pay it to accept new requests.", amount)
	}

	// 3. Offline check
	availStatus, err := u.geo.GetAvailability(ctx, techID)
	if err == nil && availStatus == "Offline" {
		return nil, fmt.Errorf("cannot accept new jobs while Offline")
	}

	if err := u.jobs.UpdateStatus(ctx, jobID, jobdomain.StatusAccepted, techID); err != nil {
		return nil, err
	}
	j.Status = jobdomain.StatusAccepted
	j.TechnicianID = techID

	// 3. Set availability to Busy
	_ = u.geo.SetAvailability(ctx, techID, "Busy", jobID)

	// Create chat room upon accepting booking
	if u.chat != nil {
		if _, err := u.chat.CreateRoom(ctx, jobID, j.CustomerID, techID); err != nil {
			// Don't fail the booking accept if room creation fails, just log a warning
			fmt.Printf("Warning: failed to create chat room: %v\n", err)
		}
	}

	if err := u.notifier.NotifyCustomer(ctx, j.CustomerID, "Booking Accepted", "A technician has accepted your booking."); err != nil {
		return nil, err
	}
	return j, nil
}

func (u *usecase) RejectBooking(ctx context.Context, techID, jobID string) error {
	j, err := u.jobs.GetByID(ctx, jobID)
	if err != nil {
		return err
	}
	if j.Status == jobdomain.StatusAccepted && j.TechnicianID == techID {
		return fmt.Errorf("booking already accepted by this technician")
	}
	return nil
}

func (u *usecase) UpdateTechnicianLocation(ctx context.Context, techID string, lat, lng float64) error {
	return u.geo.UpdateLocation(ctx, techID, lat, lng)
}
