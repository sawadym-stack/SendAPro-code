package handler

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	"github.com/yourname/fixflow-backend/infrastructure/storage"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	domain "github.com/yourname/fixflow-backend/internal/domain/supplier"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	"github.com/yourname/fixflow-backend/pkg/response"
	"github.com/yourname/fixflow-backend/pkg/validator"
)

type SupplierHandler struct {
	db            *pgxpool.Pool
	supplierRepo  domain.SupplierRepository
	materialRepo  domain.MaterialRepository
	quotationRepo domain.QuotationRepository
	redis         *redis.Client
	pubsubRepo    redisrepo.PubSubRepo
	fcmClient     *firebase.FCMClient
	s3            *storage.S3Client
}

func NewSupplierHandler(
	db *pgxpool.Pool,
	supplierRepo domain.SupplierRepository,
	materialRepo domain.MaterialRepository,
	quotationRepo domain.QuotationRepository,
	redis *redis.Client,
	pubsubRepo redisrepo.PubSubRepo,
	fcmClient *firebase.FCMClient,
	s3 *storage.S3Client,
) *SupplierHandler {
	return &SupplierHandler{
		db:            db,
		supplierRepo:  supplierRepo,
		materialRepo:  materialRepo,
		quotationRepo: quotationRepo,
		redis:         redis,
		pubsubRepo:    pubsubRepo,
		fcmClient:     fcmClient,
		s3:            s3,
	}
}

// 1. Supplier Profiles
func (h *SupplierHandler) RegisterSupplier(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	existing, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err == nil && existing.ID != "" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "supplier profile already exists for this user"})
	}

	type RegisterBody struct {
		BusinessName    string  `json:"businessName" validate:"required,min=3"`
		ContactPhone    string  `json:"contactPhone" validate:"required,phone"`
		ContactEmail    string  `json:"contactEmail" validate:"required,email"`
		Lat             float64 `json:"lat" validate:"required,indialat"`
		Lng             float64 `json:"lng" validate:"required,indialng"`
		ServiceRadiusKm float64 `json:"serviceRadiusKm" validate:"required,gt=0"`
	}
	var body RegisterBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if details := validator.ValidateStruct(&body); len(details) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Validation failed",
			"details": details,
		})
	}

	profile := domain.Supplier{
		UserID:          userID,
		BusinessName:    body.BusinessName,
		ContactPhone:    body.ContactPhone,
		ContactEmail:    body.ContactEmail,
		Lat:             body.Lat,
		Lng:             body.Lng,
		ServiceRadiusKm: body.ServiceRadiusKm,
		IsVerified:      false,
	}

	created, err := h.supplierRepo.CreateSupplier(ctx, profile)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	_ = h.redis.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{
		Name:      created.ID,
		Longitude: created.Lng,
		Latitude:  created.Lat,
	})

	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *SupplierHandler) GetMyProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	profile, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(profile)
}

func (h *SupplierHandler) UpdateMyProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	sProfile, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	type UpdateBody struct {
		BusinessName    string  `json:"businessName"`
		ContactPhone    string  `json:"contactPhone"`
		ContactEmail    string  `json:"contactEmail"`
		Lat             float64 `json:"lat"`
		Lng             float64 `json:"lng"`
		ServiceRadiusKm float64 `json:"serviceRadiusKm"`
	}
	var body UpdateBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	locationChanged := sProfile.Lat != body.Lat || sProfile.Lng != body.Lng

	sProfile.BusinessName = body.BusinessName
	sProfile.ContactPhone = body.ContactPhone
	sProfile.ContactEmail = body.ContactEmail
	sProfile.Lat = body.Lat
	sProfile.Lng = body.Lng
	sProfile.ServiceRadiusKm = body.ServiceRadiusKm

	updated, err := h.supplierRepo.UpdateSupplier(ctx, sProfile)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if locationChanged {
		_ = h.redis.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{
			Name:      updated.ID,
			Longitude: updated.Lng,
			Latitude:  updated.Lat,
		})
	}

	return c.JSON(updated)
}

func (h *SupplierHandler) GetNearbySuppliers(c *fiber.Ctx) error {
	ctx := c.Context()
	lat, err := strconv.ParseFloat(c.Query("lat"), 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid or missing lat"})
	}
	lng, err := strconv.ParseFloat(c.Query("lng"), 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid or missing lng"})
	}
	radiusKm, _ := strconv.ParseFloat(c.Query("radius", "15"), 64)
	category := c.Query("category", "")

	list, err := h.supplierRepo.GetNearby(ctx, lat, lng, radiusKm, category)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(list)
}

