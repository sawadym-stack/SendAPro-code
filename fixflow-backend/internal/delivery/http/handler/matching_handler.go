package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/delivery/websocket"
	matchinguc "github.com/yourname/fixflow-backend/internal/usecase/matching"
)

type MatchingHandler struct {
	uc  matchinguc.Usecase
	db  *pgxpool.Pool
	rdb *redis.Client
}

func NewMatchingHandler(uc matchinguc.Usecase, db *pgxpool.Pool, rdb *redis.Client) *MatchingHandler {
	return &MatchingHandler{uc: uc, db: db, rdb: rdb}
}

func (h *MatchingHandler) NearbyTechnicians(c *fiber.Ctx) error {
	lat, err := strconv.ParseFloat(c.Query("lat"), 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lat"})
	}
	lng, err := strconv.ParseFloat(c.Query("lng"), 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lng"})
	}
	radius, _ := strconv.ParseFloat(c.Query("radius", "10"), 64)
	serviceType := c.Query("serviceType")
	techs, err := h.uc.NearbyTechnicians(c.UserContext(), lat, lng, serviceType, radius, 20)
	if err != nil {
		return err
	}

	if len(techs) == 0 {
		return c.JSON(fiber.Map{"technicians": []interface{}{}})
	}

	techIDs := make([]string, len(techs))
	for i, t := range techs {
		techIDs[i] = t.TechnicianID
	}

	rows, err := h.db.Query(c.UserContext(), `
		SELECT t.id::text, u.full_name, t.avg_rating, t.review_count, COALESCE(u.profile_picture_url, '')
		FROM technicians t
		JOIN users u ON u.id = t.user_id
		WHERE t.id::text = ANY($1)
	`, techIDs)

	type techDetail struct {
		Name              string  `json:"name"`
		Rating            float64 `json:"rating"`
		ReviewCount       int     `json:"reviewCount"`
		ProfilePictureUrl string  `json:"profilePictureUrl"`
	}

	details := make(map[string]techDetail)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tid, name, pic string
			var rating float64
			var count int
			if err := rows.Scan(&tid, &name, &rating, &count, &pic); err == nil {
				details[tid] = techDetail{
					Name:              name,
					Rating:            rating,
					ReviewCount:       count,
					ProfilePictureUrl: pic,
				}
			}
		}
	}

	type enrichedTech struct {
		TechnicianID      string  `json:"technicianId"`
		Latitude          float64 `json:"latitude"`
		Longitude         float64 `json:"longitude"`
		DistanceKm        float64 `json:"distanceKm"`
		Name              string  `json:"name"`
		Rating            float64 `json:"rating"`
		ReviewCount       int     `json:"reviewCount"`
		ProfilePictureUrl string  `json:"profilePictureUrl"`
	}

	responseTechs := make([]enrichedTech, 0, len(techs))
	for _, t := range techs {
		detail, exists := details[t.TechnicianID]
		name := fmt.Sprintf("Technician %s", t.TechnicianID[:8])
		var rating float64
		var count int
		var pic string
		if exists {
			name = detail.Name
			rating = detail.Rating
			count = detail.ReviewCount
			pic = detail.ProfilePictureUrl
		}
		responseTechs = append(responseTechs, enrichedTech{
			TechnicianID:      t.TechnicianID,
			Latitude:          t.Latitude,
			Longitude:         t.Longitude,
			DistanceKm:        t.DistanceKm,
			Name:              name,
			Rating:            rating,
			ReviewCount:       count,
			ProfilePictureUrl: pic,
		})
	}

	return c.JSON(fiber.Map{"technicians": responseTechs})
}

