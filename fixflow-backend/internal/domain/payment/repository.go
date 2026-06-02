package payment

import (
	"context"
)

type PaymentRepository interface {
	CreatePayment(ctx context.Context, p Payment) (Payment, error)
	GetPayment(ctx context.Context, paymentID string) (Payment, error)
	GetPaymentByJobID(ctx context.Context, jobID string) (Payment, error)
	GetPaymentByIdempotencyKey(ctx context.Context, key string) (*Payment, error)
	UpdatePaymentStatus(ctx context.Context, paymentID string, status PaymentStatus, razorpayPaymentID string) error
	GetHistory(ctx context.Context, userID string, role string, page, limit int) ([]Payment, int, error)
}

type InvoiceRepository interface {
	SaveInvoice(ctx context.Context, invoice Invoice) (Invoice, error)
	GetInvoiceByJobID(ctx context.Context, jobID string) (Invoice, error)
}
