package handler

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/usecase/emergency"
	jobuc "github.com/yourname/fixflow-backend/internal/usecase/job"
	matchinguc "github.com/yourname/fixflow-backend/internal/usecase/matching"
	"github.com/yourname/fixflow-backend/pkg/response"
	"github.com/yourname/fixflow-backend/pkg/validator"
)

type JobHandler struct {
	uc          jobuc.Usecase
	matchingUC  matchinguc.Usecase
	db          *pgxpool.Pool
	emergencyUC emergency.Usecase
}

func NewJobHandler(uc jobuc.Usecase, matchingUC matchinguc.Usecase, db *pgxpool.Pool, emergencyUC emergency.Usecase) *JobHandler {
	return &JobHandler{uc: uc, matchingUC: matchingUC, db: db, emergencyUC: emergencyUC}
}

func (h *JobHandler) Register(r fiber.Router) {
	r.Get("/jobs", h.ListCustomerJobs)
	r.Post("/jobs", h.CreateJob)
	r.Get("/jobs/:id", h.GetJob)
	r.Patch("/jobs/:id/status", h.UpdateJobStatus)
}

func (h *JobHandler) CreateJob(c *fiber.Ctx) error {
	var req struct {
		CustomerID   string  `json:"customerId" validate:"required"`
		ServiceType  string  `json:"serviceType" validate:"required"`
		Description  string  `json:"description" validate:"required,min=10"`
		Lat          float64 `json:"lat" validate:"required,indialat"`
		Lng          float64 `json:"lng" validate:"required,indialng"`
		Urgency      string  `json:"urgency"`
		IsEmergency  bool    `json:"isEmergency"`
		TechnicianID string  `json:"technicianId"`
	}
	if err := c.BodyParser(&req); err != nil {
		return err
	}

	if details := validator.ValidateStruct(&req); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Validation failed",
			"details": details,
		})
	}
	j, err := h.uc.CreateJob(c.UserContext(), req.CustomerID, req.ServiceType, req.Description, req.Lat, req.Lng, req.Urgency, req.IsEmergency, req.TechnicianID)
	if err != nil {
		return err
	}

	// Notify nearby technicians
	if ActiveWSHandler != nil {
		go func() {
			ctx := context.Background()
			if req.TechnicianID != "" {
				userID, err := ActiveWSHandler.GetTechUserID(ctx, req.TechnicianID)
				if err == nil {
					_ = ActiveWSHandler.SendToRoom(ctx, "user:"+userID, map[string]interface{}{
						"type": "booking_request",
						"job":  j,
					})
				}
			} else if h.matchingUC != nil {
				techs, err := h.matchingUC.NearbyTechnicians(ctx, req.Lat, req.Lng, req.ServiceType, 50.0, 20)
				if err == nil {
					for _, tech := range techs {
						userID, err := ActiveWSHandler.GetTechUserID(ctx, tech.TechnicianID)
						if err == nil {
							_ = ActiveWSHandler.SendToRoom(ctx, "user:"+userID, map[string]interface{}{
								"type": "booking_request",
								"job":  j,
							})
						}
					}
				}
			}
		}()
	}

	return c.Status(fiber.StatusCreated).JSON(j)
}