func (h *MatchingHandler) AcceptBooking(c *fiber.Ctx) error {
	var req struct {
		TechnicianID string `json:"technicianId"`
	}
	_ = c.BodyParser(&req)
	if req.TechnicianID == "" {
		if uid, ok := c.Locals("user_id").(string); ok {
			req.TechnicianID = uid
		}
	}
	j, err := h.uc.AcceptBooking(c.UserContext(), req.TechnicianID, c.Params("id"))
	if err != nil {
		if err == matchinguc.ErrJobAlreadyBeingAccepted {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		}
		msg := err.Error()
		if msg == "you already have an active job — complete it first" ||
			msg == "cannot accept new jobs while Offline" ||
			msg == "job is not in Requested state" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msg})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": msg})
	}
	_ = h.rdb.Del(c.UserContext(), "analytics:overview").Err()

	// Notify real-time clients via Redis Pub/Sub
	ctx := c.UserContext()
	// 1. Notify the customer of status change
	event1 := websocket.WSEvent{
		Type:   "job_status",
		RoomID: "job:" + j.ID,
		Payload: map[string]interface{}{
			"type":   "job_status",
			"jobId":  j.ID,
			"status": j.Status,
		},
	}
	if payload1, err := json.Marshal(event1); err == nil {
		_ = h.rdb.Publish(ctx, "ws:rooms", string(payload1)).Err()
	}

	// 2. Notify other nearby technicians to remove this request
	go func() {
		bgCtx := context.Background()
		techs, err := h.uc.NearbyTechnicians(bgCtx, j.Latitude, j.Longitude, j.ServiceType, 15.0, 20)
		if err == nil {
			for _, tech := range techs {
				var userID string
				err := h.db.QueryRow(bgCtx, `SELECT user_id FROM technicians WHERE id::text = $1 OR user_id::text = $1`, tech.TechnicianID).Scan(&userID)
				if err == nil {
					event2 := websocket.WSEvent{
						Type:   "booking_accepted",
						RoomID: "user:" + userID,
						Payload: map[string]interface{}{
							"jobId": j.ID,
						},
					}
					if payload2, err := json.Marshal(event2); err == nil {
						_ = h.rdb.Publish(bgCtx, "ws:rooms", string(payload2)).Err()
					}
				}
			}
		}
	}()

	return c.JSON(j)
}

