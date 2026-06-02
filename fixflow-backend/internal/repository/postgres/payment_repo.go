package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	paymentdomain "github.com/yourname/fixflow-backend/internal/domain/payment"
)

type PaymentRepository struct {
	db *pgxpool.Pool
}

func NewPaymentRepository(db *pgxpool.Pool) *PaymentRepository {
	return &PaymentRepository{db: db}
}

func (r *PaymentRepository) CreatePayment(ctx context.Context, p paymentdomain.Payment) (paymentdomain.Payment, error) {
	q := `INSERT INTO payments 
(job_id, customer_id, technician_id, amount, currency, status, razorpay_order_id, idempotency_key, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
RETURNING id, job_id, customer_id, technician_id, amount, currency, status, COALESCE(razorpay_order_id, ''), COALESCE(razorpay_payment_id, ''), idempotency_key, COALESCE(failure_reason, ''), created_at, updated_at`

	var res paymentdomain.Payment
	err := r.db.QueryRow(ctx, q, p.JobID, p.CustomerID, p.TechnicianID, p.Amount, p.Currency, string(p.Status), p.RazorpayOrderID, p.IdempotencyKey).Scan(
		&res.ID,
		&res.JobID,
		&res.CustomerID,
		&res.TechnicianID,
		&res.Amount,
		&res.Currency,
		&res.Status,
		&res.RazorpayOrderID,
		&res.RazorpayPaymentID,
		&res.IdempotencyKey,
		&res.FailureReason,
		&res.CreatedAt,
		&res.UpdatedAt,
	)
	if err != nil {
		return paymentdomain.Payment{}, err
	}
	return res, nil
}

func (r *PaymentRepository) GetPayment(ctx context.Context, paymentID string) (paymentdomain.Payment, error) {
	q := `SELECT id, job_id, customer_id, technician_id, amount, currency, status, COALESCE(razorpay_order_id, ''), COALESCE(razorpay_payment_id, ''), idempotency_key, COALESCE(failure_reason, ''), created_at, updated_at 
FROM payments WHERE id::text = $1 OR razorpay_order_id = $1`

	var res paymentdomain.Payment
	err := r.db.QueryRow(ctx, q, paymentID).Scan(
		&res.ID,
		&res.JobID,
		&res.CustomerID,
		&res.TechnicianID,
		&res.Amount,
		&res.Currency,
		&res.Status,
		&res.RazorpayOrderID,
		&res.RazorpayPaymentID,
		&res.IdempotencyKey,
		&res.FailureReason,
		&res.CreatedAt,
		&res.UpdatedAt,
	)
	if err != nil {
		return paymentdomain.Payment{}, err
	}
	return res, nil
}

func (r *PaymentRepository) GetPaymentByJobID(ctx context.Context, jobID string) (paymentdomain.Payment, error) {
	q := `SELECT id, job_id, customer_id, technician_id, amount, currency, status, COALESCE(razorpay_order_id, ''), COALESCE(razorpay_payment_id, ''), idempotency_key, COALESCE(failure_reason, ''), created_at, updated_at 
FROM payments WHERE job_id = $1`

	var res paymentdomain.Payment
	err := r.db.QueryRow(ctx, q, jobID).Scan(
		&res.ID,
		&res.JobID,
		&res.CustomerID,
		&res.TechnicianID,
		&res.Amount,
		&res.Currency,
		&res.Status,
		&res.RazorpayOrderID,
		&res.RazorpayPaymentID,
		&res.IdempotencyKey,
		&res.FailureReason,
		&res.CreatedAt,
		&res.UpdatedAt,
	)
	if err != nil {
		return paymentdomain.Payment{}, err
	}
	return res, nil
}

