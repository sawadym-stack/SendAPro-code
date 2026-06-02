package notification

import (
	"context"
	"net"
	"testing"
	"time"

	notificationv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/notification/v1"
	repopg "github.com/yourname/fixflow-backend/internal/repository/postgres"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

type fakeUC struct{}

func (f *fakeUC) Create(_ context.Context, userID, title, message, typ string) (*repopg.Notification, error) {
	return &repopg.Notification{ID: "n1", UserID: userID, Title: title, Message: message, Type: typ, CreatedAt: time.Now()}, nil
}
func (f *fakeUC) List(_ context.Context, userID string, page, pageSize int32) ([]*repopg.Notification, int32, error) {
	return []*repopg.Notification{{ID: "n1", UserID: userID, Title: "T", Message: "M", Type: "job", CreatedAt: time.Now()}}, 1, nil
}
func (f *fakeUC) MarkRead(_ context.Context, notificationID, userID string) error { return nil }
func (f *fakeUC) Subscribe(userID string) (<-chan *repopg.Notification, func()) {
	ch := make(chan *repopg.Notification)
	return ch, func() {}
}
func (f *fakeUC) NotifyCustomer(_ context.Context, userID, title, message string) error { return nil }

func TestNotificationServerList(t *testing.T) {
	lis := bufconn.Listen(1024 * 1024)
	s := grpc.NewServer()
	notificationv1.RegisterNotificationServiceServer(s, NewServer(&fakeUC{}))
	go func() { _ = s.Serve(lis) }()
	t.Cleanup(s.Stop)

	dialer := func(context.Context, string) (net.Conn, error) { return lis.Dial() }
	conn, err := grpc.DialContext(context.Background(), "bufnet", grpc.WithContextDialer(dialer), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	client := notificationv1.NewNotificationServiceClient(conn)
	resp, err := client.ListNotifications(context.Background(), &notificationv1.ListNotificationsRequest{UserId: "u1", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if resp.GetUnreadCount() != 1 || len(resp.GetNotifications()) != 1 {
		t.Fatalf("unexpected response")
	}
}
