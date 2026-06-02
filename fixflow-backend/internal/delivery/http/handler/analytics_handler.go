package handler

import (
	"encoding/csv"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	analyticsuc "github.com/yourname/fixflow-backend/internal/usecase/analytics"
	"github.com/yourname/fixflow-backend/pkg/pdf"
)

type AnalyticsHandler struct {
	uc analyticsuc.Usecase
	db *pgxpool.Pool
}

func NewAnalyticsHandler(uc analyticsuc.Usecase, db *pgxpool.Pool) *AnalyticsHandler {
	return &AnalyticsHandler{uc: uc, db: db}
}

func (h *AnalyticsHandler) GetOverview(c *fiber.Ctx) error {
	stats, err := h.uc.GetOverview(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(stats)
}

func (h *AnalyticsHandler) GetJobStats(c *fiber.Ctx) error {
	from := parseDate(c.Query("from"), time.Now().AddDate(0, 0, -14))
	to := parseDate(c.Query("to"), time.Now())
	stats, err := h.uc.GetJobStats(c.UserContext(), from, to)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(stats)
}

func (h *AnalyticsHandler) GetRevenueStats(c *fiber.Ctx) error {
	from := parseDate(c.Query("from"), time.Now().AddDate(0, 0, -14))
	to := parseDate(c.Query("to"), time.Now())
	stats, err := h.uc.GetRevenueStats(c.UserContext(), from, to)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(stats)
}

func (h *AnalyticsHandler) GetTopTechnicians(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 10)
	stats, err := h.uc.GetTopTechnicians(c.UserContext(), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(stats)
}

func (h *AnalyticsHandler) GetSupplierAnalytics(c *fiber.Ctx) error {
	supplierID, _ := c.Locals("user_id").(string)
	if supplierID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	stats, err := h.uc.GetSupplierAnalytics(c.UserContext(), supplierID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(stats)
}

func (h *AnalyticsHandler) ExportReport(c *fiber.Ctx) error {
	reportType := c.Query("type")   // jobs | revenue | users
	from := parseDate(c.Query("from"), time.Now().AddDate(0, 0, -30))
	to := parseDate(c.Query("to"), time.Now())
	format := c.Query("format")    // csv | pdf

	ctx := c.UserContext()

	if reportType != "jobs" && reportType != "revenue" && reportType != "users" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid report type"})
	}

	if format == "csv" {
		c.Set("Content-Type", "text/csv")
		c.Set("Content-Disposition",
			fmt.Sprintf(`attachment; filename="fixflow_%s_%s_%s.csv"`,
				reportType, from.Format("2006-01-02"), to.Format("2006-01-02")))

		writer := csv.NewWriter(c.Response().BodyWriter())

		switch reportType {
		case "jobs":
			_ = writer.Write([]string{
				"Job ID", "Service Type", "Status", "Customer",
				"Technician", "Created At", "Completed At", "Amount",
			})
			q := `SELECT j.id, j.title, j.status,
                  cu.name, COALESCE(tu.name, ''),
                  j.created_at, j.completed_at,
                  COALESCE(p.amount, 0)
           FROM jobs j
           JOIN users cu ON cu.id = j.customer_id
           LEFT JOIN technicians t ON t.id = j.technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           LEFT JOIN payments p ON p.job_id = j.id
           WHERE j.created_at BETWEEN $1 AND $2
           ORDER BY j.created_at DESC`
			rows, err := h.db.Query(ctx, q, from, to)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
			}
			defer rows.Close()

			for rows.Next() {
				var id, title, statusStr, customer, technician string
				var createdAt time.Time
				var completedAt *time.Time
				var amount float64
				if err := rows.Scan(&id, &title, &statusStr, &customer, &technician, &createdAt, &completedAt, &amount); err != nil {
					return err
				}
				completedAtStr := "N/A"
				if completedAt != nil {
					completedAtStr = completedAt.Format(time.RFC3339)
				}
				_ = writer.Write([]string{
					id, title, statusToDomain(statusStr), customer,
					technician, createdAt.Format(time.RFC3339), completedAtStr,
					fmt.Sprintf("%.2f", amount),
				})
			}

		case "revenue":
			_ = writer.Write([]string{
				"Date", "Job ID", "Service Type", "Customer",
				"Technician", "Amount", "Payment ID",
			})
			q := `SELECT p.created_at, p.job_id, j.title, cu.name, COALESCE(tu.name, ''), p.amount, p.id
           FROM payments p
           JOIN jobs j ON j.id = p.job_id
           JOIN users cu ON cu.id = j.customer_id
           LEFT JOIN technicians t ON t.id = j.technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           WHERE p.status = 'Captured'
             AND p.created_at BETWEEN $1 AND $2
           ORDER BY p.created_at DESC`
			rows, err := h.db.Query(ctx, q, from, to)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
			}
			defer rows.Close()

			for rows.Next() {
				var createdAt time.Time
				var jobID, title, customer, technician, paymentID string
				var amount float64
				if err := rows.Scan(&createdAt, &jobID, &title, &customer, &technician, &amount, &paymentID); err != nil {
					return err
				}
				_ = writer.Write([]string{
					createdAt.Format("2006-01-02"), jobID, title, customer,
					technician, fmt.Sprintf("%.2f", amount), paymentID,
				})
			}

		case "users":
			_ = writer.Write([]string{
				"Name", "Email", "Phone", "Role", "Status", "Joined At",
			})
			q := `SELECT name, email, COALESCE(phone, ''), role, is_verified, created_at
           FROM users
           WHERE created_at BETWEEN $1 AND $2
           ORDER BY created_at DESC`
			rows, err := h.db.Query(ctx, q, from, to)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
			}
			defer rows.Close()

			for rows.Next() {
				var name, email, phone, role string
				var isVerified bool
				var createdAt time.Time
				if err := rows.Scan(&name, &email, &phone, &role, &isVerified, &createdAt); err != nil {
					return err
				}
				statusStr := "Unverified"
				if isVerified {
					statusStr = "Verified"
				}
				_ = writer.Write([]string{
					name, email, phone, role, statusStr, createdAt.Format(time.RFC3339),
				})
			}
		}

		writer.Flush()
		return nil
	}

	if format == "pdf" {
		c.Set("Content-Type", "application/pdf")
		c.Set("Content-Disposition",
			fmt.Sprintf(`attachment; filename="fixflow_%s_report.pdf"`, reportType))

		var pdfBytes []byte
		var err error

		switch reportType {
		case "jobs":
			q := `SELECT j.id, j.title, j.status,
                  cu.name, COALESCE(tu.name, ''),
                  j.created_at, j.completed_at,
                  COALESCE(p.amount, 0)
           FROM jobs j
           JOIN users cu ON cu.id = j.customer_id
           LEFT JOIN technicians t ON t.id = j.technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           LEFT JOIN payments p ON p.job_id = j.id
           WHERE j.created_at BETWEEN $1 AND $2
           ORDER BY j.created_at DESC`
			rows, errQuery := h.db.Query(ctx, q, from, to)
			if errQuery != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": errQuery.Error()})
			}
			defer rows.Close()

			var rowsList []pdf.JobReportRow
			for rows.Next() {
				var r pdf.JobReportRow
				if err := rows.Scan(&r.ID, &r.ServiceType, &r.Status, &r.Customer, &r.Technician, &r.CreatedAt, &r.CompletedAt, &r.Amount); err == nil {
					r.Status = statusToDomain(r.Status)
					rowsList = append(rowsList, r)
				}
			}
			pdfBytes, err = pdf.GenerateReportPDF(reportType, from, to, rowsList)

		case "revenue":
			q := `SELECT p.created_at, p.job_id, j.title, cu.name, COALESCE(tu.name, ''), p.amount, p.id
           FROM payments p
           JOIN jobs j ON j.id = p.job_id
           JOIN users cu ON cu.id = j.customer_id
           LEFT JOIN technicians t ON t.id = j.technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           WHERE p.status = 'Captured'
             AND p.created_at BETWEEN $1 AND $2
           ORDER BY p.created_at DESC`
			rows, errQuery := h.db.Query(ctx, q, from, to)
			if errQuery != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": errQuery.Error()})
			}
			defer rows.Close()

			var rowsList []pdf.RevenueReportRow
			for rows.Next() {
				var r pdf.RevenueReportRow
				if err := rows.Scan(&r.Date, &r.JobID, &r.ServiceType, &r.Customer, &r.Technician, &r.Amount, &r.PaymentID); err == nil {
					rowsList = append(rowsList, r)
				}
			}
			pdfBytes, err = pdf.GenerateReportPDF(reportType, from, to, rowsList)

		case "users":
			q := `SELECT name, email, COALESCE(phone, ''), role, is_verified, created_at
           FROM users
           WHERE created_at BETWEEN $1 AND $2
           ORDER BY created_at DESC`
			rows, errQuery := h.db.Query(ctx, q, from, to)
			if errQuery != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": errQuery.Error()})
			}
			defer rows.Close()

			var rowsList []pdf.UserReportRow
			for rows.Next() {
				var r pdf.UserReportRow
				if err := rows.Scan(&r.Name, &r.Email, &r.Phone, &r.Role, &r.IsVerified, &r.CreatedAt); err == nil {
					rowsList = append(rowsList, r)
				}
			}
			pdfBytes, err = pdf.GenerateReportPDF(reportType, from, to, rowsList)
		}

		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Send(pdfBytes)
	}

	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid format"})
}

func parseDate(val string, defaultVal time.Time) time.Time {
	if val == "" {
		return defaultVal
	}
	if t, err := time.Parse("2006-01-02", val); err == nil {
		return t
	}
	if t, err := time.Parse(time.RFC3339, val); err == nil {
		return t
	}
	val = strings.ToLower(strings.TrimSpace(val))
	switch val {
	case "today":
		return time.Now()
	case "yesterday":
		return time.Now().AddDate(0, 0, -1)
	case "7 days ago", "7daysago", "7d":
		return time.Now().AddDate(0, 0, -7)
	case "14 days ago", "14daysago", "14d":
		return time.Now().AddDate(0, 0, -14)
	case "30 days ago", "30daysago", "30d":
		return time.Now().AddDate(0, 0, -30)
	}
	return defaultVal
}
