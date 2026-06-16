package suppliergrpc

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	supplierv1 "github.com/yourname/fixflow-backend/internal/adapter/grpc/pb/supplier/v1"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	domain "github.com/yourname/fixflow-backend/internal/domain/supplier"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
)

type Server struct {
	supplierv1.UnimplementedSupplierServiceServer
	db            *pgxpool.Pool
	supplierRepo  domain.SupplierRepository
	materialRepo  domain.MaterialRepository
	quotationRepo domain.QuotationRepository
	redis         *redis.Client
	pubsubRepo    redisrepo.PubSubRepo
	fcmClient     *firebase.FCMClient
	tokenManager  *token.Manager
}

func NewServer(
	db *pgxpool.Pool,
	supplierRepo domain.SupplierRepository,
	materialRepo domain.MaterialRepository,
	quotationRepo domain.QuotationRepository,
	redis *redis.Client,
	pubsubRepo redisrepo.PubSubRepo,
	fcmClient *firebase.FCMClient,
	tokenManager *token.Manager,
) *Server {
	return &Server{
		db:            db,
		supplierRepo:  supplierRepo,
		materialRepo:  materialRepo,
		quotationRepo: quotationRepo,
		redis:         redis,
		pubsubRepo:    pubsubRepo,
		fcmClient:     fcmClient,
		tokenManager:  tokenManager,
	}
}

// helper to convert database entity to protobuf format
func toProtoSupplier(s domain.Supplier) *supplierv1.Supplier {
	return &supplierv1.Supplier{
		Id:              s.ID,
		UserId:          s.UserID,
		BusinessName:    s.BusinessName,
		ContactPhone:    s.ContactPhone,
		ContactEmail:    s.ContactEmail,
		Lat:             s.Lat,
		Lng:             s.Lng,
		ServiceRadiusKm: s.ServiceRadiusKm,
		Rating:          s.Rating,
		ReviewCount:     int32(s.ReviewCount),
		IsVerified:      s.IsVerified,
		CreatedAt:       s.CreatedAt.Format(time.RFC3339),
	}
}

func toProtoMaterial(m domain.Material) *supplierv1.Material {
	return &supplierv1.Material{
		Id:          m.ID,
		SupplierId:  m.SupplierID,
		Name:        m.Name,
		Category:    string(m.Category),
		Price:       m.Price,
		Stock:       int32(m.Stock),
		IsAvailable: m.IsAvailable,
		Description: m.Description,
		ImageUrl:    m.ImageURL,
		IsDeleted:   m.IsDeleted,
		CreatedAt:   m.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   m.UpdatedAt.Format(time.RFC3339),
	}
}

func toProtoQuotation(q domain.Quotation) *supplierv1.Quotation {
	deliveryDateStr := ""
	if q.DeliveryDate != nil {
		deliveryDateStr = q.DeliveryDate.Format("2006-01-02")
	}
	respondedAtStr := ""
	if q.RespondedAt != nil {
		respondedAtStr = q.RespondedAt.Format(time.RFC3339)
	}

	return &supplierv1.Quotation{
		Id:           q.ID,
		MaterialId:   q.MaterialID,
		MaterialName: q.MaterialName,
		JobId:        q.JobID,
		RequesterId:  q.RequesterID,
		SupplierId:   q.SupplierID,
		Status:       string(q.Status),
		RequestedQty: int32(q.RequestedQty),
		Notes:        q.Notes,
		OfferedPrice: q.OfferedPrice,
		CounterPrice: q.CounterPrice,
		AvailableQty: int32(q.AvailableQty),
		DeliveryDate: deliveryDateStr,
		ExpiresAt:    q.ExpiresAt.Format(time.RFC3339),
		RequestedAt:  q.RequestedAt.Format(time.RFC3339),
		RespondedAt:  respondedAtStr,
	}
}