func (h *MatchingHandler) RejectBooking(c *fiber.Ctx) error {
	var req struct {
		TechnicianID string `json:"technicianId"`
	}
	_ = c.BodyParser(&req)
	if req.TechnicianID == "" {
		if uid, ok := c.Locals("user_id").(string); ok {
			req.TechnicianID = uid
		}
	}
	if err := h.uc.RejectBooking(c.UserContext(), req.TechnicianID, c.Params("id")); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// Persist the rejection in Redis for this technician with 48h expiry
	var techID string
	var techName string
	err := h.db.QueryRow(c.UserContext(), `
		SELECT t.id, u.full_name
		FROM technicians t
		JOIN users u ON u.id = t.user_id
		WHERE t.user_id = $1 OR t.id = $1
	`, req.TechnicianID).Scan(&techID, &techName)
	if err == nil {
		key := "tech:rejected:" + techID
		_ = h.rdb.SAdd(c.UserContext(), key, c.Params("id")).Err()
		_ = h.rdb.Expire(c.UserContext(), key, 48*time.Hour).Err()

		// Get job details to notify customer and admin
		var customerID string
		var jobTitle string
		errJob := h.db.QueryRow(c.UserContext(), `SELECT customer_id, title FROM jobs WHERE id = $1`, c.Params("id")).Scan(&customerID, &jobTitle)
		if errJob == nil && customerID != "" {
			notificationMsg := fmt.Sprintf("Technician %s has rejected your booking request for %s.", techName, jobTitle)
			
			// 1. Write persistent database notification
			var notificationID string
			_ = h.db.QueryRow(c.UserContext(), `
				INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at)
				VALUES ($1, 'Booking Rejected', $2, 'job', '{}'::jsonb, FALSE, NOW())
				RETURNING id::text
			`, customerID, notificationMsg).Scan(&notificationID)

			// 2. Publish live WebSocket event to customer's user room
			event := websocket.WSEvent{
				Type:   "notification",
				RoomID: "user:" + customerID,
				Payload: map[string]interface{}{
					"id":        notificationID,
					"userId":    customerID,
					"title":     "Booking Rejected",
					"message":   notificationMsg,
					"type":      "job",
					"isRead":    false,
					"createdAt": time.Now(),
				},
			}
			if payload, err := json.Marshal(event); err == nil {
				_ = h.rdb.Publish(c.UserContext(), "ws:rooms", string(payload)).Err()
			}

			// 3. Publish to admin room (admin:all)
			adminEvent := websocket.WSEvent{
				Type:   "booking_rejected_admin",
				RoomID: "admin:all",
				Payload: map[string]interface{}{
					"jobId":          c.Params("id"),
					"technicianName": techName,
					"message":        fmt.Sprintf("Technician %s rejected job '%s'.", techName, jobTitle),
				},
			}
			if payload, err := json.Marshal(adminEvent); err == nil {
				_ = h.rdb.Publish(c.UserContext(), "ws:rooms", string(payload)).Err()
			}
		}
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *MatchingHandler) UpdateTechnicianLocation(c *fiber.Ctx) error {
	var req struct {
		TechnicianID string  `json:"technicianId"`
		Lat          float64 `json:"lat"`
		Lng          float64 `json:"lng"`
	}
	_ = c.BodyParser(&req)
	if req.TechnicianID == "" {
		if uid, ok := c.Locals("user_id").(string); ok {
			req.TechnicianID = uid
		}
	}
	if err := h.uc.UpdateTechnicianLocation(c.UserContext(), req.TechnicianID, req.Lat, req.Lng); err != nil {
		return err
	}

	// Query active jobs for this technician and broadcast location update to customer
	if ActiveWSHandler != nil {
		go func() {
			ctx := context.Background()
			var jobID string
			var jobLat, jobLng float64
			q := `SELECT id, COALESCE(ST_Y(location::geometry), 0), COALESCE(ST_X(location::geometry), 0)
			      FROM jobs
			      WHERE technician_id = (SELECT id FROM technicians WHERE user_id = $1 OR id = $1)
			        AND status IN ('Accepted', 'OnTheWay', 'Arrived', 'Working')
			      LIMIT 1`
			err := ActiveWSHandler.db.QueryRow(ctx, q, req.TechnicianID).Scan(&jobID, &jobLat, &jobLng)
			if err == nil && jobID != "" {
				dx := jobLng - req.Lng
				dy := jobLat - req.Lat
				dist := math.Sqrt(dx*dx + dy*dy) * 111.0
				eta := int(dist / 0.5) // approx 30 km/h (0.5 km/min)
				if eta < 1 {
					eta = 1
				}
				_ = ActiveWSHandler.SendToRoom(ctx, "job:"+jobID, map[string]interface{}{
					"type":  "location_update",
					"jobId": jobID,
					"lat":   req.Lat,
					"lng":   req.Lng,
					"eta":   eta,
				})
			}
		}()
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *MatchingHandler) GetTechnicianMe(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var tech struct {
		ID                string   `json:"id"`
		UserID            string   `json:"userId"`
		FullName          string   `json:"fullName"`
		Name              string   `json:"name"`
		Email             string   `json:"email"`
		Phone             string   `json:"phone"`
		Skills            []string `json:"skills"`
		YearsExperience   int      `json:"yearsExperience"`
		ServiceRadius     float64  `json:"serviceRadiusKm"`
		IsAvailable       bool     `json:"isAvailable"`
		AvgRating         float64  `json:"avgRating"`
		Rating            float64  `json:"rating"`
		ReviewCount       int      `json:"reviewCount"`
		Status            string   `json:"status"`
		ProfilePictureUrl string   `json:"profilePictureUrl"`
	}

	query := `SELECT t.id, t.user_id, u.full_name, u.email, u.phone, t.skills, t.years_experience, t.service_radius_km, t.is_available, t.avg_rating, t.review_count, COALESCE(u.profile_picture_url, '')
	          FROM technicians t
	          JOIN users u ON u.id = t.user_id
	          WHERE t.user_id = $1`
	err := h.db.QueryRow(c.UserContext(), query, userID).Scan(
		&tech.ID, &tech.UserID, &tech.FullName, &tech.Email, &tech.Phone, &tech.Skills, &tech.YearsExperience, &tech.ServiceRadius, &tech.IsAvailable, &tech.AvgRating, &tech.ReviewCount, &tech.ProfilePictureUrl,
	)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "technician profile not found"})
	}
	tech.Name = tech.FullName
	tech.Rating = tech.AvgRating

	status, err := h.rdb.HGet(c.UserContext(), "tech:availability:"+tech.ID, "status").Result()
	if err != nil {
		if err == redis.Nil {
			status = "Offline"
		} else {
			return err
		}
	}
	tech.Status = status

	return c.JSON(tech)
}

