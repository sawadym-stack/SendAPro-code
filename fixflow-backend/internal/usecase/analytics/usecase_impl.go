package analytics

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/domain/analytics"
)

type Usecase interface {
	GetOverview(ctx context.Context) (analytics.OverviewStats, error)
	GetJobStats(ctx context.Context, from, to time.Time) ([]analytics.DailyJobStat, error)
	GetRevenueStats(ctx context.Context, from, to time.Time) ([]analytics.DailyRevenueStat, error)
	GetTopTechnicians(ctx context.Context, limit int) ([]analytics.TechnicianStat, error)
	GetSupplierAnalytics(ctx context.Context, supplierID string) (analytics.SupplierAnalytics, error)
}

type usecase struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewUsecase(db *pgxpool.Pool, redis *redis.Client) Usecase {
	return &usecase{db: db, redis: redis}
}

func (u *usecase) GetOverview(ctx context.Context) (analytics.OverviewStats, error) {
	cacheKey := "analytics:overview"
	cached, err := u.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		var stats analytics.OverviewStats
		if err := json.Unmarshal([]byte(cached), &stats); err == nil {
			return stats, nil
		}
	}

	stats := analytics.OverviewStats{}

	// Active jobs (excluding completed & cancelled)
	_ = u.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM jobs WHERE status NOT IN ('Completed', 'Cancelled')",
	).Scan(&stats.ActiveJobs)

	// Online technicians (Redis hash scans)
	keys, err := u.redis.Keys(ctx, "tech:availability:*").Result()
	if err == nil {
		for _, key := range keys {
			status, err := u.redis.HGet(ctx, key, "status").Result()
			if err == nil && status == "Online" {
				stats.OnlineTechnicians++
			}
		}
	}

	// Completed today
	_ = u.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM jobs
		WHERE status = 'Completed'
		AND updated_at >= CURRENT_DATE
	`).Scan(&stats.CompletedToday)

	// Revenue today
	_ = u.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM payments
		WHERE status = 'Captured'
		AND created_at >= CURRENT_DATE
	`).Scan(&stats.RevenueToday)

	// Revenue this month
	_ = u.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM payments
		WHERE status = 'Captured'
		AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', now())
	`).Scan(&stats.RevenueThisMonth)

	// Avg response time (last 7 days accepted - created in minutes)
	_ = u.db.QueryRow(ctx, `
		SELECT COALESCE(
			AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) / 60), 0
		)
		FROM jobs
		WHERE accepted_at IS NOT NULL
		AND created_at >= now() - INTERVAL '7 days'
	`).Scan(&stats.AvgResponseTimeMin)

	// Open disputes
	_ = u.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM disputes WHERE status IN ('Open', 'UnderReview')",
	).Scan(&stats.DisputesOpen)

	// New users today
	_ = u.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE",
	).Scan(&stats.NewUsersToday)

	// Emergency jobs today
	_ = u.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM jobs
		WHERE is_emergency = true
		AND created_at >= CURRENT_DATE
	`).Scan(&stats.EmergencyJobsToday)

	// Total jobs all time
	_ = u.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM jobs",
	).Scan(&stats.TotalJobsAllTime)

	// Cache for 60s
	if data, err := json.Marshal(stats); err == nil {
		_ = u.redis.Set(ctx, cacheKey, data, 60*time.Second).Err()
	}

	return stats, nil
}

func (u *usecase) GetJobStats(ctx context.Context, from, to time.Time) ([]analytics.DailyJobStat, error) {
	rows, err := u.db.Query(ctx, `
		SELECT
			DATE(created_at)::text as date,
			COUNT(*) as created,
			COUNT(*) FILTER (WHERE status = 'Completed') as completed,
			COUNT(*) FILTER (WHERE status = 'Cancelled') as cancelled
		FROM jobs
		WHERE created_at BETWEEN $1 AND $2
		GROUP BY DATE(created_at)
		ORDER BY date ASC
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	statsMap := make(map[string]analytics.DailyJobStat)
	for rows.Next() {
		var s analytics.DailyJobStat
		if err := rows.Scan(&s.Date, &s.Created, &s.Completed, &s.Cancelled); err != nil {
			return nil, err
		}
		// PostgreSQL returns date strings in different formats sometimes (e.g. YYYY-MM-DD), let's ensure correct format
		if parsedTime, err := time.Parse("2006-01-02T15:04:05Z", s.Date); err == nil {
			s.Date = parsedTime.Format("2006-01-02")
		} else if parsedTime, err := time.Parse(time.RFC3339, s.Date); err == nil {
			s.Date = parsedTime.Format("2006-01-02")
		}
		statsMap[s.Date] = s
	}

	// Truncate from/to to dates to generate daily sequence
	start := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	end := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC)

	var out []analytics.DailyJobStat
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		stat, ok := statsMap[dateStr]
		if !ok {
			stat = analytics.DailyJobStat{
				Date:      dateStr,
				Created:   0,
				Completed: 0,
				Cancelled: 0,
			}
		}
		out = append(out, stat)
	}

	return out, nil
}

func (u *usecase) GetRevenueStats(ctx context.Context, from, to time.Time) ([]analytics.DailyRevenueStat, error) {
	rows, err := u.db.Query(ctx, `
		SELECT
			DATE(created_at)::text as date,
			COALESCE(SUM(amount), 0) as amount
		FROM payments
		WHERE status = 'Captured'
		AND created_at BETWEEN $1 AND $2
		GROUP BY DATE(created_at)
		ORDER BY date ASC
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	statsMap := make(map[string]float64)
	for rows.Next() {
		var date string
		var amount float64
		if err := rows.Scan(&date, &amount); err != nil {
			return nil, err
		}
		if parsedTime, err := time.Parse("2006-01-02T15:04:05Z", date); err == nil {
			date = parsedTime.Format("2006-01-02")
		} else if parsedTime, err := time.Parse(time.RFC3339, date); err == nil {
			date = parsedTime.Format("2006-01-02")
		}
		statsMap[date] = amount
	}

	start := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	end := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC)

	var out []analytics.DailyRevenueStat
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		amount := statsMap[dateStr]
		out = append(out, analytics.DailyRevenueStat{
			Date:   dateStr,
			Amount: amount,
		})
	}

	return out, nil
}