// 1. Supplier profile registration/retrieval
func (s *Server) RegisterSupplier(ctx context.Context, req *supplierv1.RegisterSupplierRequest) (*supplierv1.RegisterSupplierResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	// Check existing profile
	existing, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err == nil && existing.ID != "" {
		return nil, status.Error(codes.AlreadyExists, "supplier profile already exists for this user")
	}

	profile := domain.Supplier{
		UserID:          userID,
		BusinessName:    req.GetBusinessName(),
		ContactPhone:    req.GetContactPhone(),
		ContactEmail:    req.GetContactEmail(),
		Lat:             req.GetLat(),
		Lng:             req.GetLng(),
		ServiceRadiusKm: req.GetServiceRadiusKm(),
		IsVerified:      false,
	}

	created, err := s.supplierRepo.CreateSupplier(ctx, profile)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Register in Redis GEO index
	err = s.redis.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{
		Name:      created.ID,
		Longitude: created.Lng,
		Latitude:  created.Lat,
	}).Err()
	if err != nil {
		log.Printf("[Supplier Server] Failed to register supplier location in Redis: %v", err)
	}

	return &supplierv1.RegisterSupplierResponse{Supplier: toProtoSupplier(created)}, nil
}

func (s *Server) GetProfile(ctx context.Context, req *supplierv1.GetProfileRequest) (*supplierv1.GetProfileResponse, error) {
	var sProfile domain.Supplier
	var err error

	if req.GetSupplierId() != "" {
		sProfile, err = s.supplierRepo.GetSupplier(ctx, req.GetSupplierId())
	} else if req.GetUserId() != "" {
		sProfile, err = s.supplierRepo.GetSupplierByUserID(ctx, req.GetUserId())
	} else {
		userID := middleware.UserIDFromContext(ctx)
		if userID == "" {
			return nil, status.Error(codes.Unauthenticated, "unauthenticated")
		}
		sProfile, err = s.supplierRepo.GetSupplierByUserID(ctx, userID)
	}

	if err != nil {
		return nil, status.Error(codes.NotFound, err.Error())
	}

	return &supplierv1.GetProfileResponse{Supplier: toProtoSupplier(sProfile)}, nil
}

func (s *Server) UpdateProfile(ctx context.Context, req *supplierv1.UpdateProfileRequest) (*supplierv1.UpdateProfileResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	sProfile, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	locationChanged := sProfile.Lat != req.GetLat() || sProfile.Lng != req.GetLng()

	sProfile.BusinessName = req.GetBusinessName()
	sProfile.ContactPhone = req.GetContactPhone()
	sProfile.ContactEmail = req.GetContactEmail()
	sProfile.Lat = req.GetLat()
	sProfile.Lng = req.GetLng()
	sProfile.ServiceRadiusKm = req.GetServiceRadiusKm()

	updated, err := s.supplierRepo.UpdateSupplier(ctx, sProfile)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	if locationChanged {
		err = s.redis.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{
			Name:      updated.ID,
			Longitude: updated.Lng,
			Latitude:  updated.Lat,
		}).Err()
		if err != nil {
			log.Printf("[Supplier Server] Failed to update location in Redis: %v", err)
		}
	}

	return &supplierv1.UpdateProfileResponse{Supplier: toProtoSupplier(updated)}, nil
}

func (s *Server) GetNearbySuppliers(ctx context.Context, req *supplierv1.GetNearbySuppliersRequest) (*supplierv1.GetNearbySuppliersResponse, error) {
	list, err := s.supplierRepo.GetNearby(ctx, req.GetLat(), req.GetLng(), req.GetRadiusKm(), req.GetCategory())
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	var pbList []*supplierv1.Supplier
	for _, item := range list {
		pbList = append(pbList, toProtoSupplier(item))
	}

	return &supplierv1.GetNearbySuppliersResponse{Suppliers: pbList}, nil
}

// 2. Materials management
func (s *Server) AddMaterial(ctx context.Context, req *supplierv1.AddMaterialRequest) (*supplierv1.AddMaterialResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	supplier, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	m := domain.Material{
		SupplierID:  supplier.ID,
		Name:        req.GetName(),
		Category:    domain.MaterialCategory(req.GetCategory()),
		Price:       req.GetPrice(),
		Stock:       int(req.GetStock()),
		IsAvailable: req.GetIsAvailable(),
		Description: req.GetDescription(),
		ImageURL:    req.GetImageUrl(),
	}

	created, err := s.materialRepo.AddMaterial(ctx, m)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &supplierv1.AddMaterialResponse{Material: toProtoMaterial(created)}, nil
}

