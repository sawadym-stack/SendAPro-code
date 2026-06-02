package analytics

type OverviewStats struct {
	ActiveJobs          int64   `json:"activeJobs"`
	OnlineTechnicians   int64   `json:"onlineTechnicians"`
	CompletedToday      int64   `json:"completedToday"`
	RevenueToday        float64 `json:"revenueToday"`
	RevenueThisMonth    float64 `json:"revenueThisMonth"`
	AvgResponseTimeMin  float64 `json:"avgResponseTimeMin"`
	DisputesOpen        int64   `json:"disputesOpen"`
	NewUsersToday       int64   `json:"newUsersToday"`
	EmergencyJobsToday  int64   `json:"emergencyJobsToday"`
	TotalJobsAllTime    int64   `json:"totalJobsAllTime"`
}

type DailyJobStat struct {
	Date      string `json:"date"` // "2025-01-15"
	Created   int64  `json:"created"`
	Completed int64  `json:"completed"`
	Cancelled int64  `json:"cancelled"`
}

type DailyRevenueStat struct {
	Date   string  `json:"date"`
	Amount float64 `json:"amount"`
}

type TechnicianStat struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	AvatarURL      string  `json:"avatarUrl"`
	CompletedJobs  int64   `json:"completedJobs"`
	Rating         float64 `json:"rating"`
	Revenue        float64 `json:"revenue"`
	AvgResponseMin float64 `json:"avgResponseMin"`
}

type SupplierAnalytics struct {
	TotalQuotations    int64          `json:"totalQuotations"`
	AcceptedQuotations int64          `json:"acceptedQuotations"`
	RejectedQuotations int64          `json:"rejectedQuotations"`
	ExpiredQuotations  int64          `json:"expiredQuotations"`
	ConversionRate     float64        `json:"conversionRate"` // accepted / total * 100
	RevenueThisMonth   float64        `json:"revenueThisMonth"`
	TopMaterials       []MaterialStat `json:"topMaterials"`
}

type MaterialStat struct {
	MaterialID   string  `json:"materialId"`
	Name         string  `json:"name"`
	Category     string  `json:"category"`
	TimesOrdered int64   `json:"timesOrdered"`
	Revenue      float64 `json:"revenue"`
}
