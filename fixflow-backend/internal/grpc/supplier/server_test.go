package suppliergrpc

import (
	"context"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	supplierv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/supplier/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	domain "github.com/yourname/fixflow-backend/internal/domain/supplier"
	"github.com/yourname/fixflow-backend/internal/middleware"
)

// Fakes implementation
type fakeSupplierRepo struct {
	suppliers map[string]domain.Supplier
	byUser    map[string]domain.Supplier
}

func (f *fakeSupplierRepo) CreateSupplier(ctx context.Context, s domain.Supplier) (domain.Supplier, error) {
	s.ID = "sup_1"
	s.CreatedAt = time.Now()
	f.suppliers[s.ID] = s
	f.byUser[s.UserID] = s
	return s, nil
}
func (f *fakeSupplierRepo) GetSupplier(ctx context.Context, id string) (domain.Supplier, error) {
	return f.suppliers[id], nil
}
func (f *fakeSupplierRepo) GetSupplierByUserID(ctx context.Context, userID string) (domain.Supplier, error) {
	return f.byUser[userID], nil
}
func (f *fakeSupplierRepo) UpdateSupplier(ctx context.Context, s domain.Supplier) (domain.Supplier, error) {
	f.suppliers[s.ID] = s
	f.byUser[s.UserID] = s
	return s, nil
}
func (f *fakeSupplierRepo) GetNearby(ctx context.Context, lat, lng, radiusKm float64, category string) ([]domain.Supplier, error) {
	return []domain.Supplier{}, nil
}
func (f *fakeSupplierRepo) GetAll(ctx context.Context) ([]domain.Supplier, error) {
	var list []domain.Supplier
	for _, v := range f.suppliers {
		list = append(list, v)
	}
	return list, nil
}

type fakeMaterialRepo struct {
	materials map[string]domain.Material
}

func (f *fakeMaterialRepo) AddMaterial(ctx context.Context, m domain.Material) (domain.Material, error) {
	m.ID = "mat_1"
	m.CreatedAt = time.Now()
	m.UpdatedAt = time.Now()
	f.materials[m.ID] = m
	return m, nil
}
func (f *fakeMaterialRepo) UpdateMaterial(ctx context.Context, m domain.Material) (domain.Material, error) {
	m.UpdatedAt = time.Now()
	f.materials[m.ID] = m
	return m, nil
}
func (f *fakeMaterialRepo) SoftDeleteMaterial(ctx context.Context, id string) error {
	m := f.materials[id]
	m.IsDeleted = true
	f.materials[id] = m
	return nil
}
func (f *fakeMaterialRepo) ListMaterials(ctx context.Context, supplierID, category string, page, limit int) ([]domain.Material, int, error) {
	return []domain.Material{}, 0, nil
}
func (f *fakeMaterialRepo) GetMaterial(ctx context.Context, id string) (domain.Material, error) {
	return f.materials[id], nil
}
func (f *fakeMaterialRepo) UpdateStock(ctx context.Context, id string, delta int) (int, error) {
	m := f.materials[id]
	m.Stock += delta
	f.materials[id] = m
	return m.Stock, nil
}
func (f *fakeMaterialRepo) BulkInsert(ctx context.Context, mats []domain.Material) (int, error) {
	return len(mats), nil
}

type fakeQuotationRepo struct {
	quotations map[string]domain.Quotation
}

func (f *fakeQuotationRepo) CreateQuotation(ctx context.Context, q domain.Quotation) (domain.Quotation, error) {
	q.ID = "q_1"
	q.RequestedAt = time.Now()
	f.quotations[q.ID] = q
	return q, nil
}
func (f *fakeQuotationRepo) GetQuotation(ctx context.Context, id string) (domain.Quotation, error) {
	return f.quotations[id], nil
}
func (f *fakeQuotationRepo) UpdateQuotation(ctx context.Context, q domain.Quotation) (domain.Quotation, error) {
	f.quotations[q.ID] = q
	return q, nil
}
func (f *fakeQuotationRepo) ListQuotations(ctx context.Context, filter domain.QuotationFilter) ([]domain.Quotation, int, error) {
	return []domain.Quotation{}, 0, nil
}
func (f *fakeQuotationRepo) ExpireOldQuotations(ctx context.Context) (int, []domain.Quotation, error) {
	return 0, nil, nil
}

type fakePubSubRepo struct {
	published []websocket.WSEvent
}
func (f *fakePubSubRepo) Publish(ctx context.Context, channel string, event websocket.WSEvent) error {
	f.published = append(f.published, event)
	return nil
}
func (f *fakePubSubRepo) Subscribe(ctx context.Context, channel string) *redis.PubSub {
	return nil
}

func setupTestServer(t *testing.T) (*Server, func(), *fakeSupplierRepo, *fakeMaterialRepo, *fakeQuotationRepo, *redis.Client, *fakePubSubRepo) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})

	sRepo := &fakeSupplierRepo{suppliers: make(map[string]domain.Supplier), byUser: make(map[string]domain.Supplier)}
	mRepo := &fakeMaterialRepo{materials: make(map[string]domain.Material)}
	qRepo := &fakeQuotationRepo{quotations: make(map[string]domain.Quotation)}
	pubsub := &fakePubSubRepo{}

	server := NewServer(nil, sRepo, mRepo, qRepo, rdb, pubsub, nil, nil)

	cleanup := func() {
		rdb.Close()
	}

	return server, cleanup, sRepo, mRepo, qRepo, rdb, pubsub
}