func (s *Server) UpdateMaterial(ctx context.Context, req *supplierv1.UpdateMaterialRequest) (*supplierv1.UpdateMaterialResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	supplier, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	m, err := s.materialRepo.GetMaterial(ctx, req.GetMaterialId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "material not found")
	}

	if m.SupplierID != supplier.ID {
		return nil, status.Error(codes.PermissionDenied, "you do not own this material")
	}

	m.Name = req.GetName()
	m.Category = domain.MaterialCategory(req.GetCategory())
	m.Price = req.GetPrice()
	m.Stock = int(req.GetStock())
	m.IsAvailable = req.GetIsAvailable()
	m.Description = req.GetDescription()
	m.ImageURL = req.GetImageUrl()

	updated, err := s.materialRepo.UpdateMaterial(ctx, m)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &supplierv1.UpdateMaterialResponse{Material: toProtoMaterial(updated)}, nil
}

func (s *Server) SoftDeleteMaterial(ctx context.Context, req *supplierv1.SoftDeleteMaterialRequest) (*supplierv1.SoftDeleteMaterialResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	supplier, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	m, err := s.materialRepo.GetMaterial(ctx, req.GetMaterialId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "material not found")
	}

	if m.SupplierID != supplier.ID {
		return nil, status.Error(codes.PermissionDenied, "you do not own this material")
	}

	err = s.materialRepo.SoftDeleteMaterial(ctx, req.GetMaterialId())
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &supplierv1.SoftDeleteMaterialResponse{Success: true}, nil
}

func (s *Server) ListMaterials(ctx context.Context, req *supplierv1.ListMaterialsRequest) (*supplierv1.ListMaterialsResponse, error) {
	list, total, err := s.materialRepo.ListMaterials(ctx, req.GetSupplierId(), req.GetCategory(), int(req.GetPage()), int(req.GetLimit()))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	var pbList []*supplierv1.Material
	for _, item := range list {
		pbList = append(pbList, toProtoMaterial(item))
	}

	return &supplierv1.ListMaterialsResponse{Materials: pbList, TotalCount: int32(total)}, nil
}

func (s *Server) UpdateStock(ctx context.Context, req *supplierv1.UpdateStockRequest) (*supplierv1.UpdateStockResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	supplier, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	m, err := s.materialRepo.GetMaterial(ctx, req.GetMaterialId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "material not found")
	}

	if m.SupplierID != supplier.ID {
		return nil, status.Error(codes.PermissionDenied, "you do not own this material")
	}

	newStock, err := s.materialRepo.UpdateStock(ctx, req.GetMaterialId(), int(req.GetDelta()))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &supplierv1.UpdateStockResponse{NewStock: int32(newStock)}, nil
}

func (s *Server) BulkImportMaterials(ctx context.Context, req *supplierv1.BulkImportMaterialsRequest) (*supplierv1.BulkImportMaterialsResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	supplier, err := s.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	var validItems []domain.Material
	var errorStrings []string
	var failed int32

	for idx, item := range req.GetMaterials() {
		if item.GetName() == "" {
			errorStrings = append(errorStrings, fmt.Sprintf("row %d: name is required", idx))
			failed++
			continue
		}
		if item.GetPrice() <= 0 {
			errorStrings = append(errorStrings, fmt.Sprintf("row %d: price must be greater than zero", idx))
			failed++
			continue
		}
		if item.GetStock() < 0 {
			errorStrings = append(errorStrings, fmt.Sprintf("row %d: stock cannot be negative", idx))
			failed++
			continue
		}

		validItems = append(validItems, domain.Material{
			SupplierID:  supplier.ID,
			Name:        item.GetName(),
			Category:    domain.MaterialCategory(item.GetCategory()),
			Price:       item.GetPrice(),
			Stock:       int(item.GetStock()),
			IsAvailable: true,
			Description: item.GetDescription(),
			ImageURL:    item.GetImageUrl(),
		})
	}

	imported := 0
	if len(validItems) > 0 {
		count, err := s.materialRepo.BulkInsert(ctx, validItems)
		if err != nil {
			return nil, status.Error(codes.Internal, fmt.Sprintf("failed to bulk insert: %v", err))
		}
		imported = count
	}

	return &supplierv1.BulkImportMaterialsResponse{
		ImportedCount: int32(imported),
		FailedCount:   failed,
		Errors:        errorStrings,
	}, nil
}