func (r *PaymentRepository) GetPaymentByIdempotencyKey(ctx context.Context, key string) (*paymentdomain.Payment, error) {
	q := `SELECT id, job_id, customer_id, technician_id, amount, currency, status, COALESCE(razorpay_order_id, ''), COALESCE(razorpay_payment_id, ''), idempotency_key, COALESCE(failure_reason, ''), created_at, updated_at 
FROM payments WHERE idempotency_key = $1`

	var res paymentdomain.Payment
	err := r.db.QueryRow(ctx, q, key).Scan(
		&res.ID,
		&res.JobID,
		&res.CustomerID,
		&res.TechnicianID,
		&res.Amount,
		&res.Currency,
		&res.Status,
		&res.RazorpayOrderID,
		&res.RazorpayPaymentID,
		&res.IdempotencyKey,
		&res.FailureReason,
		&res.CreatedAt,
		&res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *PaymentRepository) UpdatePaymentStatus(ctx context.Context, paymentID string, status paymentdomain.PaymentStatus, razorpayPaymentID string) error {
	var q string
	var val string
	if status == paymentdomain.Failed {
		q = `UPDATE payments SET status = $1, failure_reason = $2, updated_at = NOW() WHERE id::text = $3 OR razorpay_order_id = $3`
		val = razorpayPaymentID // containing error message/reason
	} else {
		q = `UPDATE payments SET status = $1, razorpay_payment_id = $2, updated_at = NOW() WHERE id::text = $3 OR razorpay_order_id = $3`
		val = razorpayPaymentID
	}
	ct, err := r.db.Exec(ctx, q, string(status), val, paymentID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("payment not found for update: %s", paymentID)
	}
	if status == paymentdomain.Captured {
		_, _ = r.db.Exec(ctx, `UPDATE jobs SET is_paid = true WHERE id = (SELECT job_id FROM payments WHERE id::text = $1 OR razorpay_order_id = $1)`, paymentID)
	}
	return nil
}

func (r *PaymentRepository) GetHistory(ctx context.Context, userID string, role string, page, limit int) ([]paymentdomain.Payment, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	offset := (page - 1) * limit

	var total int
	var countQuery string
	var query string

	if role == "customer" {
		countQuery = `SELECT COUNT(*) FROM payments WHERE customer_id = $1`
		query = `SELECT id, job_id, customer_id, technician_id, amount, currency, status, COALESCE(razorpay_order_id, ''), COALESCE(razorpay_payment_id, ''), idempotency_key, COALESCE(failure_reason, ''), created_at, updated_at 
FROM payments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	} else {
		countQuery = `SELECT COUNT(*) FROM payments WHERE technician_id = $1`
		query = `SELECT id, job_id, customer_id, technician_id, amount, currency, status, COALESCE(razorpay_order_id, ''), COALESCE(razorpay_payment_id, ''), idempotency_key, COALESCE(failure_reason, ''), created_at, updated_at 
FROM payments WHERE technician_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	}

	err := r.db.QueryRow(ctx, countQuery, userID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var payments []paymentdomain.Payment
	for rows.Next() {
		var p paymentdomain.Payment
		err = rows.Scan(
			&p.ID,
			&p.JobID,
			&p.CustomerID,
			&p.TechnicianID,
			&p.Amount,
			&p.Currency,
			&p.Status,
			&p.RazorpayOrderID,
			&p.RazorpayPaymentID,
			&p.IdempotencyKey,
			&p.FailureReason,
			&p.CreatedAt,
			&p.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		payments = append(payments, p)
	}
	if err = rows.Err(); err != nil {
		return nil, 0, err
	}

	return payments, total, nil
}

type InvoiceRepository struct {
	db *pgxpool.Pool
}

func NewInvoiceRepository(db *pgxpool.Pool) *InvoiceRepository {
	return &InvoiceRepository{db: db}
}

func (r *InvoiceRepository) SaveInvoice(ctx context.Context, invoice paymentdomain.Invoice) (paymentdomain.Invoice, error) {
	lineItemsJSON, err := json.Marshal(invoice.LineItems)
	if err != nil {
		return paymentdomain.Invoice{}, fmt.Errorf("failed to marshal line items: %w", err)
	}

	q := `INSERT INTO invoices (job_id, payment_id, customer_name, tech_name, service_type, line_items, subtotal, tax_rate, tax_amount, total, pdf_url, created_at)
VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
ON CONFLICT (job_id) DO UPDATE SET
  payment_id = EXCLUDED.payment_id,
  customer_name = EXCLUDED.customer_name,
  tech_name = EXCLUDED.tech_name,
  service_type = EXCLUDED.service_type,
  line_items = EXCLUDED.line_items,
  subtotal = EXCLUDED.subtotal,
  tax_rate = EXCLUDED.tax_rate,
  tax_amount = EXCLUDED.tax_amount,
  total = EXCLUDED.total,
  pdf_url = EXCLUDED.pdf_url
RETURNING id, created_at`

	var id string
	var createdAt time.Time
	var pID *string
	if invoice.PaymentID != "" {
		pID = &invoice.PaymentID
	}
	err = r.db.QueryRow(ctx, q,
		invoice.JobID,
		pID,
		invoice.CustomerName,
		invoice.TechName,
		invoice.ServiceType,
		lineItemsJSON,
		invoice.Subtotal,
		invoice.TaxRate,
		invoice.TaxAmount,
		invoice.Total,
		invoice.PdfURL,
	).Scan(&id, &createdAt)
	if err != nil {
		return paymentdomain.Invoice{}, err
	}

	invoice.ID = id
	invoice.CreatedAt = createdAt
	return invoice, nil
}

func (r *InvoiceRepository) GetInvoiceByJobID(ctx context.Context, jobID string) (paymentdomain.Invoice, error) {
	q := `SELECT id, job_id, COALESCE(payment_id::text, ''), customer_name, tech_name, service_type, line_items, subtotal, tax_rate, tax_amount, total, COALESCE(pdf_url, ''), created_at 
FROM invoices WHERE job_id = $1`

	var res paymentdomain.Invoice
	var lineItemsJSON []byte
	err := r.db.QueryRow(ctx, q, jobID).Scan(
		&res.ID,
		&res.JobID,
		&res.PaymentID,
		&res.CustomerName,
		&res.TechName,
		&res.ServiceType,
		&lineItemsJSON,
		&res.Subtotal,
		&res.TaxRate,
		&res.TaxAmount,
		&res.Total,
		&res.PdfURL,
		&res.CreatedAt,
	)
	if err != nil {
		return paymentdomain.Invoice{}, err
	}

	var items []paymentdomain.InvoiceItem
	if err := json.Unmarshal(lineItemsJSON, &items); err != nil {
		return paymentdomain.Invoice{}, fmt.Errorf("failed to unmarshal line items: %w", err)
	}
	res.LineItems = items
	return res, nil
}
