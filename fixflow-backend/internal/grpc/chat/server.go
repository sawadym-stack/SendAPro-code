package chatgrpc

import (
	"context"
	"fmt"
	"io"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	pb "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/chat/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	domain "github.com/yourname/fixflow-backend/internal/domain/chat"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
)

type Server struct {
	pb.UnimplementedChatServiceServer
	db           *pgxpool.Pool
	chatRepo     domain.Repository
	pubsubRepo   redisrepo.PubSubRepo
	tokenManager *token.Manager
}

func NewServer(db *pgxpool.Pool, chatRepo domain.Repository, pubsubRepo redisrepo.PubSubRepo, tokenManager *token.Manager) *Server {
	return &Server{
		db:           db,
		chatRepo:     chatRepo,
		pubsubRepo:   pubsubRepo,
		tokenManager: tokenManager,
	}
}

func (s *Server) StreamMessages(stream pb.ChatService_StreamMessagesServer) error {
	ctx := stream.Context()

	senderID := middleware.UserIDFromContext(ctx)
	if senderID == "" {
		md, ok := metadata.FromIncomingContext(ctx)
		if ok {
			if vals := md.Get("authorization"); len(vals) > 0 {
				parts := strings.SplitN(vals[0], " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
					claims, err := s.tokenManager.Parse(parts[1])
					if err == nil {
						senderID = claims.UserID
					}
				}
			}
		}
	}

	if senderID == "" {
		return status.Error(codes.Unauthenticated, "unauthenticated request")
	}

	var senderName string
	err := s.db.QueryRow(ctx, "SELECT full_name FROM users WHERE id = $1", senderID).Scan(&senderName)
	if err != nil {
		return status.Error(codes.Unauthenticated, "sender user not found")
	}

	for {
		inMsg, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("stream recv error: %v", err))
		}

		// Validate sender is participant of this room
		room, err := s.chatRepo.GetRoom(ctx, inMsg.RoomId)
		if err != nil {
			return status.Error(codes.NotFound, fmt.Sprintf("room not found: %v", err))
		}
		if room.CustomerID != senderID && room.TechnicianID != senderID {
			return status.Error(codes.PermissionDenied, "not a room participant")
		}

		// Save to DB
		saved, err := s.chatRepo.SaveMessage(ctx, domain.ChatMessage{
			RoomID:    inMsg.RoomId,
			SenderID:  senderID,
			Type:      domain.MessageType(inMsg.Type),
			Content:   inMsg.Content,
			MediaURL:  inMsg.MediaUrl,
		})
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("failed to save message: %v", err))
		}

		// Publish to Redis -> WS hub -> browser clients
		event := websocket.WSEvent{
			Type:   "new_message",
			RoomID: "job:" + room.JobID,
			Payload: map[string]interface{}{
				"messageId":  saved.ID,
				"roomId":     saved.RoomID,
				"senderId":   saved.SenderID,
				"senderName": saved.SenderName,
				"type":       saved.Type,
				"content":    saved.Content,
				"mediaUrl":   saved.MediaURL,
				"createdAt":  saved.CreatedAt,
				"isRead":     saved.IsRead,
			},
		}
		if pubErr := s.pubsubRepo.Publish(ctx, "ws:rooms", event); pubErr != nil {
			log.Printf("[Chat gRPC Server] Redis pubsub publish error: %v", pubErr)
		}

		// Send ack back to stream
		err = stream.Send(&pb.ChatMessage{
			Id:         saved.ID,
			RoomId:     saved.RoomID,
			SenderId:   saved.SenderID,
			SenderName: saved.SenderName,
			Type:       string(saved.Type),
			Content:    saved.Content,
			MediaUrl:   saved.MediaURL,
			CreatedAt:  saved.CreatedAt.Unix(),
			IsRead:     saved.IsRead,
		})
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("failed to send acknowledgment: %v", err))
		}
	}
}

func (s *Server) GetHistory(ctx context.Context, req *pb.GetHistoryRequest) (*pb.GetHistoryResponse, error) {
	messages, err := s.chatRepo.GetHistory(ctx, req.RoomId, int(req.Limit), req.BeforeId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	var pbMsgs []*pb.ChatMessage
	for _, m := range messages {
		pbMsgs = append(pbMsgs, &pb.ChatMessage{
			Id:         m.ID,
			RoomId:     m.RoomID,
			SenderId:   m.SenderID,
			SenderName: m.SenderName,
			Type:       string(m.Type),
			Content:    m.Content,
			MediaUrl:   m.MediaURL,
			CreatedAt:  m.CreatedAt.Unix(),
			IsRead:     m.IsRead,
		})
	}

	return &pb.GetHistoryResponse{Messages: pbMsgs}, nil
}

func (s *Server) CreateRoom(ctx context.Context, req *pb.CreateRoomRequest) (*pb.CreateRoomResponse, error) {
	room, err := s.chatRepo.CreateRoom(ctx, req.JobId, req.CustomerId, req.TechnicianId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.CreateRoomResponse{
		Id:           room.ID,
		JobId:        room.JobID,
		CustomerId:   room.CustomerID,
		TechnicianId: room.TechnicianID,
		CreatedAt:    room.CreatedAt.Unix(),
	}, nil
}

func (s *Server) MarkRead(ctx context.Context, req *pb.MarkReadRequest) (*pb.MarkReadResponse, error) {
	err := s.chatRepo.MarkRead(ctx, req.RoomId, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.MarkReadResponse{Success: true}, nil
}