// 3. Quotation flow operations
func (s *Server) RequestQuotation(ctx context.Context, req *supplierv1.RequestQuotationRequest) (*supplierv1.RequestQuotationResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	material, err := s.materialRepo.GetMaterial(ctx, req.GetMaterialId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "material not found")
	}

	if !material.IsAvailable || material.IsDeleted {
		return nil, status.Error(codes.FailedPrecondition, "material is currently unavailable")
	}

	supplier, err := s.supplierRepo.GetSupplier(ctx, material.SupplierID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "supplier profile not found")
	}

	q := domain.Quotation{
		MaterialID:   material.ID,
		JobID:        req.GetJobId(),
		RequesterID:  userID,
		SupplierID:   supplier.UserID, // Storing supplier user ID
		Status:       domain.StatusPending,
		RequestedQty: int(req.GetRequestedQty()),
		Notes:        req.GetNotes(),
		ExpiresAt:    time.Now().Add(24 * time.Hour),
	}

	// Business rule: requester cannot be the supplier themselves
	if q.RequesterID == q.SupplierID {
		return nil, status.Error(codes.InvalidArgument, "you cannot request a quotation from yourself")
	}

	// Business rule: supplier must have sufficient stock
	if material.Stock < int(req.GetRequestedQty()) {
		return nil, status.Errorf(codes.FailedPrecondition, "insufficient stock: requested %d, available %d", req.GetRequestedQty(), material.Stock)
	}

	created, err := s.quotationRepo.CreateQuotation(ctx, q)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	created.MaterialName = material.Name

	// Send notifications to the supplier
	s.notifySupplier(ctx, created)

	return &supplierv1.RequestQuotationResponse{Quotation: toProtoQuotation(created)}, nil
}

func (s *Server) RespondToQuotation(ctx context.Context, req *supplierv1.RespondToQuotationRequest) (*supplierv1.RespondToQuotationResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	q, err := s.quotationRepo.GetQuotation(ctx, req.GetQuotationId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "quotation not found")
	}

	if q.SupplierID != userID {
		return nil, status.Error(codes.PermissionDenied, "you do not have permission to respond to this quotation")
	}

	if q.Status != domain.StatusPending {
		return nil, status.Error(codes.FailedPrecondition, "quotation is not in pending status")
	}

	// Business rule: quotation must not have expired
	if time.Now().After(q.ExpiresAt) {
		return nil, status.Error(codes.FailedPrecondition, "quotation has expired (24-hour window)")
	}

	var deliveryDate *time.Time
	if req.GetDeliveryDate() != "" {
		parsed, err := time.Parse("2006-01-02", req.GetDeliveryDate())
		if err == nil {
			deliveryDate = &parsed
		}
	}

	now := time.Now()
	q.Status = domain.StatusQuoted
	q.OfferedPrice = req.GetPrice()
	q.AvailableQty = int(req.GetQty())
	q.DeliveryDate = deliveryDate
	q.RespondedAt = &now

	updated, err := s.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Send notification to the requester
	s.notifyRequester(ctx, updated)

	return &supplierv1.RespondToQuotationResponse{Quotation: toProtoQuotation(updated)}, nil
}

func (s *Server) CounterOffer(ctx context.Context, req *supplierv1.CounterOfferRequest) (*supplierv1.CounterOfferResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	q, err := s.quotationRepo.GetQuotation(ctx, req.GetQuotationId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "quotation not found")
	}

	if q.RequesterID != userID {
		return nil, status.Error(codes.PermissionDenied, "you are not the requester of this quotation")
	}

	if q.Status != domain.StatusQuoted {
		return nil, status.Error(codes.FailedPrecondition, "quotation cannot be countered (must be in Quoted status)")
	}

	// Business rule: max 3 counter-offers — track via CounterPrice iterations in notes
	// We use a simple DB counter via quotation notes prefix as a lightweight approach.
	// Better: add a counter_offer_count column. For now: count existing counter-offer history.
	existingCounters, _, _ := s.quotationRepo.ListQuotations(ctx, domain.QuotationFilter{
		RequesterID: userID,
		Status:      string(domain.StatusCounterOffered),
		Limit:       10,
	})
	counterCount := 0
	for _, eq := range existingCounters {
		if eq.ID == q.ID {
			counterCount++
		}
	}
	_ = counterCount // Additional counter-offer tracking can be implemented with DB column
	// Note: full counter-limit enforcement requires a DB counter_offer_count column
	// (added in migration 006). For now apply the rule via conditional check:
	var counterOfferCount int
	if s.db != nil {
		_ = s.db.QueryRow(ctx, "SELECT COALESCE(counter_count, 0) FROM quotations WHERE id = $1", q.ID).Scan(&counterOfferCount)
	}
	if counterOfferCount >= 3 {
		return nil, status.Error(codes.FailedPrecondition, "maximum counter-offers reached")
	}

	q.Status = domain.StatusCounterOffered
	q.CounterPrice = req.GetCounterPrice()

	updated, err := s.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Increment counter_count in DB
	if s.db != nil {
		_, _ = s.db.Exec(ctx, "UPDATE quotations SET counter_count = COALESCE(counter_count, 0) + 1 WHERE id = $1", q.ID)
	}

	// Save persistent notification
	s.createNotificationHelper(ctx, updated.SupplierID, "Quotation Countered", fmt.Sprintf("Requester counter-offered Rs.%.2f for %s.", updated.CounterPrice, updated.MaterialName), "quotation")

	// Notify supplier via WS
	event := websocket.WSEvent{
		Type:   "quotation_update",
		RoomID: "user:" + updated.SupplierID,
		Payload: map[string]interface{}{
			"quotationId":  updated.ID,
			"status":       "CounterOffered",
			"counterPrice": updated.CounterPrice,
			"materialName": updated.MaterialName,
		},
	}
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", event)

	return &supplierv1.CounterOfferResponse{Quotation: toProtoQuotation(updated)}, nil
}

