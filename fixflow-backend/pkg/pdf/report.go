package pdf

import (
	"fmt"
	"time"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/line"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

type JobReportRow struct {
	ID          string
	ServiceType string
	Status      string
	Customer    string
	Technician  string
	CreatedAt   time.Time
	CompletedAt *time.Time
	Amount      float64
}

type RevenueReportRow struct {
	Date        time.Time
	JobID       string
	ServiceType string
	Customer    string
	Technician  string
	Amount      float64
	PaymentID   string
}

type UserReportRow struct {
	Name       string
	Email      string
	Phone      string
	Role       string
	IsVerified bool
	CreatedAt  time.Time
}

func GenerateReportPDF(reportType string, from, to time.Time, data interface{}) ([]byte, error) {
	cfg := config.NewBuilder().
		WithPageSize(pagesize.A4).
		WithOrientation(orientation.Vertical).
		WithLeftMargin(15).
		WithTopMargin(15).
		WithRightMargin(15).
		WithBottomMargin(15).
		Build()

	m := maroto.New(cfg)

	// Theme colors
	navyColor := &props.Color{Red: 24, Green: 43, Blue: 73}
	blueColor := &props.Color{Red: 0, Green: 80, Blue: 160}
	greyColor := &props.Color{Red: 100, Green: 100, Blue: 100}
	whiteColor := &props.Color{Red: 255, Green: 255, Blue: 255}

	// 1. Title Row
	m.AddRow(20,
		col.New(6).Add(
			text.New("FIXFLOW SYSTEM REPORT", props.Text{
				Style: fontstyle.Bold,
				Size:  16,
				Color: blueColor,
			}),
			text.New(fmt.Sprintf("Category: %s Report", stringsTitle(reportType)), props.Text{
				Size:  9,
				Top:   7,
				Color: greyColor,
			}),
		),
		col.New(6).Add(
			text.New("FIXFLOW OPERATIONS", props.Text{
				Style: fontstyle.Bold,
				Size:  12,
				Align: align.Right,
				Color: navyColor,
			}),
			text.New(fmt.Sprintf("Period: %s to %s", from.Format("2006-01-02"), to.Format("2006-01-02")), props.Text{
				Size:  9,
				Top:   6,
				Align: align.Right,
			}),
			text.New(fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04")), props.Text{
				Size:  8,
				Top:   10,
				Align: align.Right,
				Color: greyColor,
			}),
		),
	)

	// Divider
	m.AddRows(line.NewRow(3.0, props.Line{
		Thickness:   1.0,
		Color:       &props.Color{Red: 220, Green: 220, Blue: 220},
		SizePercent: 100,
	}))
	m.AddRow(3)

	// 2. Summary stats widget
	switch reportType {
	case "jobs":
		rowsData := data.([]JobReportRow)
		var completed, cancelled, inProgress int
		var totalRevenue float64
		for _, r := range rowsData {
			switch r.Status {
			case "completed", "Completed":
				completed++
			case "cancelled", "Cancelled":
				cancelled++
			default:
				inProgress++
			}
			totalRevenue += r.Amount
		}

		m.AddRow(12,
			col.New(3).Add(text.New(fmt.Sprintf("Total Jobs: %d", len(rowsData)), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3})),
			col.New(3).Add(text.New(fmt.Sprintf("Completed: %d", completed), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3, Color: &props.Color{Red: 16, Green: 185, Blue: 129}})),
			col.New(3).Add(text.New(fmt.Sprintf("Cancelled: %d", cancelled), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3, Color: &props.Color{Red: 239, Green: 68, Blue: 68}})),
			col.New(3).Add(text.New(fmt.Sprintf("Total Value: Rs.%.0f", totalRevenue), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3, Align: align.Right, Color: blueColor})),
		).WithStyle(&props.Cell{
			BackgroundColor: &props.Color{Red: 242, Green: 244, Blue: 246},
		})

	case "revenue":
		rowsData := data.([]RevenueReportRow)
		var totalRevenue float64
		for _, r := range rowsData {
			totalRevenue += r.Amount
		}
		var avgRevenue float64
		if len(rowsData) > 0 {
			avgRevenue = totalRevenue / float64(len(rowsData))
		}

		m.AddRow(12,
			col.New(4).Add(text.New(fmt.Sprintf("Total Transactions: %d", len(rowsData)), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3})),
			col.New(4).Add(text.New(fmt.Sprintf("Average Value: Rs.%.2f", avgRevenue), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3})),
			col.New(4).Add(text.New(fmt.Sprintf("Total Revenue: Rs.%.2f", totalRevenue), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3, Align: align.Right, Color: blueColor})),
		).WithStyle(&props.Cell{
			BackgroundColor: &props.Color{Red: 242, Green: 244, Blue: 246},
		})

	case "users":
		rowsData := data.([]UserReportRow)
		var customers, techs, suppliers, admins int
		for _, r := range rowsData {
			switch r.Role {
			case "customer":
				customers++
			case "technician":
				techs++
			case "supplier":
				suppliers++
			case "admin":
				admins++
			}
		}

		m.AddRow(12,
			col.New(3).Add(text.New(fmt.Sprintf("Total New Users: %d", len(rowsData)), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3})),
			col.New(3).Add(text.New(fmt.Sprintf("Customers: %d", customers), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3})),
			col.New(3).Add(text.New(fmt.Sprintf("Technicians: %d", techs), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3})),
			col.New(3).Add(text.New(fmt.Sprintf("Suppliers: %d", suppliers), props.Text{Style: fontstyle.Bold, Size: 9, Top: 3, Align: align.Right})),
		).WithStyle(&props.Cell{
			BackgroundColor: &props.Color{Red: 242, Green: 244, Blue: 246},
		})
	}

	m.AddRow(8)

	// 3. Table Header
	switch reportType {
	case "jobs":
		m.AddRow(8,
			col.New(2).Add(text.New("Job ID", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Service Type", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(1).Add(text.New("Status", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2, Align: align.Center})),
			col.New(2).Add(text.New("Customer", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Technician", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(1).Add(text.New("Date", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Amount", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2, Align: align.Right})),
		).WithStyle(&props.Cell{
			BackgroundColor: navyColor,
		})

		rowsData := data.([]JobReportRow)
		for i, r := range rowsData {
			if i >= 100 {
				break
			}
			bgColor := whiteColor
			if i%2 == 1 {
				bgColor = &props.Color{Red: 245, Green: 247, Blue: 249}
			}

			idShort := r.ID
			if len(idShort) > 8 {
				idShort = idShort[:8]
			}
			dateStr := r.CreatedAt.Format("01-02 15:04")

			m.AddRow(8,
				col.New(2).Add(text.New(idShort, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.ServiceType, props.Text{Size: 7, Top: 2})),
				col.New(1).Add(text.New(r.Status, props.Text{Size: 7, Top: 2, Align: align.Center})),
				col.New(2).Add(text.New(r.Customer, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.Technician, props.Text{Size: 7, Top: 2})),
				col.New(1).Add(text.New(dateStr, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(fmt.Sprintf("Rs.%.2f", r.Amount), props.Text{Size: 7, Top: 2, Align: align.Right})),
			).WithStyle(&props.Cell{
				BackgroundColor: bgColor,
			})
		}

	case "revenue":
		m.AddRow(8,
			col.New(2).Add(text.New("Date", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Job ID", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Service Type", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Customer", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Technician", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Amount", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2, Align: align.Right})),
		).WithStyle(&props.Cell{
			BackgroundColor: navyColor,
		})

		rowsData := data.([]RevenueReportRow)
		for i, r := range rowsData {
			if i >= 100 {
				break
			}
			bgColor := whiteColor
			if i%2 == 1 {
				bgColor = &props.Color{Red: 245, Green: 247, Blue: 249}
			}

			idShort := r.JobID
			if len(idShort) > 8 {
				idShort = idShort[:8]
			}
			dateStr := r.Date.Format("2006-01-02")

			m.AddRow(8,
				col.New(2).Add(text.New(dateStr, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(idShort, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.ServiceType, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.Customer, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.Technician, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(fmt.Sprintf("Rs.%.2f", r.Amount), props.Text{Size: 7, Top: 2, Align: align.Right})),
			).WithStyle(&props.Cell{
				BackgroundColor: bgColor,
			})
		}

	case "users":
		m.AddRow(8,
			col.New(3).Add(text.New("Name", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(3).Add(text.New("Email", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Phone", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2})),
			col.New(2).Add(text.New("Role", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2, Align: align.Center})),
			col.New(1).Add(text.New("Verified", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2, Align: align.Center})),
			col.New(1).Add(text.New("Joined At", props.Text{Style: fontstyle.Bold, Size: 8, Color: whiteColor, Top: 2, Align: align.Right})),
		).WithStyle(&props.Cell{
			BackgroundColor: navyColor,
		})

		rowsData := data.([]UserReportRow)
		for i, r := range rowsData {
			if i >= 100 {
				break
			}
			bgColor := whiteColor
			if i%2 == 1 {
				bgColor = &props.Color{Red: 245, Green: 247, Blue: 249}
			}

			verifiedStr := "No"
			if r.IsVerified {
				verifiedStr = "Yes"
			}
			dateStr := r.CreatedAt.Format("2006-01-02")

			m.AddRow(8,
				col.New(3).Add(text.New(r.Name, props.Text{Size: 7, Top: 2})),
				col.New(3).Add(text.New(r.Email, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.Phone, props.Text{Size: 7, Top: 2})),
				col.New(2).Add(text.New(r.Role, props.Text{Size: 7, Top: 2, Align: align.Center})),
				col.New(1).Add(text.New(verifiedStr, props.Text{Size: 7, Top: 2, Align: align.Center})),
				col.New(1).Add(text.New(dateStr, props.Text{Size: 7, Top: 2, Align: align.Right})),
			).WithStyle(&props.Cell{
				BackgroundColor: bgColor,
			})
		}
	}

	doc, err := m.Generate()
	if err != nil {
		return nil, err
	}
	return doc.GetBytes(), nil
}

func stringsTitle(s string) string {
	if len(s) == 0 {
		return ""
	}
	return fmt.Sprintf("%s%s", string(s[0]-32), s[1:])
}
