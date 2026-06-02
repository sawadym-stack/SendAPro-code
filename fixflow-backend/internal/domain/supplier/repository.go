package supplier

import (
	"context"
)

type QuotationFilter struct {
	SupplierID  string
	RequesterID string
	Status      string
	Limit       int
	Offset      int
}

type SupplierRepository interface {
	CreateSupplier(ctx context.Context, s Supplier) (Supplier, error)
	GetSupplier(ctx context.Context, supplierID string) (Supplier, error)
	GetSupplierByUserID(ctx context.Context, userID string) (Supplier, error)
	UpdateSupplier(ctx context.Context, s Supplier) (Supplier, error)
	GetNearby(ctx context.Context, lat, lng, radiusKm float64, category string) ([]Supplier, error)
	GetAll(ctx context.Context) ([]Supplier, error) // Added for Redis startup sync
}

type MaterialRepository interface {
	AddMaterial(ctx context.Context, m Material) (Material, error)
	UpdateMaterial(ctx context.Context, m Material) (Material, error)
	SoftDeleteMaterial(ctx context.Context, materialID string) error
	ListMaterials(ctx context.Context, supplierID, category string, page, limit int) ([]Material, int, error)
	GetMaterial(ctx context.Context, materialID string) (Material, error)
	UpdateStock(ctx context.Context, materialID string, delta int) (int, error)
	BulkInsert(ctx context.Context, materials []Material) (int, error)
}

type QuotationRepository interface {
	CreateQuotation(ctx context.Context, q Quotation) (Quotation, error)
	GetQuotation(ctx context.Context, quotationID string) (Quotation, error)
	UpdateQuotation(ctx context.Context, q Quotation) (Quotation, error)
	ListQuotations(ctx context.Context, filter QuotationFilter) ([]Quotation, int, error)
	ExpireOldQuotations(ctx context.Context) (int, []Quotation, error) // ExpireOldQuotations returns count and list of expired quotations
}
