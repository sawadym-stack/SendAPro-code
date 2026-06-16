package job

import (
	"context"
	"errors"
	"time"

	jobv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/job/v1"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
	jobuc "github.com/yourname/fixflow-backend/internal/usecase/job"
	matchinguc "github.com/yourname/fixflow-backend/internal/usecase/matching"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	jobv1.UnimplementedJobServiceServer
	uc       jobuc.Usecase
	matching matchinguc.Usecase
}

func NewServer(uc jobuc.Usecase, matching matchinguc.Usecase) *Server {
	return &Server{uc: uc, matching: matching}
}

func (s *Server) CreateJob(ctx context.Context, req *jobv1.CreateJobRequest) (*jobv1.CreateJobResponse, error) {
	j, err := s.uc.CreateJob(ctx, req.GetCustomerId(), req.GetServiceType(), req.GetDescription(), req.GetLat(), req.GetLng(), req.GetUrgency(), req.GetIsEmergency(), "")
	if err != nil {
		return nil, err
	}
	return &jobv1.CreateJobResponse{Job: toPB(j)}, nil
}

func (s *Server) GetJob(ctx context.Context, req *jobv1.GetJobRequest) (*jobv1.GetJobResponse, error) {
	j, err := s.uc.GetJob(ctx, req.GetJobId())
	if err != nil {
		return nil, err
	}
	return &jobv1.GetJobResponse{Job: toPB(j)}, nil
}

func (s *Server) UpdateJobStatus(ctx context.Context, req *jobv1.UpdateJobStatusRequest) (*jobv1.UpdateJobStatusResponse, error) {
	jobObj, err := s.uc.GetJob(ctx, req.GetJobId())
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "job not found: %v", err)
	}

	targetStatus, err := jobdomain.ParseStatus(req.GetNewStatus())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid status format: %v", err)
	}

	if !jobObj.CanTransitionTo(targetStatus) {
		return nil, status.Errorf(codes.FailedPrecondition,
			"cannot transition job from %s to %s", jobObj.Status, targetStatus)
	}

	j, err := s.uc.UpdateJobStatus(ctx, req.GetJobId(), req.GetNewStatus(), req.GetTechnicianId())
	if err != nil {
		return nil, err
	}
	return &jobv1.UpdateJobStatusResponse{Job: toPB(j)}, nil
}

func (s *Server) ListCustomerJobs(ctx context.Context, req *jobv1.ListCustomerJobsRequest) (*jobv1.ListCustomerJobsResponse, error) {
	jobs, total, err := s.uc.ListCustomerJobs(ctx, req.GetCustomerId(), req.GetPage(), req.GetPageSize())
	if err != nil {
		return nil, err
	}
	resp := &jobv1.ListCustomerJobsResponse{Total: total}
	for _, j := range jobs {
		resp.Jobs = append(resp.Jobs, toPB(j))
	}
	return resp, nil
}

func (s *Server) StreamJobUpdates(req *jobv1.StreamJobUpdatesRequest, stream jobv1.JobService_StreamJobUpdatesServer) error {
	ch, cancel := s.uc.Subscribe(req.GetJobId())
	defer cancel()
	for {
		select {
		case <-stream.Context().Done():
			return nil
		case j := <-ch:
			if err := stream.Send(&jobv1.JobUpdateEvent{JobId: j.ID, Status: string(j.Status), UpdatedAt: j.UpdatedAt.Format(time.RFC3339)}); err != nil {
				return err
			}
		}
	}
}

// AcceptBooking is added for booking acceptance flow and is idempotent.
func (s *Server) AcceptBooking(ctx context.Context, req *jobv1.UpdateJobStatusRequest) (*jobv1.UpdateJobStatusResponse, error) {
	if s.matching == nil {
		return nil, status.Error(codes.Unimplemented, "matching usecase not configured")
	}
	j, err := s.matching.AcceptBooking(ctx, req.GetTechnicianId(), req.GetJobId())
	if err != nil {
		if errors.Is(err, matchinguc.ErrJobAlreadyBeingAccepted) {
			return nil, status.Error(codes.AlreadyExists, err.Error())
		}
		return nil, status.Error(codes.FailedPrecondition, err.Error())
	}
	return &jobv1.UpdateJobStatusResponse{Job: toPB(j)}, nil
}

func (s *Server) RejectBooking(ctx context.Context, req *jobv1.UpdateJobStatusRequest) (*jobv1.UpdateJobStatusResponse, error) {
	if s.matching == nil {
		return nil, status.Error(codes.Unimplemented, "matching usecase not configured")
	}
	if err := s.matching.RejectBooking(ctx, req.GetTechnicianId(), req.GetJobId()); err != nil {
		return nil, status.Error(codes.FailedPrecondition, err.Error())
	}
	j, err := s.uc.GetJob(ctx, req.GetJobId())
	if err != nil {
		return nil, err
	}
	return &jobv1.UpdateJobStatusResponse{Job: toPB(j)}, nil
}

func toPB(j *jobdomain.Job) *jobv1.Job {
	if j == nil {
		return nil
	}
	return &jobv1.Job{
		Id:           j.ID,
		CustomerId:   j.CustomerID,
		TechnicianId: j.TechnicianID,
		ServiceType:  j.ServiceType,
		Description:  j.Description,
		Latitude:     j.Latitude,
		Longitude:    j.Longitude,
		Urgency:      j.Urgency,
		IsEmergency:  j.IsEmergency,
		Status:       string(j.Status),
		CreatedAt:    j.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    j.UpdatedAt.Format(time.RFC3339),
	}
}