func (h *JobHandler) GetJob(c *fiber.Ctx) error {
	j, err := h.uc.GetJob(c.UserContext(), c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(j)
}

func (h *JobHandler) UpdateJobStatus(c *fiber.Ctx) error {
	var req struct {
		NewStatus    string `json:"newStatus"`
		Status       string `json:"status"`
		TechnicianID string `json:"technicianId"`
	}
	if err := c.BodyParser(&req); err != nil {
		return err
	}

	status := req.NewStatus
	if status == "" {
		status = req.Status
	}

	role, _ := c.Locals("role").(string)
	userID, _ := c.Locals("user_id").(string)

	if role == "customer" {
		if status != "Cancelled" {
			return fiber.NewError(fiber.StatusForbidden, "customers can only cancel jobs")
		}
		jobObj, err := h.uc.GetJob(c.UserContext(), c.Params("id"))
		if err != nil {
			return err
		}
		if jobObj.CustomerID != userID {
			return fiber.NewError(fiber.StatusForbidden, "you can only cancel your own jobs")
		}
	}

	if role == "technician" && req.TechnicianID == "" {
		req.TechnicianID = userID
	}

	j, err := h.uc.UpdateJobStatus(c.UserContext(), c.Params("id"), status, req.TechnicianID)
	if err != nil {
		return err
	}

	// Notify the customer about status change
	if ActiveWSHandler != nil {
		_ = ActiveWSHandler.SendToRoom(context.Background(), "job:"+j.ID, map[string]interface{}{
			"type":            "job_status",
			"jobId":           j.ID,
			"status":          j.Status,
			"technicianName":  j.TechnicianName,
			"technicianPhone": j.TechnicianPhone,
			"customerName":    j.CustomerName,
			"customerPhone":   j.CustomerPhone,
		})
	}

	return c.JSON(j)
}

func (h *JobHandler) ListCustomerJobs(c *fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	userID, _ := c.Locals("user_id").(string)
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize", "10"))
	if pageSize <= 0 {
		pageSize = 10
	}
	if page <= 0 {
		page = 1
	}

	if role == "technician" {
		var techID string
		err := h.db.QueryRow(c.UserContext(), `SELECT id FROM technicians WHERE user_id = $1`, userID).Scan(&techID)
		if err != nil {
			meta := response.PaginationMeta{Page: page, Limit: pageSize, Total: 0, TotalPages: 0, HasNext: false, HasPrev: false}
			return response.Paginated(c, []interface{}{}, meta)
		}

		offset := (page - 1) * pageSize

		var total int32
		if err := h.db.QueryRow(c.UserContext(), `SELECT COUNT(*) FROM jobs WHERE technician_id=$1`, techID).Scan(&total); err != nil {
			return err
		}

		q := `SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
		      COALESCE(ST_Y(j.location::geometry),0), COALESCE(ST_X(j.location::geometry),0), j.priority, j.status, j.created_at, j.updated_at,
		      u_cust.full_name AS customer_name, COALESCE(u_cust.phone, '') AS customer_phone,
		      COALESCE(u_tech.full_name, '') AS technician_name, COALESCE(u_tech.phone, '') AS technician_phone
		      FROM jobs j
		      JOIN users u_cust ON j.customer_id = u_cust.id
		      LEFT JOIN technicians t ON j.technician_id = t.id
		      LEFT JOIN users u_tech ON t.user_id = u_tech.id
		      WHERE j.technician_id=$1 ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`
		rows, err := h.db.Query(c.UserContext(), q, techID, pageSize, offset)
		if err != nil {
			return err
		}
		defer rows.Close()

		jobs := []fiber.Map{}
		for rows.Next() {
			var j struct {
				ID              string
				CustomerID      string
				TechnicianID    string
				Title           string
				Description     string
				Lat             float64
				Lng             float64
				Priority        string
				Status          string
				CreatedAt       interface{}
				UpdatedAt       interface{}
				CustomerName    string
				CustomerPhone   string
				TechnicianName  string
				TechnicianPhone string
			}
			if err := rows.Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.Title, &j.Description, &j.Lat, &j.Lng, &j.Priority, &j.Status, &j.CreatedAt, &j.UpdatedAt, &j.CustomerName, &j.CustomerPhone, &j.TechnicianName, &j.TechnicianPhone); err != nil {
				return err
			}

			jobs = append(jobs, fiber.Map{
				"id":              j.ID,
				"customerId":      j.CustomerID,
				"technicianId":    j.TechnicianID,
				"serviceType":     j.Title,
				"description":     j.Description,
				"latitude":        j.Lat,
				"longitude":       j.Lng,
				"urgency":         priorityToDomain(j.Priority),
				"isEmergency":     j.Priority == "urgent",
				"status":          statusToDomain(j.Status),
				"createdAt":       j.CreatedAt,
				"updatedAt":       j.UpdatedAt,
				"customerName":    j.CustomerName,
				"customerPhone":   j.CustomerPhone,
				"technicianName":  j.TechnicianName,
				"technicianPhone": j.TechnicianPhone,
			})
		}

		totalPages := int((int64(total) + int64(pageSize) - 1) / int64(pageSize))
		meta := response.PaginationMeta{
			Page:       page,
			Limit:      pageSize,
			Total:      int64(total),
			TotalPages: totalPages,
			HasNext:    page < totalPages,
			HasPrev:    page > 1,
		}
		return response.Paginated(c, jobs, meta)
	}

	customerID := c.Query("customerId")
	if role == "customer" {
		customerID = userID
	}
	jobs, total, err := h.uc.ListCustomerJobs(c.UserContext(), customerID, int32(page), int32(pageSize))
	if err != nil {
		return err
	}

	totalPages := int((int64(total) + int64(pageSize) - 1) / int64(pageSize))
	meta := response.PaginationMeta{
		Page:       page,
		Limit:      pageSize,
		Total:      int64(total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}
	return response.Paginated(c, jobs, meta)
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

func (h *JobHandler) CreateEmergency(c *fiber.Ctx) error {
	var body struct {
		ServiceType string  `json:"serviceType"`
		Description string  `json:"description"`
		Lat         float64 `json:"lat"`
		Lng         float64 `json:"lng"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	customerID, _ := c.Locals("user_id").(string)

	var customerName string
	_ = h.db.QueryRow(c.Context(), "SELECT name FROM users WHERE id = $1", customerID).Scan(&customerName)
	if customerName == "" {
		customerName = "Customer"
	}

	req := emergency.EmergencyRequest{
		CustomerID:   customerID,
		CustomerName: customerName,
		ServiceType:  body.ServiceType,
		Description:  body.Description,
		Lat:          body.Lat,
		Lng:          body.Lng,
	}

	j, err := h.emergencyUC.CreateEmergency(c.UserContext(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(j)
}

func (h *JobHandler) ScheduleJob(c *fiber.Ctx) error {
	var body struct {
		ServiceType string  `json:"serviceType" validate:"required"`
		Description string  `json:"description" validate:"required,min=10"`
		Lat         float64 `json:"lat" validate:"required,indialat"`
		Lng         float64 `json:"lng" validate:"required,indialng"`
		ScheduledAt string  `json:"scheduledAt" validate:"required"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if details := validator.ValidateStruct(&body); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Validation failed",
			"details": details,
		})
	}

	customerID, _ := c.Locals("user_id").(string)

	scheduledTime, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		scheduledTime, err = time.Parse("2006-01-02T15:04:05Z07:00", body.ScheduledAt)
		if err != nil {
			scheduledTime, err = time.Parse("2006-01-02 15:04:05", body.ScheduledAt)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scheduledAt timestamp format. Use RFC3339"})
			}
		}
	}

	j, err := h.uc.ScheduleJob(c.UserContext(), customerID, body.ServiceType, body.Description, body.Lat, body.Lng, scheduledTime)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(j)
}