func (s *Server) AcceptQuotation(ctx context.Context, req *supplierv1.AcceptQuotationRequest) (*supplierv1.AcceptQuotationResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	q, err := s.quotationRepo.GetQuotation(ctx, req.GetQuotationId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "quotation not found")
	}

	if q.RequesterID != userID {
		return nil, status.Error(codes.PermissionDenied, "you are not the requester of this quotation")
	}

	if q.Status != domain.StatusQuoted && q.Status != domain.StatusCounterOffered {
		return nil, status.Error(codes.FailedPrecondition, "quotation is not in an acceptable status")
	}

	// Stock check before accept
	material, err := s.materialRepo.GetMaterial(ctx, q.MaterialID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "material not found")
	}
	if material.Stock < q.RequestedQty {
		return nil, status.Error(codes.FailedPrecondition, "insufficient stock")
	}

	q.Status = domain.StatusAccepted
	updated, err := s.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Decrement material stock
	_, err = s.materialRepo.UpdateStock(ctx, updated.MaterialID, -updated.RequestedQty)
	if err != nil {
		log.Printf("[Supplier Server] Failed to update stock level for accepted quotation material: %v", err)
	}

	// Notify supplier
	s.notifySupplierAccepted(ctx, updated)

	return &supplierv1.AcceptQuotationResponse{Quotation: toProtoQuotation(updated)}, nil
}

func (s *Server) RejectQuotation(ctx context.Context, req *supplierv1.RejectQuotationRequest) (*supplierv1.RejectQuotationResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	q, err := s.quotationRepo.GetQuotation(ctx, req.GetQuotationId())
	if err != nil {
		return nil, status.Error(codes.NotFound, "quotation not found")
	}

	if q.RequesterID != userID && q.SupplierID != userID {
		return nil, status.Error(codes.PermissionDenied, "you are not a participant of this quotation")
	}

	q.Status = domain.StatusRejected
	updated, err := s.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Notify other party
	otherParty := updated.SupplierID
	if userID == updated.SupplierID {
		otherParty = updated.RequesterID
	}

	s.createNotificationHelper(ctx, otherParty, "Quotation Rejected", fmt.Sprintf("Quotation for %s was rejected.", updated.MaterialName), "quotation")

	event := websocket.WSEvent{
		Type:   "quotation_update",
		RoomID: "user:" + otherParty,
		Payload: map[string]interface{}{
			"quotationId":  updated.ID,
			"status":       "Rejected",
			"materialName": updated.MaterialName,
		},
	}
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", event)

	return &supplierv1.RejectQuotationResponse{Success: true}, nil
}

func (s *Server) ListQuotations(ctx context.Context, req *supplierv1.ListQuotationsRequest) (*supplierv1.ListQuotationsResponse, error) {
	userID := middleware.UserIDFromContext(ctx)
	if userID == "" {
		return nil, status.Error(codes.Unauthenticated, "unauthenticated")
	}

	role := strings.ToLower(middleware.RoleFromContext(ctx))

	filter := domain.QuotationFilter{
		Status: req.GetStatus(),
		Limit:  int(req.GetLimit()),
		Offset: int(req.GetOffset()),
	}

	if role == "supplier" {
		filter.SupplierID = userID
	} else {
		filter.RequesterID = userID
	}

	list, total, err := s.quotationRepo.ListQuotations(ctx, filter)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	var pbList []*supplierv1.Quotation
	for _, item := range list {
		pbList = append(pbList, toProtoQuotation(item))
	}

	return &supplierv1.ListQuotationsResponse{Quotations: pbList, TotalCount: int32(total)}, nil
}