func (h *MatchingHandler) GetTechnicianProfile(c *fiber.Ctx) error {
	techID := c.Params("id")
	if techID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "technician id is required"})
	}

	var tech struct {
		ID                string   `json:"id"`
		UserID            string   `json:"userId"`
		FullName          string   `json:"fullName"`
		Name              string   `json:"name"`
		Email             string   `json:"email"`
		Phone             string   `json:"phone"`
		Skills            []string `json:"skills"`
		YearsExperience   int      `json:"yearsExperience"`
		ServiceRadius     float64  `json:"serviceRadiusKm"`
		IsAvailable       bool     `json:"isAvailable"`
		AvgRating         float64  `json:"avgRating"`
		Rating            float64  `json:"rating"`
		ReviewCount       int      `json:"reviewCount"`
		Status            string   `json:"status"`
		ProfilePictureUrl string   `json:"profilePictureUrl"`
	}

	query := `SELECT t.id, t.user_id, u.full_name, u.email, u.phone, t.skills, t.years_experience, t.service_radius_km, t.is_available, t.avg_rating, t.review_count, COALESCE(u.profile_picture_url, '')
	          FROM technicians t
	          JOIN users u ON u.id = t.user_id
	          WHERE t.id = $1 OR t.user_id = $1`
	err := h.db.QueryRow(c.UserContext(), query, techID).Scan(
		&tech.ID, &tech.UserID, &tech.FullName, &tech.Email, &tech.Phone, &tech.Skills, &tech.YearsExperience, &tech.ServiceRadius, &tech.IsAvailable, &tech.AvgRating, &tech.ReviewCount, &tech.ProfilePictureUrl,
	)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "technician profile not found"})
	}
	tech.Name = tech.FullName
	tech.Rating = tech.AvgRating

	status, err := h.rdb.HGet(c.UserContext(), "tech:availability:"+tech.ID, "status").Result()
	if err != nil {
		if err == redis.Nil {
			status = "Offline"
		} else {
			return err
		}
	}
	tech.Status = status

	return c.JSON(tech)
}


func (h *MatchingHandler) UpdateTechnicianAvailability(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Status != "Online" && req.Status != "Busy" && req.Status != "Offline" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid status; must be Online, Busy, or Offline"})
	}

	var techID string
	err := h.db.QueryRow(c.UserContext(), `SELECT id FROM technicians WHERE user_id = $1`, userID).Scan(&techID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "technician not found"})
	}

	key := "tech:availability:" + techID
	if err := h.rdb.HSet(c.UserContext(), key, "status", req.Status).Err(); err != nil {
		return err
	}

	isAvailable := req.Status == "Online"
	_, _ = h.db.Exec(c.UserContext(), `UPDATE technicians SET is_available = $1, updated_at = NOW() WHERE id = $2`, isAvailable, techID)

	return c.JSON(fiber.Map{"success": true, "status": req.Status})
}