// 2. Materials
func (h *SupplierHandler) ListMaterials(c *fiber.Ctx) error {
	ctx := c.Context()
	supplierID := c.Query("supplierId")
	if supplierID == "" {
		userID, ok := c.Locals("user_id").(string)
		if ok && userID != "" {
			profile, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
			if err == nil {
				supplierID = profile.ID
			}
		}
	}
	if supplierID == "" {
		return response.BadRequest(c, "missing supplierId")
	}

	category := c.Query("category")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	list, total, err := h.materialRepo.ListMaterials(ctx, supplierID, category, page, limit)
	if err != nil {
		return response.Err(c, 500, err.Error(), "INTERNAL_ERROR")
	}

	totalPages := 0
	if limit > 0 {
		totalPages = int((int64(total) + int64(limit) - 1) / int64(limit))
	}

	meta := response.PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int64(total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	return response.Paginated(c, list, meta)
}

func (h *SupplierHandler) AddMaterial(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	supplier, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	type MaterialBody struct {
		Name        string  `json:"name"`
		Category    string  `json:"category"`
		Price       float64 `json:"price"`
		Stock       int     `json:"stock"`
		IsAvailable bool    `json:"isAvailable"`
		Description string  `json:"description"`
		ImageURL    string  `json:"imageUrl"`
	}
	var body MaterialBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	m := domain.Material{
		SupplierID:  supplier.ID,
		Name:        body.Name,
		Category:    domain.MaterialCategory(body.Category),
		Price:       body.Price,
		Stock:       body.Stock,
		IsAvailable: body.IsAvailable,
		Description: body.Description,
		ImageURL:    body.ImageURL,
	}

	created, err := h.materialRepo.AddMaterial(ctx, m)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *SupplierHandler) UpdateMaterial(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	supplier, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	materialID := c.Params("id")
	m, err := h.materialRepo.GetMaterial(ctx, materialID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "material not found"})
	}

	if m.SupplierID != supplier.ID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you do not own this material"})
	}

	type MaterialBody struct {
		Name        string  `json:"name"`
		Category    string  `json:"category"`
		Price       float64 `json:"price"`
		Stock       int     `json:"stock"`
		IsAvailable bool    `json:"isAvailable"`
		Description string  `json:"description"`
		ImageURL    string  `json:"imageUrl"`
	}
	var body MaterialBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	m.Name = body.Name
	m.Category = domain.MaterialCategory(body.Category)
	m.Price = body.Price
	m.Stock = body.Stock
	m.IsAvailable = body.IsAvailable
	m.Description = body.Description
	m.ImageURL = body.ImageURL

	updated, err := h.materialRepo.UpdateMaterial(ctx, m)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(updated)
}

func (h *SupplierHandler) DeleteMaterial(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	supplier, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	materialID := c.Params("id")
	m, err := h.materialRepo.GetMaterial(ctx, materialID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "material not found"})
	}

	if m.SupplierID != supplier.ID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you do not own this material"})
	}

	err = h.materialRepo.SoftDeleteMaterial(ctx, materialID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *SupplierHandler) UpdateStock(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	supplier, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	materialID := c.Params("id")
	m, err := h.materialRepo.GetMaterial(ctx, materialID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "material not found"})
	}

	if m.SupplierID != supplier.ID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you do not own this material"})
	}

	type StockBody struct {
		Delta int `json:"delta"`
	}
	var body StockBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	newStock, err := h.materialRepo.UpdateStock(ctx, materialID, body.Delta)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"newStock": newStock})
}

func (h *SupplierHandler) ImportMaterials(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	supplier, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	type MaterialImportItem struct {
		Name        string  `json:"name"`
		Category    string  `json:"category"`
		Price       float64 `json:"price"`
		Stock       int     `json:"stock"`
		Description string  `json:"description"`
		ImageURL    string  `json:"imageUrl"`
	}
	type ImportBody struct {
		Materials []MaterialImportItem `json:"materials"`
	}
	var body ImportBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var validItems []domain.Material
	var errorStrings []string
	var failed int

	for idx, item := range body.Materials {
		if item.Name == "" {
			errorStrings = append(errorStrings, fmt.Sprintf("row %d: name is required", idx))
			failed++
			continue
		}
		if item.Price <= 0 {
			errorStrings = append(errorStrings, fmt.Sprintf("row %d: price must be greater than zero", idx))
			failed++
			continue
		}
		if item.Stock < 0 {
			errorStrings = append(errorStrings, fmt.Sprintf("row %d: stock cannot be negative", idx))
			failed++
			continue
		}

		validItems = append(validItems, domain.Material{
			SupplierID:  supplier.ID,
			Name:        item.Name,
			Category:    domain.MaterialCategory(item.Category),
			Price:       item.Price,
			Stock:       item.Stock,
			IsAvailable: true,
			Description: item.Description,
			ImageURL:    item.ImageURL,
		})
	}

	imported := 0
	if len(validItems) > 0 {
		count, err := h.materialRepo.BulkInsert(ctx, validItems)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("failed to bulk insert: %v", err)})
		}
		imported = count
	}

	return c.JSON(fiber.Map{
		"importedCount": imported,
		"failedCount":   failed,
		"errors":        errorStrings,
	})
}

