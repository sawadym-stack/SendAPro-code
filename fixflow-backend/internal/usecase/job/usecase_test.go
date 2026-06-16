package job

import (
	"context"
	"testing"
	"time"

	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	repopg "github.com/yourname/fixflow-backend/internal/repository/postgres"
)

type fakeJobRepo struct{ jobs map[string]*jobdomain.Job }

func (f *fakeJobRepo) Create(_ context.Context, j *jobdomain.Job) error { j.ID = "j1"; j.CreatedAt = time.Now(); j.UpdatedAt = j.CreatedAt; f.jobs[j.ID] = j; return nil }
func (f *fakeJobRepo) GetByID(_ context.Context, id string) (*jobdomain.Job, error) { return f.jobs[id], nil }
func (f *fakeJobRepo) UpdateStatus(_ context.Context, id string, s jobdomain.JobStatus, tid string) error { f.jobs[id].Status = s; f.jobs[id].TechnicianID = tid; f.jobs[id].UpdatedAt = time.Now(); return nil }
func (f *fakeJobRepo) ListByCustomer(_ context.Context, cid string, page, pageSize int32) ([]*jobdomain.Job, int32, error) { return []*jobdomain.Job{f.jobs["j1"]}, 1, nil }
func (f *fakeJobRepo) AddJobImage(_ context.Context, jobID string, imageType string, url string) error { return nil }
func (f *fakeJobRepo) GetActiveJobByTechnicianID(_ context.Context, techID string) (*jobdomain.Job, error) { return nil, nil }
func (f *fakeJobRepo) HasUnpaidPlatformFee(_ context.Context, techID string) (bool, float64, error) { return false, 0, nil }

type fakeNotifier struct{ calls int }
func (f *fakeNotifier) NotifyCustomer(_ context.Context, _, _, _ string) error { f.calls++; return nil }
func (f *fakeNotifier) Create(_ context.Context, _, _, _, _ string) (*repopg.Notification, error) { return &repopg.Notification{}, nil }

func TestCreateAndTransitions(t *testing.T) {
	repo := &fakeJobRepo{jobs: map[string]*jobdomain.Job{}}
	notifier := &fakeNotifier{}
	uc := NewUsecase(repo, notifier, nil, nil, nil, nil, nil)
	j, err := uc.CreateJob(context.Background(), "c1", "plumbing", "leak", 11.0, 76.1, "high", false, "")
	if err != nil || j.Status != jobdomain.StatusRequested { t.Fatalf("create failed: %v", err) }
	j, err = uc.UpdateJobStatus(context.Background(), j.ID, "Accepted", "t1")
	if err != nil || j.Status != jobdomain.StatusAccepted { t.Fatalf("accept failed: %v", err) }
	j, err = uc.UpdateJobStatus(context.Background(), j.ID, "OnTheWay", "t1")
	if err != nil || notifier.calls != 2 { t.Fatalf("on the way notify failed: %v", err) }
	j, err = uc.UpdateJobStatus(context.Background(), j.ID, "Arrived", "t1")
	if err != nil { t.Fatalf("arrived failed: %v", err) }
	j, err = uc.UpdateJobStatus(context.Background(), j.ID, "Working", "t1")
	if err != nil { t.Fatalf("working failed: %v", err) }
	j, err = uc.UpdateJobStatus(context.Background(), j.ID, "Completed", "t1")
	if err != nil || notifier.calls != 5 { t.Fatalf("completed notify failed: %v", err) }
}

func TestInvalidTransition(t *testing.T) {
	repo := &fakeJobRepo{jobs: map[string]*jobdomain.Job{"j1": {ID: "j1", CustomerID: "c1", Status: jobdomain.StatusRequested}}}
	uc := NewUsecase(repo, nil, nil, nil, nil, nil, nil)
	if _, err := uc.UpdateJobStatus(context.Background(), "j1", "Completed", "t1"); err == nil { t.Fatal("expected invalid transition") }
}