func (u *usecase) GetTopTechnicians(ctx context.Context, limit int) ([]analytics.TechnicianStat, error) {
	rows, err := u.db.Query(ctx, `
		SELECT
			t.id, u.name, COALESCE(u.avatar_url, ''),
			COUNT(j.id) FILTER (WHERE j.status='Completed') as completed_jobs,
			t.rating,
			COALESCE(SUM(p.amount) FILTER (WHERE p.status='Captured'), 0) as revenue,
			COALESCE(
				AVG(EXTRACT(EPOCH FROM (j.accepted_at - j.created_at))/60)
				FILTER (WHERE j.accepted_at IS NOT NULL), 0
			) as avg_response_min
		FROM technicians t
		JOIN users u ON u.id = t.user_id
		LEFT JOIN jobs j ON j.technician_id = t.id
		LEFT JOIN payments p ON p.job_id = j.id
		GROUP BY t.id, u.name, u.avatar_url, t.rating
		ORDER BY completed_jobs DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []analytics.TechnicianStat
	for rows.Next() {
		var s analytics.TechnicianStat
		if err := rows.Scan(&s.ID, &s.Name, &s.AvatarURL, &s.CompletedJobs, &s.Rating, &s.Revenue, &s.AvgResponseMin); err != nil {
			return nil, err
		}
		out = append(out, s)
	}

	return out, nil
}

func (u *usecase) GetSupplierAnalytics(ctx context.Context, supplierID string) (analytics.SupplierAnalytics, error) {
	stats := analytics.SupplierAnalytics{}

	// Query supplier UUID from user ID
	var supplierUUID string
	err := u.db.QueryRow(ctx, "SELECT id FROM suppliers WHERE user_id = $1 OR id = $1", supplierID).Scan(&supplierUUID)
	if err != nil {
		return stats, err
	}

	// Quotation counts by status for supplier
	var total, accepted, rejected, expired int64
	err = u.db.QueryRow(ctx, `
		SELECT
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status='Accepted') as accepted,
			COUNT(*) FILTER (WHERE status='Rejected') as rejected,
			COUNT(*) FILTER (WHERE status='Expired') as expired,
			COALESCE(
				SUM(offered_price * requested_qty)
				FILTER (WHERE status='Accepted'
					AND DATE_TRUNC('month',responded_at) = DATE_TRUNC('month',now())),
				0
			) as revenue_this_month
		FROM quotations
		WHERE supplier_id = $1
	`, supplierID).Scan(&total, &accepted, &rejected, &expired, &stats.RevenueThisMonth)

	if err == nil {
		stats.TotalQuotations = total
		stats.AcceptedQuotations = accepted
		stats.RejectedQuotations = rejected
		stats.ExpiredQuotations = expired
		if total > 0 {
			stats.ConversionRate = float64(accepted) / float64(total) * 100
		}
	}

	// Top materials by order count
	rows, err := u.db.Query(ctx, `
		SELECT
			m.id, m.name, m.category,
			COUNT(q.id) as times_ordered,
			COALESCE(SUM(q.offered_price * q.requested_qty), 0) as revenue
		FROM materials m
		LEFT JOIN quotations q ON q.material_id = m.id
			AND q.status = 'Accepted'
		WHERE m.supplier_id = $1
		AND m.is_deleted = false
		GROUP BY m.id, m.name, m.category
		ORDER BY times_ordered DESC
		LIMIT 5
	`, supplierUUID)
	if err == nil {
		defer rows.Close()
		var materials []analytics.MaterialStat
		for rows.Next() {
			var m analytics.MaterialStat
			var category string
			if err := rows.Scan(&m.MaterialID, &m.Name, &category, &m.TimesOrdered, &m.Revenue); err == nil {
				// Capitalize category nicely for badge
				m.Category = strings.Title(category)
				materials = append(materials, m)
			}
		}
		stats.TopMaterials = materials
	}

	return stats, nil
}