// 3. Quotations
func (h *SupplierHandler) RequestQuotation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	type QuotationBody struct {
		MaterialID   string `json:"materialId"`
		JobID        string `json:"jobId"`
		RequestedQty int    `json:"requestedQty"`
		Notes        string `json:"notes"`
	}
	var body QuotationBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	material, err := h.materialRepo.GetMaterial(ctx, body.MaterialID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "material not found"})
	}

	if !material.IsAvailable || material.IsDeleted {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "material is currently unavailable"})
	}

	supplier, err := h.supplierRepo.GetSupplier(ctx, material.SupplierID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	q := domain.Quotation{
		MaterialID:   material.ID,
		JobID:        body.JobID,
		RequesterID:  userID,
		SupplierID:   supplier.UserID,
		Status:       domain.StatusPending,
		RequestedQty: body.RequestedQty,
		Notes:        body.Notes,
		ExpiresAt:    time.Now().Add(24 * time.Hour),
	}

	created, err := h.quotationRepo.CreateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	created.MaterialName = material.Name

	h.notifySupplier(ctx, created)

	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *SupplierHandler) ListQuotations(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return response.Unauthorized(c)
	}

	role, _ := c.Locals("role").(string)
	role = strings.ToLower(role)

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit
	statusVal := c.Query("status", "")

	filter := domain.QuotationFilter{
		Status: statusVal,
		Limit:  limit,
		Offset: offset,
	}

	if role == "supplier" {
		filter.SupplierID = userID
	} else {
		filter.RequesterID = userID
	}

	list, total, err := h.quotationRepo.ListQuotations(ctx, filter)
	if err != nil {
		return response.Err(c, 500, err.Error(), "INTERNAL_ERROR")
	}

	totalPages := 0
	if limit > 0 {
		totalPages = int((int64(total) + int64(limit) - 1) / int64(limit))
	}

	meta := response.PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int64(total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	return response.Paginated(c, list, meta)
}

func (h *SupplierHandler) GetQuotation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	if q.RequesterID != userID && q.SupplierID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}

	return c.JSON(q)
}

func (h *SupplierHandler) RespondToQuotation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "quotation not found"})
	}

	if q.SupplierID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you do not have permission to respond to this quotation"})
	}

	if q.Status != domain.StatusPending {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "quotation is not in pending status"})
	}

	type RespondBody struct {
		Price        float64 `json:"price"`
		Qty          int     `json:"qty"`
		DeliveryDate string  `json:"deliveryDate"`
	}
	var body RespondBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var deliveryDate *time.Time
	if body.DeliveryDate != "" {
		parsed, err := time.Parse("2006-01-02", body.DeliveryDate)
		if err == nil {
			deliveryDate = &parsed
		}
	}

	now := time.Now()
	q.Status = domain.StatusQuoted
	q.OfferedPrice = body.Price
	q.AvailableQty = body.Qty
	q.DeliveryDate = deliveryDate
	q.RespondedAt = &now

	updated, err := h.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	h.notifyRequester(ctx, updated)

	return c.JSON(updated)
}

func (h *SupplierHandler) CounterOffer(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "quotation not found"})
	}

	if q.RequesterID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you are not the requester of this quotation"})
	}

	if q.Status != domain.StatusQuoted {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "quotation cannot be countered (must be in Quoted status)"})
	}

	type CounterBody struct {
		CounterPrice float64 `json:"counterPrice"`
	}
	var body CounterBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	q.Status = domain.StatusCounterOffered
	q.CounterPrice = body.CounterPrice

	updated, err := h.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	h.createNotificationHelper(ctx, updated.SupplierID, "Quotation Countered", fmt.Sprintf("Requester counter-offered Rs.%.2f for %s.", updated.CounterPrice, updated.MaterialName), "quotation")

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
	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", event)

	return c.JSON(updated)
}