func (h *MatchingHandler) GetIncomingRequests(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var tech struct {
		ID              string
		Skills          []string
		ServiceRadiusKm float64
		HasLocation     bool
	}
	err := h.db.QueryRow(c.UserContext(), `
		SELECT id, skills, service_radius_km, (current_location IS NOT NULL)
		FROM technicians
		WHERE user_id = $1 OR id = $1
	`, userID).Scan(&tech.ID, &tech.Skills, &tech.ServiceRadiusKm, &tech.HasLocation)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "technician profile not found"})
	}

	// If no location, seed a fallback Kozhikode location so requests can be found
	if !tech.HasLocation {
		kozhiLat, kozhiLng := 11.02, 76.12
		_, _ = h.db.Exec(c.UserContext(), `
			UPDATE technicians 
			SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
			    updated_at = NOW()
			WHERE id = $3
		`, kozhiLng, kozhiLat, tech.ID)
		_ = h.rdb.GeoAdd(c.UserContext(), "technicians:geo", &redis.GeoLocation{
			Name: tech.ID, Latitude: kozhiLat, Longitude: kozhiLng,
		}).Err()
		_ = h.rdb.HSet(c.UserContext(), "tech:location:"+tech.ID, "lat", "11.020000", "lng", "76.120000").Err()
		tech.HasLocation = true
	}

	// Mark as online in Redis so NearbyTechnicians query can dispatch to this tech
	_ = h.rdb.HSet(c.UserContext(), "tech:availability:"+tech.ID, "status", "Online").Err()

	// Use 50km minimum radius to ensure requests are visible
	radius := tech.ServiceRadiusKm
	if radius < 50 {
		radius = 50
	}

	// Fetch the set of rejected jobs for this technician
	rejectedJobs, _ := h.rdb.SMembers(c.UserContext(), "tech:rejected:"+tech.ID).Result()
	rejectedMap := make(map[string]bool)
	for _, id := range rejectedJobs {
		rejectedMap[id] = true
	}

	// Build query — if skills set, filter by them; otherwise show all
	var (
		queryRows pgx.Rows
		queryErr  error
	)
	if len(tech.Skills) > 0 {
		queryRows, queryErr = h.db.Query(c.UserContext(), `
			SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
			       COALESCE(ST_Y(j.location::geometry), 0) as lat, COALESCE(ST_X(j.location::geometry), 0) as lng,
			       j.priority, j.status, j.created_at, j.updated_at
			FROM jobs j
			CROSS JOIN (
				SELECT current_location, service_radius_km
				FROM technicians
				WHERE id = $1
			) t
			WHERE j.status = 'Requested'
			  AND (j.technician_id IS NULL OR j.technician_id = $1)
			  AND j.location IS NOT NULL
			  AND t.current_location IS NOT NULL
			  AND ST_DWithin(j.location, t.current_location, $3 * 1000)
			  AND j.created_at >= NOW() - INTERVAL '48 hours'
			  AND EXISTS (
				  SELECT 1 FROM unnest($2::text[]) s
				  WHERE LOWER(s) = LOWER(j.title)
				     OR (LOWER(s) = 'electrical' AND LOWER(j.title) = 'electrician')
				     OR (LOWER(s) = 'plumbing' AND LOWER(j.title) = 'plumber')
				     OR (
				         (LOWER(s) = 'ac_repair' OR LOWER(s) = 'ac repair' OR LOWER(s) = 'ac') AND
				         (LOWER(j.title) = 'ac_repair' OR LOWER(j.title) = 'ac repair' OR LOWER(j.title) = 'ac')
				     )
			  )
			ORDER BY j.created_at DESC
		`, tech.ID, tech.Skills, radius)
	} else {
		queryRows, queryErr = h.db.Query(c.UserContext(), `
			SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
			       COALESCE(ST_Y(j.location::geometry), 0) as lat, COALESCE(ST_X(j.location::geometry), 0) as lng,
			       j.priority, j.status, j.created_at, j.updated_at
			FROM jobs j
			CROSS JOIN (
				SELECT current_location, service_radius_km
				FROM technicians
				WHERE id = $1
			) t
			WHERE j.status = 'Requested'
			  AND (j.technician_id IS NULL OR j.technician_id = $1)
			  AND j.location IS NOT NULL
			  AND t.current_location IS NOT NULL
			  AND ST_DWithin(j.location, t.current_location, $2 * 1000)
			  AND j.created_at >= NOW() - INTERVAL '48 hours'
			ORDER BY j.created_at DESC
		`, tech.ID, radius)
	}
	if queryErr != nil {
		return queryErr
	}
	defer queryRows.Close()

	jobs := []fiber.Map{}
	for queryRows.Next() {
		var j struct {
			ID           string
			CustomerID   string
			TechnicianID string
			Title        string
			Description  string
			Lat          float64
			Lng          float64
			Priority     string
			Status       string
			CreatedAt    interface{}
			UpdatedAt    interface{}
		}
		if err := queryRows.Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.Title, &j.Description, &j.Lat, &j.Lng, &j.Priority, &j.Status, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return err
		}

		if rejectedMap[j.ID] {
			continue
		}

		jobs = append(jobs, fiber.Map{
			"id":           j.ID,
			"customerId":   j.CustomerID,
			"technicianId": j.TechnicianID,
			"serviceType":  j.Title,
			"description":  j.Description,
			"latitude":     j.Lat,
			"longitude":    j.Lng,
			"urgency":      priorityToDomain(j.Priority),
			"isEmergency":  j.Priority == "urgent",
			"status":       statusToDomain(j.Status),
			"createdAt":    j.CreatedAt,
			"updatedAt":    j.UpdatedAt,
		})
	}

	return c.JSON(jobs)
}


func (h *MatchingHandler) UpdateTechnicianSkills(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		Skills []string `json:"skills"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var allowedSkills []string
	for _, skill := range req.Skills {
		s := skill
		switch skill {
		case "Electrician", "electrical":
			s = "electrical"
		case "Plumber", "plumbing":
			s = "plumbing"
		case "AC Repair", "ac_repair":
			s = "ac_repair"
		}
		if s == "electrical" || s == "plumbing" || s == "ac_repair" {
			allowedSkills = append(allowedSkills, s)
		}
	}

	_, err := h.db.Exec(c.UserContext(), `
		UPDATE technicians
		SET skills = $1, updated_at = NOW()
		WHERE user_id = $2 OR id = $2
	`, allowedSkills, userID)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"success": true, "skills": allowedSkills})
}