func (h *JobHandler) ListScheduledJobs(c *fiber.Ctx) error {
	customerID, _ := c.Locals("user_id").(string)

	jobs, err := h.uc.ListScheduledJobs(c.UserContext(), customerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(jobs)
}

func (h *JobHandler) CancelScheduledJob(c *fiber.Ctx) error {
	jobID := c.Params("id")

	err := h.uc.CancelScheduledJob(c.UserContext(), jobID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "cancelled"})
}

func (h *JobHandler) RescheduleJob(c *fiber.Ctx) error {
	jobID := c.Params("id")
	var body struct {
		ScheduledAt string `json:"scheduledAt"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	scheduledTime, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		scheduledTime, err = time.Parse("2006-01-02T15:04:05Z07:00", body.ScheduledAt)
		if err != nil {
			scheduledTime, err = time.Parse("2006-01-02 15:04:05", body.ScheduledAt)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scheduledAt timestamp format. Use RFC3339"})
			}
		}
	}

	err = h.uc.RescheduleJob(c.UserContext(), jobID, scheduledTime)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "rescheduled"})
}

// GetCustomerStats returns aggregate statistics for the authenticated customer.
// Endpoint: GET /api/v1/customers/me/stats
func (h *JobHandler) GetCustomerStats(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	ctx := c.UserContext()

	var totalJobs, completedJobs, cancelledJobs, activeJobs int
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE customer_id=$1`, userID).Scan(&totalJobs)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE customer_id=$1 AND status='Completed'`, userID).Scan(&completedJobs)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE customer_id=$1 AND status='Cancelled'`, userID).Scan(&cancelledJobs)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE customer_id=$1 AND status NOT IN ('Completed','Cancelled')`, userID).Scan(&activeJobs)

	var totalSpent float64
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(p.amount), 0)
		FROM payments p
		JOIN jobs j ON j.id = p.job_id
		WHERE j.customer_id = $1 AND p.status = 'Captured'
	`, userID).Scan(&totalSpent)

	var pendingPayments int
	_ = h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM jobs j
		JOIN invoices i ON i.job_id = j.id
		WHERE j.customer_id = $1 AND j.status = 'Completed' AND j.is_paid = false
	`, userID).Scan(&pendingPayments)

	return c.JSON(fiber.Map{
		"totalJobs":       totalJobs,
		"completedJobs":   completedJobs,
		"cancelledJobs":   cancelledJobs,
		"activeJobs":      activeJobs,
		"totalSpent":      totalSpent,
		"pendingPayments": pendingPayments,
	})
}

// GetTechnicianStats returns aggregate statistics for the authenticated technician.
// Endpoint: GET /api/v1/technicians/me/stats
func (h *JobHandler) GetTechnicianStats(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}

	ctx := c.UserContext()

	// Resolve tech profile ID
	var techID string
	if err := h.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id=$1`, userID).Scan(&techID); err != nil {
		return c.JSON(fiber.Map{
			"totalJobs":     0,
			"completedJobs": 0,
			"activeJobs":    0,
			"todayEarnings": 0,
			"totalEarnings": 0,
			"avgRating":     0,
		})
	}

	var totalJobs, completedJobs, activeJobs int
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE technician_id=$1`, techID).Scan(&totalJobs)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE technician_id=$1 AND status='Completed'`, techID).Scan(&completedJobs)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE technician_id=$1 AND status NOT IN ('Completed','Cancelled')`, techID).Scan(&activeJobs)

	var todayEarnings, totalEarnings float64
	today := time.Now().Format("2006-01-02")
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(p.amount), 0)
		FROM payments p
		JOIN jobs j ON j.id = p.job_id
		WHERE j.technician_id = $1 AND p.status = 'Captured' AND DATE(p.created_at) = $2
	`, techID, today).Scan(&todayEarnings)
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(p.amount), 0)
		FROM payments p
		JOIN jobs j ON j.id = p.job_id
		WHERE j.technician_id = $1 AND p.status = 'Captured'
	`, techID).Scan(&totalEarnings)

	var avgRating float64
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(avg_rating, 0) FROM technicians WHERE id=$1`, techID).Scan(&avgRating)

	return c.JSON(fiber.Map{
		"totalJobs":     totalJobs,
		"completedJobs": completedJobs,
		"activeJobs":    activeJobs,
		"todayEarnings": todayEarnings,
		"totalEarnings": totalEarnings,
		"avgRating":     avgRating,
	})
}