func (h *SupplierHandler) AcceptQuotation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "quotation not found"})
	}

	if q.RequesterID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you are not the requester of this quotation"})
	}

	if q.Status != domain.StatusQuoted && q.Status != domain.StatusCounterOffered {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "quotation is not in an acceptable status"})
	}

	q.Status = domain.StatusAccepted
	updated, err := h.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	_, err = h.materialRepo.UpdateStock(ctx, updated.MaterialID, -updated.RequestedQty)
	if err != nil {
		log.Printf("[Supplier Handler] Failed to decrement stock quantity: %v", err)
	}

	h.notifySupplierAccepted(ctx, updated)

	return c.JSON(updated)
}

func (h *SupplierHandler) RejectQuotation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "quotation not found"})
	}

	if q.RequesterID != userID && q.SupplierID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you are not a participant of this quotation"})
	}

	q.Status = domain.StatusRejected
	updated, err := h.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	otherParty := updated.SupplierID
	if userID == updated.SupplierID {
		otherParty = updated.RequesterID
	}

	h.createNotificationHelper(ctx, otherParty, "Quotation Rejected", fmt.Sprintf("Quotation for %s was rejected.", updated.MaterialName), "quotation")

	event := websocket.WSEvent{
		Type:   "quotation_update",
		RoomID: "user:" + otherParty,
		Payload: map[string]interface{}{
			"quotationId":  updated.ID,
			"status":       "Rejected",
			"materialName": updated.MaterialName,
		},
	}
	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", event)

	return c.JSON(fiber.Map{"success": true})
}

// 4. Supplier Stats
func (h *SupplierHandler) GetStats(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	supplier, err := h.supplierRepo.GetSupplierByUserID(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "supplier profile not found"})
	}

	// 1. Total materials count
	var totalMaterials int
	err = h.db.QueryRow(ctx, "SELECT COUNT(*) FROM materials WHERE supplier_id = $1 AND is_deleted = FALSE", supplier.ID).Scan(&totalMaterials)
	if err != nil {
		totalMaterials = 0
	}

	// 2. Pending quotations count
	var pendingCount int
	err = h.db.QueryRow(ctx, "SELECT COUNT(*) FROM quotations WHERE supplier_id = $1 AND status = 'Pending'", userID).Scan(&pendingCount)
	if err != nil {
		pendingCount = 0
	}

	// 3. Accepted/processed quotations this month
	startOfMonth := time.Now().UTC().AddDate(0, 0, -time.Now().Day()+1)
	var acceptedThisMonth int
	var revenueThisMonth float64

	// Since responded_at is updated when responded/accepted, we query for Accepted/Fulfilling/Delivered statuses within the current month
	err = h.db.QueryRow(ctx, `SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(offered_price * requested_qty), 0) 
		FROM quotations 
		WHERE supplier_id = $1 AND status IN ('Accepted', 'Preparing', 'Dispatched', 'Delivered') AND responded_at >= $2`, userID, startOfMonth).Scan(&acceptedThisMonth, &revenueThisMonth)

	if err != nil {
		acceptedThisMonth = 0
		revenueThisMonth = 0.0
	}

	// 4. Low stock materials (stock <= 5)
	rows, err := h.db.Query(ctx, `SELECT id, name, stock_quantity 
		FROM materials 
		WHERE supplier_id = $1 AND stock_quantity <= 5 AND is_deleted = FALSE 
		ORDER BY stock_quantity ASC LIMIT 10`, supplier.ID)

	type LowStockItem struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Stock int    `json:"stock"`
	}
	var lowStockMaterials []LowStockItem

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var item LowStockItem
			if scanErr := rows.Scan(&item.ID, &item.Name, &item.Stock); scanErr == nil {
				lowStockMaterials = append(lowStockMaterials, item)
			}
		}
	}

	return c.JSON(fiber.Map{
		"totalMaterials":    totalMaterials,
		"pendingQuotations": pendingCount,
		"acceptedThisMonth": acceptedThisMonth,
		"revenueThisMonth":  revenueThisMonth,
		"lowStockMaterials": lowStockMaterials,
	})
}

