package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	domain "github.com/yourname/fixflow-backend/internal/domain/supplier"
)

// ============================================================================
// SupplierRepository
// ============================================================================

type SupplierRepository struct {
	db *pgxpool.Pool
}

func NewSupplierRepository(db *pgxpool.Pool) *SupplierRepository {
	return &SupplierRepository{db: db}
}

func (r *SupplierRepository) CreateSupplier(ctx context.Context, s domain.Supplier) (domain.Supplier, error) {
	q := `INSERT INTO suppliers (
		user_id, business_name, contact_phone, contact_email, 
		location, service_radius_km, avg_rating, review_count, is_verified, 
		created_at, updated_at
	) VALUES (
		$1, $2, $3, $4, 
		ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9, $10, 
		NOW(), NOW()
	) RETURNING id, created_at`

	var id string
	var createdAt time.Time
	err := r.db.QueryRow(ctx, q,
		s.UserID, s.BusinessName, s.ContactPhone, s.ContactEmail,
		s.Lng, s.Lat, s.ServiceRadiusKm, s.Rating, s.ReviewCount, s.IsVerified,
	).Scan(&id, &createdAt)

	if err != nil {
		return domain.Supplier{}, err
	}

	s.ID = id
	s.CreatedAt = createdAt
	return s, nil
}

func (r *SupplierRepository) GetSupplier(ctx context.Context, supplierID string) (domain.Supplier, error) {
	q := `SELECT 
		id, user_id, COALESCE(business_name, ''), COALESCE(contact_phone, ''), COALESCE(contact_email, ''), 
		COALESCE(ST_Y(location::geometry), 0) as lat, COALESCE(ST_X(location::geometry), 0) as lng,
		service_radius_km, avg_rating, review_count, is_verified, created_at
	FROM suppliers WHERE id = $1`

	var s domain.Supplier
	err := r.db.QueryRow(ctx, q, supplierID).Scan(
		&s.ID, &s.UserID, &s.BusinessName, &s.ContactPhone, &s.ContactEmail,
		&s.Lat, &s.Lng, &s.ServiceRadiusKm, &s.Rating, &s.ReviewCount, &s.IsVerified, &s.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Supplier{}, fmt.Errorf("supplier not found: %s", supplierID)
		}
		return domain.Supplier{}, err
	}

	s.Location.P.X = s.Lng
	s.Location.P.Y = s.Lat
	s.Location.Valid = true
	return s, nil
}

func (r *SupplierRepository) GetSupplierByUserID(ctx context.Context, userID string) (domain.Supplier, error) {
	q := `SELECT 
		id, user_id, COALESCE(business_name, ''), COALESCE(contact_phone, ''), COALESCE(contact_email, ''), 
		COALESCE(ST_Y(location::geometry), 0) as lat, COALESCE(ST_X(location::geometry), 0) as lng,
		service_radius_km, avg_rating, review_count, is_verified, created_at
	FROM suppliers WHERE user_id = $1`

	var s domain.Supplier
	err := r.db.QueryRow(ctx, q, userID).Scan(
		&s.ID, &s.UserID, &s.BusinessName, &s.ContactPhone, &s.ContactEmail,
		&s.Lat, &s.Lng, &s.ServiceRadiusKm, &s.Rating, &s.ReviewCount, &s.IsVerified, &s.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Supplier{}, fmt.Errorf("supplier profile not found for user: %s", userID)
		}
		return domain.Supplier{}, err
	}

	s.Location.P.X = s.Lng
	s.Location.P.Y = s.Lat
	s.Location.Valid = true
	return s, nil
}

func (r *SupplierRepository) UpdateSupplier(ctx context.Context, s domain.Supplier) (domain.Supplier, error) {
	q := `UPDATE suppliers SET 
		business_name = $1, 
		contact_phone = $2, 
		contact_email = $3, 
		location = ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, 
		service_radius_km = $6,
		updated_at = NOW()
	WHERE id = $7`

	_, err := r.db.Exec(ctx, q,
		s.BusinessName, s.ContactPhone, s.ContactEmail,
		s.Lng, s.Lat, s.ServiceRadiusKm, s.ID,
	)
	if err != nil {
		return domain.Supplier{}, err
	}

	return r.GetSupplier(ctx, s.ID)
}