func TestSupplierRegisterAndGet(t *testing.T) {
	server, cleanup, _, _, _, _, _ := setupTestServer(t)
	defer cleanup()

	ctx := middleware.ContextWithUserID(context.Background(), "user_supplier_1")

	// Register
	regResp, err := server.RegisterSupplier(ctx, &supplierv1.RegisterSupplierRequest{
		BusinessName:    "Super Wires",
		ContactPhone:    "123456",
		ContactEmail:    "wires@super.com",
		Lat:             10.5,
		Lng:             76.2,
		ServiceRadiusKm: 15.0,
	})
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}

	if regResp.Supplier.BusinessName != "Super Wires" || regResp.Supplier.Id != "sup_1" {
		t.Fatalf("unexpected register response: %+v", regResp.Supplier)
	}

	// GetProfile by UserID
	profileResp, err := server.GetProfile(ctx, &supplierv1.GetProfileRequest{
		UserId: "user_supplier_1",
	})
	if err != nil {
		t.Fatalf("get profile failed: %v", err)
	}
	if profileResp.Supplier.BusinessName != "Super Wires" {
		t.Fatalf("unexpected profile response: %+v", profileResp.Supplier)
	}
}

func TestMaterialAddAndUpdate(t *testing.T) {
	server, cleanup, sRepo, _, _, _, _ := setupTestServer(t)
	defer cleanup()

	ctx := middleware.ContextWithUserID(context.Background(), "user_supplier_1")

	// Pretend profile exists
	_, _ = sRepo.CreateSupplier(ctx, domain.Supplier{
		UserID:       "user_supplier_1",
		BusinessName: "Super Wires",
	})

	// Add material
	addResp, err := server.AddMaterial(ctx, &supplierv1.AddMaterialRequest{
		Name:        "Copper Wire",
		Category:    "wires",
		Price:       150.0,
		Stock:       100,
		IsAvailable: true,
		Description: "Thick copper wire",
	})
	if err != nil {
		t.Fatalf("add material failed: %v", err)
	}
	if addResp.Material.Name != "Copper Wire" || addResp.Material.Id != "mat_1" {
		t.Fatalf("unexpected add material response: %+v", addResp.Material)
	}

	// Update stock
	stockResp, err := server.UpdateStock(ctx, &supplierv1.UpdateStockRequest{
		MaterialId: "mat_1",
		Delta:      -10,
	})
	if err != nil {
		t.Fatalf("update stock failed: %v", err)
	}
	if stockResp.NewStock != 90 {
		t.Fatalf("expected stock 90, got %d", stockResp.NewStock)
	}
}

func TestQuotationFlow(t *testing.T) {
	server, cleanup, sRepo, mRepo, qRepo, _, _ := setupTestServer(t)
	defer cleanup()

	// 1. Setup supplier and material
	ctxSupplier := middleware.ContextWithUserID(context.Background(), "supplier_user_id")
	sup, _ := sRepo.CreateSupplier(ctxSupplier, domain.Supplier{
		UserID:       "supplier_user_id",
		BusinessName: "Super Pipes",
	})
	mat, _ := mRepo.AddMaterial(ctxSupplier, domain.Material{
		SupplierID:  sup.ID,
		Name:        "PVC Pipe",
		Category:    "pipes",
		Price:       200.0,
		Stock:       50,
		IsAvailable: true,
	})

	// 2. Request Quotation (by requester/customer)
	ctxRequester := middleware.ContextWithUserID(context.Background(), "requester_user_id")
	reqResp, err := server.RequestQuotation(ctxRequester, &supplierv1.RequestQuotationRequest{
		MaterialId:   mat.ID,
		JobId:        "",
		RequestedQty: 5,
		Notes:        "Need delivery by tomorrow",
	})
	if err != nil {
		t.Fatalf("request quotation failed: %v", err)
	}
	if reqResp.Quotation.Status != "Pending" || reqResp.Quotation.Id != "q_1" {
		t.Fatalf("unexpected request quotation response: %+v", reqResp.Quotation)
	}

	// 3. Respond to Quotation (by supplier)
	respResp, err := server.RespondToQuotation(ctxSupplier, &supplierv1.RespondToQuotationRequest{
		QuotationId:  "q_1",
		Price:        180.0,
		Qty:          5,
		DeliveryDate: "2026-06-01",
	})
	if err != nil {
		t.Fatalf("respond to quotation failed: %v", err)
	}
	if respResp.Quotation.Status != "Quoted" || respResp.Quotation.OfferedPrice != 180.0 {
		t.Fatalf("unexpected respond quotation response: %+v", respResp.Quotation)
	}

	// 4. Accept Quotation (by requester/customer)
	accResp, err := server.AcceptQuotation(ctxRequester, &supplierv1.AcceptQuotationRequest{
		QuotationId: "q_1",
	})
	if err != nil {
		t.Fatalf("accept quotation failed: %v", err)
	}
	if accResp.Quotation.Status != "Accepted" {
		t.Fatalf("unexpected accept quotation response: %+v", accResp.Quotation)
	}

	// Check if stock decremented (50 -> 45)
	matCheck, _ := mRepo.GetMaterial(ctxSupplier, mat.ID)
	if matCheck.Stock != 45 {
		t.Fatalf("expected stock 45, got %d", matCheck.Stock)
	}

	// Check quotation state in repo
	qCheck, _ := qRepo.GetQuotation(ctxSupplier, "q_1")
	if qCheck.Status != domain.StatusAccepted {
		t.Fatalf("expected quotation status Accepted, got %s", qCheck.Status)
	}
}
