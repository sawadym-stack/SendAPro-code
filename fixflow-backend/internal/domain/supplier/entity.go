package supplier

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type MaterialCategory string

const (
	CategoryWires    MaterialCategory = "wires"
	CategoryPipes    MaterialCategory = "pipes"
	CategorySanitary MaterialCategory = "sanitary"
	CategorySwitches MaterialCategory = "switches"
	CategoryPaint    MaterialCategory = "paint"
	CategoryTools    MaterialCategory = "tools"
	CategoryOther    MaterialCategory = "other"
)

type QuotationStatus string

const (
	StatusPending        QuotationStatus = "Pending"
	StatusQuoted         QuotationStatus = "Quoted"
	StatusCounterOffered QuotationStatus = "CounterOffered"
	StatusAccepted       QuotationStatus = "Accepted"
	StatusRejected       QuotationStatus = "Rejected"
	StatusExpired        QuotationStatus = "Expired"
)

type Supplier struct {
	ID              string       `json:"id"`
	UserID          string       `json:"userId"`
	BusinessName    string       `json:"businessName"`
	ContactPhone    string       `json:"contactPhone"`
	ContactEmail    string       `json:"contactEmail"`
	Location        pgtype.Point `json:"location"`
	Lat             float64      `json:"lat"`
	Lng             float64      `json:"lng"`
	ServiceRadiusKm float64      `json:"serviceRadiusKm"`
	Rating          float64      `json:"rating"`
	ReviewCount     int          `json:"reviewCount"`
	IsVerified      bool         `json:"isVerified"`
	CreatedAt       time.Time    `json:"createdAt"`
}

type Material struct {
	ID          string           `json:"id"`
	SupplierID  string           `json:"supplierId"`
	Name        string           `json:"name"`
	Category    MaterialCategory `json:"category"`
	Price       float64          `json:"price"`
	Stock       int              `json:"stock"`
	IsAvailable bool             `json:"isAvailable"`
	Description string           `json:"description"`
	ImageURL    string           `json:"imageUrl"`
	IsDeleted   bool             `json:"isDeleted"`
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
}

type Quotation struct {
	ID           string          `json:"id"`
	MaterialID   string          `json:"materialId"`
	MaterialName string          `json:"materialName"`
	JobID        string          `json:"jobId"`
	RequesterID  string          `json:"requesterId"`
	SupplierID   string          `json:"supplierId"`
	Status       QuotationStatus `json:"status"`
	RequestedQty int             `json:"requestedQty"`
	Notes        string          `json:"notes"`
	OfferedPrice float64         `json:"offeredPrice"`
	CounterPrice float64         `json:"counterPrice"`
	AvailableQty int             `json:"availableQty"`
	DeliveryDate *time.Time      `json:"deliveryDate"`
	ExpiresAt    time.Time       `json:"expiresAt"`
	RequestedAt  time.Time       `json:"requestedAt"`
	RespondedAt  *time.Time      `json:"respondedAt"`
	DeliveryPhotoUrl string      `json:"deliveryPhotoUrl"`
}
