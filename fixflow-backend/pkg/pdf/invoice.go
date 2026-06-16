package pdf

import (
	"fmt"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/code"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/line"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/props"
	paymentdomain "github.com/yourname/fixflow-backend/internal/domain/payment"
)

func GenerateInvoicePDF(invoice paymentdomain.Invoice, customerPhone string, jobAddress string, techRating float64) ([]byte, error) {
	// Page: A4, portrait, margins 20mm
	cfg := config.NewBuilder().
		WithPageSize(pagesize.A4).
		WithOrientation(orientation.Vertical).
		WithLeftMargin(20).
		WithTopMargin(20).
		WithRightMargin(20).
		WithBottomMargin(20).
		Build()

	m := maroto.New(cfg)

	// Theme colors
	navyColor := &props.Color{Red: 24, Green: 43, Blue: 73}
	blueColor := &props.Color{Red: 0, Green: 80, Blue: 160}
	greyColor := &props.Color{Red: 100, Green: 100, Blue: 100}

	// 1. Header section (Height: 25)
	// Left: "FIXFLOW" in large bold + "Home Repair Services" subtitle
	// Right: "INVOICE" label + Invoice ID + Date
	m.AddRow(25,
		col.New(6).Add(
			text.New("SendAPro", props.Text{
				Style: fontstyle.Bold,
				Size:  20,
				Color: blueColor,
			}),
			text.New("On-Demand Professional Services", props.Text{
				Size:  10,
				Top:   9,
				Color: greyColor,
			}),
		),
		col.New(6).Add(
			text.New("INVOICE", props.Text{
				Style: fontstyle.Bold,
				Size:  20,
				Align: align.Right,
				Color: navyColor,
			}),
			text.New(fmt.Sprintf("Invoice ID: %s", invoice.ID), props.Text{
				Size:  9,
				Top:   9,
				Align: align.Right,
			}),
			text.New(fmt.Sprintf("Date: %s", invoice.CreatedAt.Format("2006-01-02")), props.Text{
				Size:  9,
				Top:   14,
				Align: align.Right,
			}),
		),
	)

	// Divider line
	m.AddRows(line.NewRow(4.0, props.Line{
		Thickness:   1.0,
		Color:       &props.Color{Red: 220, Green: 220, Blue: 220},
		SizePercent: 100,
	}))

	// Spacing
	m.AddRow(3)

	// 2. Parties section (2 columns) (Height: 32)
	// Left - Bill To: Customer name, Job address, Phone
	// Right - Service By: Technician name, Service type, Rating: ⭐ {rating}
	m.AddRow(32,
		col.New(6).Add(
			text.New("BILL TO", props.Text{
				Style: fontstyle.Bold,
				Size:  10,
				Color: navyColor,
			}),
			text.New(invoice.CustomerName, props.Text{
				Style: fontstyle.Bold,
				Size:  9,
				Top:   5,
			}),
			text.New(jobAddress, props.Text{
				Size:  9,
				Top:   10,
				Color: greyColor,
			}),
			text.New(fmt.Sprintf("Phone: %s", customerPhone), props.Text{
				Size:  9,
				Top:   15,
				Color: greyColor,
			}),
		),
		col.New(6).Add(
			text.New("SERVICE BY", props.Text{
				Style: fontstyle.Bold,
				Size:  10,
				Color: navyColor,
			}),
			text.New(invoice.TechName, props.Text{
				Style: fontstyle.Bold,
				Size:  9,
				Top:   5,
			}),
			text.New(invoice.ServiceType, props.Text{
				Size:  9,
				Top:   10,
				Color: greyColor,
			}),
			text.New(fmt.Sprintf("Rating: %.1f Stars", techRating), props.Text{
				Size:  9,
				Top:   15,
				Color: greyColor,
			}),
		),
	)

	// Spacing
	m.AddRow(3)

	// 3. Job details box (light grey background) (Height: 14)
	m.AddRow(14,
		col.New(12).Add(
			text.New(fmt.Sprintf("Job ID: %s   |   Service Type: %s   |   Completed: %s", invoice.JobID, invoice.ServiceType, invoice.CreatedAt.Format("2006-01-02")), props.Text{
				Size:  9,
				Align: align.Center,
				Top:   4.5,
				Style: fontstyle.Bold,
			}),
		),
	).WithStyle(&props.Cell{
		BackgroundColor: &props.Color{Red: 242, Green: 244, Blue: 246},
	})

	// Spacing
	m.AddRow(8)

	// 4. Line items table
	// Header row: dark background, white text
	m.AddRow(9,
		col.New(6).Add(text.New("Description", props.Text{Style: fontstyle.Bold, Size: 9, Color: &props.Color{Red: 255, Green: 255, Blue: 255}, Top: 2.5})),
		col.New(2).Add(text.New("Qty", props.Text{Style: fontstyle.Bold, Size: 9, Color: &props.Color{Red: 255, Green: 255, Blue: 255}, Top: 2.5, Align: align.Center})),
		col.New(2).Add(text.New("Unit Price", props.Text{Style: fontstyle.Bold, Size: 9, Color: &props.Color{Red: 255, Green: 255, Blue: 255}, Top: 2.5, Align: align.Right})),
		col.New(2).Add(text.New("Total", props.Text{Style: fontstyle.Bold, Size: 9, Color: &props.Color{Red: 255, Green: 255, Blue: 255}, Top: 2.5, Align: align.Right})),
	).WithStyle(&props.Cell{
		BackgroundColor: navyColor,
	})

	// Alternating row colors (white / very light grey)
	for i, item := range invoice.LineItems {
		bgColor := &props.Color{Red: 255, Green: 255, Blue: 255}
		if i%2 == 1 {
			bgColor = &props.Color{Red: 248, Green: 249, Blue: 250}
		}

		m.AddRow(9,
			col.New(6).Add(text.New(item.Description, props.Text{Size: 9, Top: 2.5})),
			col.New(2).Add(text.New(fmt.Sprintf("%d", item.Quantity), props.Text{Size: 9, Top: 2.5, Align: align.Center})),
			col.New(2).Add(text.New(fmt.Sprintf("Rs. %.2f", item.UnitPrice), props.Text{Size: 9, Top: 2.5, Align: align.Right})),
			col.New(2).Add(text.New(fmt.Sprintf("Rs. %.2f", item.Total), props.Text{Size: 9, Top: 2.5, Align: align.Right})),
		).WithStyle(&props.Cell{
			BackgroundColor: bgColor,
		})
	}

	// Bottom row: Subtotal right-aligned
	m.AddRows(line.NewRow(4.0, props.Line{
		Thickness:   0.5,
		Color:       &props.Color{Red: 220, Green: 220, Blue: 220},
		SizePercent: 100,
	}))

	// 5. Tax section
	// Subtotal Row
	m.AddRow(7,
		col.New(8).Add(text.New("Subtotal:", props.Text{Size: 9, Align: align.Right, Style: fontstyle.Bold, Top: 1})),
		col.New(4).Add(text.New(fmt.Sprintf("Rs. %.2f", invoice.Subtotal), props.Text{Size: 9, Align: align.Right, Top: 1})),
	)

	// GST Row
	m.AddRow(7,
		col.New(8).Add(text.New("GST (18%):", props.Text{Size: 9, Align: align.Right, Style: fontstyle.Bold, Top: 1})),
		col.New(4).Add(text.New(fmt.Sprintf("Rs. %.2f", invoice.TaxAmount), props.Text{Size: 9, Align: align.Right, Top: 1})),
	)

	// Divider
	m.AddRows(line.NewRow(3.0, props.Line{
		Thickness:   0.5,
		Color:       &props.Color{Red: 200, Green: 200, Blue: 200},
		SizePercent: 100,
	}))

	// TOTAL Row
	m.AddRow(10,
		col.New(8).Add(text.New("TOTAL:", props.Text{Size: 12, Align: align.Right, Style: fontstyle.Bold, Color: blueColor, Top: 1})),
		col.New(4).Add(text.New(fmt.Sprintf("Rs. %.2f", invoice.Total), props.Text{Size: 12, Align: align.Right, Style: fontstyle.Bold, Color: blueColor, Top: 1})),
	)

	// Spacing
	m.AddRow(20)

	// 6. Footer
	// Left: Support & greetings
	// Right: QR code to verify
	m.AddRow(22,
		col.New(8).Add(
			text.New("Thank you for using SendAPro!", props.Text{
				Size:  10,
				Style: fontstyle.Bold,
				Color: navyColor,
			}),
			text.New("For support: zendaproo@gmail.com", props.Text{
				Size:  9,
				Top:   6,
				Color: greyColor,
			}),
		),
		code.NewQrCol(4, fmt.Sprintf("https://sendapro.com/verify/invoice/%s", invoice.JobID), props.Rect{
			Center:  true,
			Percent: 100,
		}),
	)

	m.AddRow(6,
		col.New(8),
		col.New(4).Add(text.New("Scan to verify", props.Text{
			Size:  8,
			Align: align.Center,
			Top:   1,
			Color: greyColor,
		})),
	)

	document, err := m.Generate()
	if err != nil {
		return nil, fmt.Errorf("failed to generate pdf document: %w", err)
	}

	return document.GetBytes(), nil
}
