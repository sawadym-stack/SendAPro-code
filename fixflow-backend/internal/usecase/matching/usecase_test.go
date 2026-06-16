package matching

import (
	"context"
	"testing"

	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
)

type fakeGeo struct{ list []redisrepo.TechnicianLocation }
func (f *fakeGeo) NearbyTechnicians(_ context.Context, lat, lng, radiusKm float64, serviceType string, limit int) ([]redisrepo.TechnicianLocation, error) { return f.list, nil }
func (f *fakeGeo) UpdateLocation(_ context.Context, techID string, lat, lng float64) error { return nil }
func (f *fakeGeo) GetAvailability(_ context.Context, techID string) (string, error) { return "Online", nil }
func (f *fakeGeo) SetAvailability(_ context.Context, techID, status, jobID string) error { return nil }

type fakeLock struct{ ok bool }
func (f *fakeLock) AcquireJobLock(_ context.Context, jobID string) (bool, error) { return f.ok, nil }
func (f *fakeLock) ReleaseJobLock(_ context.Context, jobID string) error { return nil }

type fakeRepo struct{ j *jobdomain.Job }
func (f *fakeRepo) Create(_ context.Context, j *jobdomain.Job) error { return nil }
func (f *fakeRepo) GetByID(_ context.Context, id string) (*jobdomain.Job, error) { return f.j, nil }
func (f *fakeRepo) UpdateStatus(_ context.Context, id string, s jobdomain.JobStatus, tid string) error { f.j.Status = s; f.j.TechnicianID = tid; return nil }
func (f *fakeRepo) ListByCustomer(_ context.Context, customerID string, page, pageSize int32) ([]*jobdomain.Job, int32, error) { return nil, 0, nil }
func (f *fakeRepo) AddJobImage(_ context.Context, jobID string, imageType string, url string) error { return nil }
func (f *fakeRepo) GetActiveJobByTechnicianID(_ context.Context, techID string) (*jobdomain.Job, error) { return nil, nil }
func (f *fakeRepo) HasUnpaidPlatformFee(_ context.Context, techID string) (bool, float64, error) { return false, 0, nil }

func TestNearbyAndAcceptBooking(t *testing.T) {
	repo := &fakeRepo{j: &jobdomain.Job{ID: "j1", CustomerID: "c1", Status: jobdomain.StatusRequested}}
	uc := NewUsecase(repo, &fakeGeo{list: []redisrepo.TechnicianLocation{{TechnicianID: "t1"}}}, &fakeLock{ok: true}, nil, nil)
	list, err := uc.NearbyTechnicians(context.Background(), 11.0, 76.1, "plumbing", 10, 10)
	if err != nil || len(list) != 1 { t.Fatalf("nearby failed: %v", err) }
	j, err := uc.AcceptBooking(context.Background(), "t1", "j1")
	if err != nil || j.Status != jobdomain.StatusAccepted { t.Fatalf("accept failed: %v", err) }
}

func TestAcceptBookingLocked(t *testing.T) {
	repo := &fakeRepo{j: &jobdomain.Job{ID: "j1", CustomerID: "c1", Status: jobdomain.StatusRequested}}
	uc := NewUsecase(repo, &fakeGeo{}, &fakeLock{ok: false}, nil, nil)
	if _, err := uc.AcceptBooking(context.Background(), "t1", "j1"); err == nil { t.Fatal("expected lock error") }
}
