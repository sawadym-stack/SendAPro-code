package notification

import (
	"context"
	"time"

	notificationv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/notification/v1"
	repopg "github.com/yourname/fixflow-backend/internal/repository/postgres"
	notuc "github.com/yourname/fixflow-backend/internal/usecase/notification"
)

type Server struct {
	notificationv1.UnimplementedNotificationServiceServer
	uc notuc.Usecase
}

func NewServer(uc notuc.Usecase) *Server { return &Server{uc: uc} }

func (s *Server) CreateNotification(ctx context.Context, req *notificationv1.CreateNotificationRequest) (*notificationv1.CreateNotificationResponse, error) {
	n, err := s.uc.Create(ctx, req.GetUserId(), req.GetTitle(), req.GetMessage(), req.GetType())
	if err != nil {
		return nil, err
	}
	return &notificationv1.CreateNotificationResponse{Notification: toPB(n)}, nil
}

func (s *Server) ListNotifications(ctx context.Context, req *notificationv1.ListNotificationsRequest) (*notificationv1.ListNotificationsResponse, error) {
	items, unread, err := s.uc.List(ctx, req.GetUserId(), req.GetPage(), req.GetPageSize())
	if err != nil {
		return nil, err
	}
	resp := &notificationv1.ListNotificationsResponse{UnreadCount: unread}
	for _, it := range items {
		resp.Notifications = append(resp.Notifications, toPB(it))
	}
	return resp, nil
}

func (s *Server) MarkNotificationRead(ctx context.Context, req *notificationv1.MarkNotificationReadRequest) (*notificationv1.MarkNotificationReadResponse, error) {
	if err := s.uc.MarkRead(ctx, req.GetNotificationId(), req.GetUserId()); err != nil {
		return nil, err
	}
	return &notificationv1.MarkNotificationReadResponse{Success: true}, nil
}

func (s *Server) StreamNotifications(req *notificationv1.StreamNotificationsRequest, stream notificationv1.NotificationService_StreamNotificationsServer) error {
	ch, cancel := s.uc.Subscribe(req.GetUserId())
	defer cancel()
	for {
		select {
		case <-stream.Context().Done():
			return nil
		case n := <-ch:
			if err := stream.Send(&notificationv1.NotificationEvent{EventType: "created", Notification: toPB(n)}); err != nil {
				return err
			}
		}
	}
}

func toPB(n *repopg.Notification) *notificationv1.Notification {
	if n == nil {
		return nil
	}
	return &notificationv1.Notification{
		Id:        n.ID,
		UserId:    n.UserID,
		Title:     n.Title,
		Message:   n.Message,
		Type:      n.Type,
		IsRead:    n.IsRead,
		CreatedAt: n.CreatedAt.Format(time.RFC3339),
	}
}