func (r *SupplierRepository) GetNearby(ctx context.Context, lat, lng, radiusKm float64, category string) ([]domain.Supplier, error) {
	q := `SELECT s.id, s.user_id, COALESCE(s.business_name, u.full_name), COALESCE(s.contact_phone, u.phone), COALESCE(s.contact_email, u.email), 
		COALESCE(ST_Y(s.location::geometry), 0) as lat, COALESCE(ST_X(s.location::geometry), 0) as lng,
		s.service_radius_km, s.avg_rating, s.review_count, s.is_verified, s.created_at,
		ST_Distance(s.location::geography, ST_MakePoint($2, $1)::geography) / 1000 as distance_km
	FROM suppliers s
	JOIN users u ON u.id = s.user_id
	WHERE ST_DWithin(
		s.location::geography,
		ST_MakePoint($2, $1)::geography,
		$3 * 1000
	)
	AND ($4 = '' OR EXISTS (
		SELECT 1 FROM materials m 
		WHERE m.supplier_id = s.id 
		AND m.category = $4 
		AND m.is_available = true
		AND m.is_deleted = false
	))
	ORDER BY distance_km ASC
	LIMIT 20`

	rows, err := r.db.Query(ctx, q, lat, lng, radiusKm, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []domain.Supplier
	for rows.Next() {
		var s domain.Supplier
		var dist float64
		err := rows.Scan(
			&s.ID, &s.UserID, &s.BusinessName, &s.ContactPhone, &s.ContactEmail,
			&s.Lat, &s.Lng, &s.ServiceRadiusKm, &s.Rating, &s.ReviewCount, &s.IsVerified, &s.CreatedAt,
			&dist,
		)
		if err != nil {
			return nil, err
		}
		s.Location.P.X = s.Lng
		s.Location.P.Y = s.Lat
		s.Location.Valid = true
		result = append(result, s)
	}

	return result, nil
}

func (r *SupplierRepository) GetAll(ctx context.Context) ([]domain.Supplier, error) {
	q := `SELECT 
		id, user_id, COALESCE(business_name, ''), COALESCE(contact_phone, ''), COALESCE(contact_email, ''), 
		COALESCE(ST_Y(location::geometry), 0) as lat, COALESCE(ST_X(location::geometry), 0) as lng,
		service_radius_km, avg_rating, review_count, is_verified, created_at
	FROM suppliers`

	rows, err := r.db.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []domain.Supplier
	for rows.Next() {
		var s domain.Supplier
		err := rows.Scan(
			&s.ID, &s.UserID, &s.BusinessName, &s.ContactPhone, &s.ContactEmail,
			&s.Lat, &s.Lng, &s.ServiceRadiusKm, &s.Rating, &s.ReviewCount, &s.IsVerified, &s.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		s.Location.P.X = s.Lng
		s.Location.P.Y = s.Lat
		s.Location.Valid = true
		result = append(result, s)
	}

	return result, nil
}

// ============================================================================
// MaterialRepository
// ============================================================================

type MaterialRepository struct {
	db *pgxpool.Pool
}

func NewMaterialRepository(db *pgxpool.Pool) *MaterialRepository {
	return &MaterialRepository{db: db}
}

func (r *MaterialRepository) AddMaterial(ctx context.Context, m domain.Material) (domain.Material, error) {
	q := `INSERT INTO materials (
		supplier_id, name, category, unit_price, stock_quantity, 
		is_available, description, image_url, is_deleted, created_at, updated_at
	) VALUES (
		$1, $2, $3, $4, $5, 
		$6, $7, $8, FALSE, NOW(), NOW()
	) RETURNING id, created_at, updated_at`

	var id string
	var createdAt, updatedAt time.Time
	err := r.db.QueryRow(ctx, q,
		m.SupplierID, m.Name, string(m.Category), m.Price, m.Stock,
		m.IsAvailable, m.Description, m.ImageURL,
	).Scan(&id, &createdAt, &updatedAt)

	if err != nil {
		return domain.Material{}, err
	}

	m.ID = id
	m.CreatedAt = createdAt
	m.UpdatedAt = updatedAt
	return m, nil
}

func (r *MaterialRepository) UpdateMaterial(ctx context.Context, m domain.Material) (domain.Material, error) {
	q := `UPDATE materials SET 
		name = $1, 
		category = $2, 
		unit_price = $3, 
		stock_quantity = $4, 
		is_available = $5, 
		description = $6, 
		image_url = $7, 
		updated_at = NOW()
	WHERE id = $8 AND is_deleted = FALSE`

	_, err := r.db.Exec(ctx, q,
		m.Name, string(m.Category), m.Price, m.Stock,
		m.IsAvailable, m.Description, m.ImageURL, m.ID,
	)
	if err != nil {
		return domain.Material{}, err
	}

	return r.GetMaterial(ctx, m.ID)
}

func (r *MaterialRepository) SoftDeleteMaterial(ctx context.Context, materialID string) error {
	q := `UPDATE materials SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, q, materialID)
	return err
}

func (r *MaterialRepository) ListMaterials(ctx context.Context, supplierID, category string, page, limit int) ([]domain.Material, int, error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 10
	}
	offset := (page - 1) * limit

	whereClause := `WHERE supplier_id = $1 AND is_deleted = FALSE`
	params := []interface{}{supplierID}
	paramIdx := 2

	if category != "" {
		whereClause += fmt.Sprintf(" AND category = $%d", paramIdx)
		params = append(params, category)
		paramIdx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM materials %s", whereClause)
	var total int
	err := r.db.QueryRow(ctx, countQuery, params...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	selectQuery := fmt.Sprintf(`SELECT 
		id, supplier_id, name, category, unit_price, stock_quantity, 
		is_available, COALESCE(description, ''), COALESCE(image_url, ''), is_deleted, created_at, updated_at
	FROM materials %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`, whereClause, paramIdx, paramIdx+1)

	selectParams := append(params, limit, offset)
	rows, err := r.db.Query(ctx, selectQuery, selectParams...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []domain.Material
	for rows.Next() {
		var m domain.Material
		var cat string
		err := rows.Scan(
			&m.ID, &m.SupplierID, &m.Name, &cat, &m.Price, &m.Stock,
			&m.IsAvailable, &m.Description, &m.ImageURL, &m.IsDeleted, &m.CreatedAt, &m.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		m.Category = domain.MaterialCategory(cat)
		list = append(list, m)
	}

	return list, total, nil
}

func (r *MaterialRepository) GetMaterial(ctx context.Context, materialID string) (domain.Material, error) {
	q := `SELECT 
		id, supplier_id, name, category, unit_price, stock_quantity, 
		is_available, COALESCE(description, ''), COALESCE(image_url, ''), is_deleted, created_at, updated_at
	FROM materials WHERE id = $1`

	var m domain.Material
	var cat string
	err := r.db.QueryRow(ctx, q, materialID).Scan(
		&m.ID, &m.SupplierID, &m.Name, &cat, &m.Price, &m.Stock,
		&m.IsAvailable, &m.Description, &m.ImageURL, &m.IsDeleted, &m.CreatedAt, &m.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Material{}, fmt.Errorf("material not found: %s", materialID)
		}
		return domain.Material{}, err
	}

	m.Category = domain.MaterialCategory(cat)
	return m, nil
}

func (r *MaterialRepository) UpdateStock(ctx context.Context, materialID string, delta int) (int, error) {
	q := `UPDATE materials 
	SET stock_quantity = GREATEST(0, stock_quantity + $2),
	    updated_at = NOW()
	WHERE id = $1 AND is_deleted = FALSE
	RETURNING stock_quantity`

	var newStock int
	err := r.db.QueryRow(ctx, q, materialID, delta).Scan(&newStock)
	return newStock, err
}

func (r *MaterialRepository) BulkInsert(ctx context.Context, materials []domain.Material) (int, error) {
	if len(materials) == 0 {
		return 0, nil
	}

	rows := [][]interface{}{}
	now := time.Now()

	for _, m := range materials {
		mID := m.ID
		if mID == "" {
			mID = uuid.NewString()
		}
		rows = append(rows, []interface{}{
			mID, m.SupplierID, m.Name, string(m.Category),
			m.Price, m.Stock, m.IsAvailable, m.Description, m.ImageURL, false, now, now,
		})
	}

	copyCount, err := r.db.CopyFrom(ctx,
		pgx.Identifier{"materials"},
		[]string{"id", "supplier_id", "name", "category", "unit_price", "stock_quantity", "is_available", "description", "image_url", "is_deleted", "created_at", "updated_at"},
		pgx.CopyFromRows(rows),
	)

	return int(copyCount), err
}

// ============================================================================
// QuotationRepository
// ============================================================================

type QuotationRepository struct {
	db *pgxpool.Pool
}

func NewQuotationRepository(db *pgxpool.Pool) *QuotationRepository {
	return &QuotationRepository{db: db}
}

func (r *QuotationRepository) CreateQuotation(ctx context.Context, q domain.Quotation) (domain.Quotation, error) {
	stmt := `INSERT INTO quotations (
		material_id, job_id, requester_id, supplier_id, 
		status, requested_qty, notes, expires_at, requested_at
	) VALUES (
		$1, $2, $3, $4, 
		$5, $6, $7, $8, NOW()
	) RETURNING id, requested_at`

	var id string
	var requestedAt time.Time

	var jobID interface{} = nil
	if q.JobID != "" {
		jobID = q.JobID
	}

	err := r.db.QueryRow(ctx, stmt,
		q.MaterialID, jobID, q.RequesterID, q.SupplierID,
		string(q.Status), q.RequestedQty, q.Notes, q.ExpiresAt,
	).Scan(&id, &requestedAt)

	if err != nil {
		return domain.Quotation{}, err
	}

	q.ID = id
	q.RequestedAt = requestedAt
	return q, nil
}

func (r *QuotationRepository) GetQuotation(ctx context.Context, quotationID string) (domain.Quotation, error) {
	stmt := `SELECT 
		q.id, q.material_id, m.name, COALESCE(q.job_id::text, ''), q.requester_id, q.supplier_id, 
		q.status, q.requested_qty, COALESCE(q.notes, ''), COALESCE(q.offered_price, 0), 
		COALESCE(q.counter_price, 0), COALESCE(q.available_qty, 0), q.delivery_date, 
		q.expires_at, q.requested_at, q.responded_at, COALESCE(q.delivery_photo_url, '')
	FROM quotations q
	JOIN materials m ON m.id = q.material_id
	WHERE q.id = $1`

	var q domain.Quotation
	var status string
	var deliveryDate sql.NullTime
	var respondedAt sql.NullTime

	err := r.db.QueryRow(ctx, stmt, quotationID).Scan(
		&q.ID, &q.MaterialID, &q.MaterialName, &q.JobID, &q.RequesterID, &q.SupplierID,
		&status, &q.RequestedQty, &q.Notes, &q.OfferedPrice,
		&q.CounterPrice, &q.AvailableQty, &deliveryDate,
		&q.ExpiresAt, &q.RequestedAt, &respondedAt, &q.DeliveryPhotoUrl,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Quotation{}, fmt.Errorf("quotation not found: %s", quotationID)
		}
		return domain.Quotation{}, err
	}

	q.Status = domain.QuotationStatus(status)
	if deliveryDate.Valid {
		q.DeliveryDate = &deliveryDate.Time
	}
	if respondedAt.Valid {
		q.RespondedAt = &respondedAt.Time
	}

	return q, nil
}

func (r *QuotationRepository) UpdateQuotation(ctx context.Context, q domain.Quotation) (domain.Quotation, error) {
	stmt := `UPDATE quotations SET 
		status = $1, 
		offered_price = $2, 
		counter_price = $3, 
		available_qty = $4, 
		delivery_date = $5, 
		responded_at = $6,
		delivery_photo_url = $7
	WHERE id = $8`

	var deliveryVal interface{} = nil
	if q.DeliveryDate != nil {
		deliveryVal = *q.DeliveryDate
	}

	var respondedVal interface{} = nil
	if q.RespondedAt != nil {
		respondedVal = *q.RespondedAt
	}

	_, err := r.db.Exec(ctx, stmt,
		string(q.Status), q.OfferedPrice, q.CounterPrice, q.AvailableQty,
		deliveryVal, respondedVal, q.DeliveryPhotoUrl, q.ID,
	)
	if err != nil {
		return domain.Quotation{}, err
	}

	return r.GetQuotation(ctx, q.ID)
}

func (r *QuotationRepository) ListQuotations(ctx context.Context, filter domain.QuotationFilter) ([]domain.Quotation, int, error) {
	whereClauses := []string{"1=1"}
	params := []interface{}{}
	paramIdx := 1

	if filter.SupplierID != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("q.supplier_id = $%d", paramIdx))
		params = append(params, filter.SupplierID)
		paramIdx++
	}
	if filter.RequesterID != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("q.requester_id = $%d", paramIdx))
		params = append(params, filter.RequesterID)
		paramIdx++
	}
	if filter.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("q.status = $%d", paramIdx))
		params = append(params, filter.Status)
		paramIdx++
	}

	whereStmt := "WHERE " + strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM quotations q %s", whereStmt)
	var total int
	err := r.db.QueryRow(ctx, countQuery, params...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	selectQuery := fmt.Sprintf(`SELECT 
		q.id, q.material_id, m.name, COALESCE(q.job_id::text, ''), q.requester_id, q.supplier_id, 
		q.status, q.requested_qty, COALESCE(q.notes, ''), COALESCE(q.offered_price, 0), 
		COALESCE(q.counter_price, 0), COALESCE(q.available_qty, 0), q.delivery_date, 
		q.expires_at, q.requested_at, q.responded_at, COALESCE(q.delivery_photo_url, '')
	FROM quotations q
	JOIN materials m ON m.id = q.material_id
	%s
	ORDER BY q.requested_at DESC
	LIMIT $%d OFFSET $%d`, whereStmt, paramIdx, paramIdx+1)

	limit := 10
	if filter.Limit > 0 {
		limit = filter.Limit
	}
	offset := 0
	if filter.Offset > 0 {
		offset = filter.Offset
	}

	queryParams := append(params, limit, offset)
	rows, err := r.db.Query(ctx, selectQuery, queryParams...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []domain.Quotation
	for rows.Next() {
		var q domain.Quotation
		var status string
		var deliveryDate sql.NullTime
		var respondedAt sql.NullTime

		err := rows.Scan(
			&q.ID, &q.MaterialID, &q.MaterialName, &q.JobID, &q.RequesterID, &q.SupplierID,
			&status, &q.RequestedQty, &q.Notes, &q.OfferedPrice,
			&q.CounterPrice, &q.AvailableQty, &deliveryDate,
			&q.ExpiresAt, &q.RequestedAt, &respondedAt, &q.DeliveryPhotoUrl,
		)
		if err != nil {
			return nil, 0, err
		}

		q.Status = domain.QuotationStatus(status)
		if deliveryDate.Valid {
			q.DeliveryDate = &deliveryDate.Time
		}
		if respondedAt.Valid {
			q.RespondedAt = &respondedAt.Time
		}

		list = append(list, q)
	}

	return list, total, nil
}

func (r *QuotationRepository) ExpireOldQuotations(ctx context.Context) (int, []domain.Quotation, error) {
	q := `UPDATE quotations 
	SET status = 'Expired', responded_at = NOW()
	WHERE status = 'Pending' AND expires_at < NOW()
	RETURNING id, requester_id, material_id`

	rows, err := r.db.Query(ctx, q)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()

	var expired []domain.Quotation
	for rows.Next() {
		var q domain.Quotation
		err := rows.Scan(&q.ID, &q.RequesterID, &q.MaterialID)
		if err != nil {
			return 0, nil, err
		}
		expired = append(expired, q)
	}

	return len(expired), expired, nil
}