// notification helper handlers
func (h *SupplierHandler) notifySupplier(ctx context.Context, q domain.Quotation) {
	// Persistent notification
	h.createNotificationHelper(ctx, q.SupplierID, "New Quotation Request", fmt.Sprintf("You received a new quotation request for %dx %s.", q.RequestedQty, q.MaterialName), "quotation")

	// FCM Push
	if h.fcmClient != nil {
		title := "New quotation request"
		body := fmt.Sprintf("Someone needs %dx %s", q.RequestedQty, q.MaterialName)
		_ = h.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
			UserID: q.SupplierID,
			Title:  title,
			Body:   body,
			Type:   "quotation_request",
		}, 3)
	}

	// WS event
	var address string
	if q.JobID != "" {
		_ = h.db.QueryRow(ctx, "SELECT address FROM jobs WHERE id = $1", q.JobID).Scan(&address)
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
	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", event)
}

func (h *SupplierHandler) notifyRequester(ctx context.Context, q domain.Quotation) {
	// Persistent notification
	h.createNotificationHelper(ctx, q.RequesterID, "Quotation Received", fmt.Sprintf("Supplier quoted Rs.%.2f for %s.", q.OfferedPrice, q.MaterialName), "quotation")

	if h.fcmClient != nil {
		title := "Quotation received"
		body := fmt.Sprintf("Supplier quoted Rs.%.2f for %s", q.OfferedPrice, q.MaterialName)
		_ = h.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
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
	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", event)
}

func (h *SupplierHandler) notifySupplierAccepted(ctx context.Context, q domain.Quotation) {
	// Persistent notification
	h.createNotificationHelper(ctx, q.SupplierID, "Quotation Accepted", fmt.Sprintf("Your quotation for %s was accepted!", q.MaterialName), "quotation")

	if h.fcmClient != nil {
		title := "Quotation accepted"
		body := fmt.Sprintf("Your quotation for %s was accepted!", q.MaterialName)
		_ = h.fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
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
	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", event)
}

func (h *SupplierHandler) UpdateOrderStatus(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "quotation not found"})
	}

	if q.SupplierID != userID && q.RequesterID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you do not have permission to access this quotation"})
	}

	type StatusBody struct {
		Status string `json:"status"`
	}
	var body StatusBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	q.Status = domain.QuotationStatus(body.Status)
	updated, err := h.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	otherParty := updated.SupplierID
	if userID == updated.SupplierID {
		otherParty = updated.RequesterID
	}

	h.createNotificationHelper(ctx, otherParty, "Order Status Updated", fmt.Sprintf("Your material order for %s is now %s.", updated.MaterialName, string(updated.Status)), "quotation")

	event := websocket.WSEvent{
		Type:   "quotation_update",
		RoomID: "user:" + otherParty,
		Payload: map[string]interface{}{
			"quotationId":  updated.ID,
			"status":       string(updated.Status),
			"materialName": updated.MaterialName,
		},
	}
	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", event)

	return c.JSON(updated)
}

func (h *SupplierHandler) UploadDeliveryPhoto(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	quotationID := c.Params("id")
	q, err := h.quotationRepo.GetQuotation(ctx, quotationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "quotation not found"})
	}

	if q.SupplierID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "only the supplier can upload a delivery photo"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing file field"})
	}

	contentType := file.Header.Get("Content-Type")
	size := file.Size

	if size > 5*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file exceeds 5MB limit"})
	}
	if !strings.HasPrefix(contentType, "image/") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only images are allowed"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to open file"})
	}
	defer src.Close()

	timestamp := time.Now().UnixNano()
	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	key := fmt.Sprintf("quotations/%s/delivery_%d%s", quotationID, timestamp, ext)

	imageUrl, err := h.s3.UploadFile(ctx, key, src, size, contentType)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "upload failed"})
	}

	q.DeliveryPhotoUrl = imageUrl
	_, err = h.quotationRepo.UpdateQuotation(ctx, q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update quotation delivery photo"})
	}

	return c.JSON(fiber.Map{
		"deliveryPhotoUrl": imageUrl,
	})
}

func (h *SupplierHandler) createNotificationHelper(ctx context.Context, userID, title, message, typ string) {
	q := `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at) 
	      VALUES ($1,$2,$3,$4,'{}',false,NOW()) RETURNING id, created_at`
	var notifID string
	var createdAt time.Time
	err := h.db.QueryRow(ctx, q, userID, title, message, typ).Scan(&notifID, &createdAt)
	if err != nil {
		log.Printf("[Supplier Handler] failed to create DB notification: %v", err)
		return
	}

	_ = h.pubsubRepo.Publish(ctx, "ws:rooms", websocket.WSEvent{
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
