package job

import (
	"fmt"
	"time"
)

type JobStatus string

const (
	StatusRequested JobStatus = "Requested"
	StatusAccepted  JobStatus = "Accepted"
	StatusOnTheWay  JobStatus = "OnTheWay"
	StatusArrived   JobStatus = "Arrived"
	StatusWorking   JobStatus = "Working"
	StatusCompleted JobStatus = "Completed"
	StatusCancelled JobStatus = "Cancelled"
	StatusScheduled JobStatus = "Scheduled"
)

var ValidTransitions = map[JobStatus][]JobStatus{
	StatusRequested: {StatusAccepted, StatusCancelled},
	StatusAccepted:  {StatusOnTheWay, StatusCancelled},
	StatusOnTheWay:  {StatusArrived, StatusCancelled},
	StatusArrived:   {StatusWorking},
	StatusWorking:   {StatusCompleted},
	StatusCompleted: {},
	StatusCancelled: {},
	StatusScheduled: {StatusRequested, StatusCancelled},
}

type Job struct {
	ID           string     `json:"id"`
	CustomerID   string     `json:"customerId"`
	TechnicianID string     `json:"technicianId"`
	ServiceType  string     `json:"serviceType"`
	Description  string     `json:"description"`
	Latitude     float64    `json:"latitude"`
	Longitude    float64    `json:"longitude"`
	Urgency      string     `json:"urgency"`
	IsEmergency  bool       `json:"isEmergency"`
	Status       JobStatus  `json:"status"`
	BeforeImages []string   `json:"beforeImages"`
	AfterImages  []string   `json:"afterImages"`
	ScheduledAt  *time.Time `json:"scheduledAt"`
	AcceptedAt   *time.Time `json:"acceptedAt"`
	ArrivedAt    *time.Time `json:"arrivedAt"`
	StartedAt    *time.Time `json:"startedAt"`
	CompletedAt     *time.Time `json:"completedAt"`
	IsPaid          bool       `json:"isPaid"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	TechnicianName  string     `json:"technicianName"`
	TechnicianPhone string     `json:"technicianPhone"`
	CustomerName    string     `json:"customerName"`
	CustomerPhone   string     `json:"customerPhone"`
}

func (j *Job) CanTransitionTo(newStatus JobStatus) bool {
	allowed, ok := ValidTransitions[j.Status]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == newStatus {
			return true
		}
	}
	return false
}

func CanTransition(from, to JobStatus) bool {
	if from == to {
		return true
	}
	allowed, ok := ValidTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

func ParseStatus(s string) (JobStatus, error) {
	v := JobStatus(s)
	switch v {
	case StatusRequested, StatusAccepted, StatusOnTheWay, StatusArrived, StatusWorking, StatusCompleted, StatusCancelled, StatusScheduled:
		return v, nil
	default:
		return "", fmt.Errorf("invalid status: %s", s)
	}
}
