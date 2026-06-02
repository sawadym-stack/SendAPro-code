package notification

import (
	"context"
	"testing"
	"time"

	repopg "github.com/yourname/fixflow-backend/internal/repository/postgres"
)

type fakeRepo struct{ items []*repopg.Notification }

func (f *fakeRepo) Create(_ context.Context, userID, title, message, typ string) (*repopg.Notification, error) {
	n := &repopg.Notification{ID: "n1", UserID: userID, Title: title, Message: message, Type: typ, CreatedAt: time.Now()}
	f.items = append(f.items, n)
	return n, nil
}
func (f *fakeRepo) ListByUser(_ context.Context, userID string, page, pageSize int32) ([]*repopg.Notification, int32, error) {
	return f.items, int32(len(f.items)), nil
}
func (f *fakeRepo) MarkRead(_ context.Context, notificationID, userID string) error { return nil }

func TestCreateAndSubscribe(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUsecase(repo, nil, nil)
	ch, cancel := uc.Subscribe("u1")
	defer cancel()
	if _, err := uc.Create(context.Background(), "u1", "title", "body", "job"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("expected streamed notification")
	}
}
