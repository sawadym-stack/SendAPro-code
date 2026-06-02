package payment

import (
	"time"
)

type PaymentStatus string

const (
	Pending    PaymentStatus = "Pending"
	Authorized PaymentStatus = "Authorized"
	Captured   PaymentStatus = "Captured"
	Failed     PaymentStatus = "Failed"
	Refunded   PaymentStatus = "Refunded"
)

type Payment struct {
	ID                string        `json:"id"`
	JobID             string        `json:"jobId"`
	CustomerID        string        `json:"customerId"`
	TechnicianID      string        `json:"technicianId"`
	Amount            float64       `json:"amount"`
	Currency          string        `json:"currency"` // INR
	Status            PaymentStatus `json:"status"`
	RazorpayOrderID   string        `json:"razorpayOrderId"`
	RazorpayPaymentID string        `json:"razorpayPaymentId"`
	IdempotencyKey    string        `json:"idempotencyKey"`
	FailureReason     string        `json:"failureReason"`
	CreatedAt         time.Time     `json:"createdAt"`
	UpdatedAt         time.Time     `json:"updatedAt"`
}

type InvoiceItem struct {
	Description string  `json:"description"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unitPrice"`
	Total       float64 `json:"total"`
}

type Invoice struct {
	ID           string        `json:"id"`
	JobID        string        `json:"jobId"`
	PaymentID    string        `json:"paymentId"`
	CustomerName string        `json:"customerName"`
	TechName     string        `json:"techName"`
	ServiceType  string        `json:"serviceType"`
	LineItems    []InvoiceItem `json:"lineItems"`
	Subtotal     float64       `json:"subtotal"`
	TaxRate      float64       `json:"taxRate"` // 0.18 for 18% GST
	TaxAmount    float64       `json:"taxAmount"`
	Total        float64       `json:"total"`
	PdfURL       string        `json:"pdfUrl"`
	CreatedAt    time.Time     `json:"createdAt"`
}