// notification helper handlers
func (s *Server) notifySupplier(ctx context.Context, q domain.Quotation) {
	// Persistent notification
	s.createNotificationHelper(ctx, q.SupplierID, "New Quotation Request", fmt.Sprintf("You received a new quotation request for %dx %s.", q.RequestedQty, q.MaterialName), "quotation")

	// FCM Push
	if s.fcmClient != nil {
		title := "New quotation request"
		body := fmt.Sprintf("Someone needs %dx %s", q.RequestedQty, q.MaterialName)
		_ = s.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
			UserID: q.SupplierID,
			Title:  title,
			Body:   body,
			Type:   "quotation_request",
		}, 3)
	}

	// WS event
	var address string
	if q.JobID != "" && s.db != nil {
		_ = s.db.QueryRow(ctx, "SELECT address FROM jobs WHERE id = $1", q.JobID).Scan(&address)
	}

	event := websocket.WSEvent{
		Type:   "quotation_request",
		RoomID: "user:" + q.SupplierID,
		Payload: map[string]interface{}{
			"quotationId":   q.ID,
			"materialName":  q.MaterialName,
			"qty":           q.RequestedQty,
			"requesterArea": address,
			"jobId":         q.JobID,
		},
	}
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", event)
}

func (s *Server) notifyRequester(ctx context.Context, q domain.Quotation) {
	// Persistent notification
	s.createNotificationHelper(ctx, q.RequesterID, "Quotation Received", fmt.Sprintf("Supplier quoted Rs.%.2f for %s.", q.OfferedPrice, q.MaterialName), "quotation")

	if s.fcmClient != nil {
		title := "Quotation received"
		body := fmt.Sprintf("Supplier quoted Rs.%.2f for %s", q.OfferedPrice, q.MaterialName)
		_ = s.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
			UserID: q.RequesterID,
			Title:  title,
			Body:   body,
			Type:   "quotation_response",
		}, 3)
	}

	event := websocket.WSEvent{
		Type:   "quotation_update",
		RoomID: "user:" + q.RequesterID,
		Payload: map[string]interface{}{
			"quotationId":  q.ID,
			"status":       "Quoted",
			"price":        q.OfferedPrice,
			"materialName": q.MaterialName,
		},
	}
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", event)
}

func (s *Server) notifySupplierAccepted(ctx context.Context, q domain.Quotation) {
	// Persistent notification
	s.createNotificationHelper(ctx, q.SupplierID, "Quotation Accepted", fmt.Sprintf("Your quotation for %s was accepted!", q.MaterialName), "quotation")

	if s.fcmClient != nil {
		title := "Quotation accepted"
		body := fmt.Sprintf("Your quotation for %s was accepted!", q.MaterialName)
		_ = s.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
			UserID: q.SupplierID,
			Title:  title,
			Body:   body,
			Type:   "quotation_accepted",
		}, 3)
	}

	event := websocket.WSEvent{
		Type:   "quotation_update",
		RoomID: "user:" + q.SupplierID,
		Payload: map[string]interface{}{
			"quotationId":  q.ID,
			"status":       "Accepted",
			"materialName": q.MaterialName,
		},
	}
	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", event)
}

func (s *Server) createNotificationHelper(ctx context.Context, userID, title, message, typ string) {
	var notifID string = "notif_fake_id"
	var createdAt time.Time = time.Now()

	if s.db != nil {
		q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at) 
		      VALUES ($1,$2,$3,$4,'{}',false,NOW()) RETURNING id, created_at`
		err := s.db.QueryRow(ctx, q, userID, title, message, typ).Scan(&notifID, &createdAt)
		if err != nil {
			log.Printf("[Supplier Server] failed to create DB notification: %v", err)
			return
		}
	}

	_ = s.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
		Type:   "notification",
		RoomID: "user:" + userID,
		Payload: map[string]interface{}{
			"id":        notifID,
			"userId":    userID,
			"title":     title,
			"message":   message,
			"type":      typ,
			"isRead":    false,
			"createdAt": createdAt.Format(time.RFC3339),
		},
	})
}
