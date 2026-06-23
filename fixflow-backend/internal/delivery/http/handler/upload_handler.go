package handler

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/infrastructure/storage"
	domain "github.com/yourname/fixflow-backend/internal/domain/chat"
	jobdomain "github.com/yourname/fixflow-backend/internal/domain/job"
)

type UploadHandler struct {
	s3       *storage.S3Client
	jobRepo  jobdomain.Repository
	chatRepo domain.Repository
	db       *pgxpool.Pool
}

func NewUploadHandler(s3 *storage.S3Client, jobRepo jobdomain.Repository, chatRepo domain.Repository, db *pgxpool.Pool) *UploadHandler {
	return &UploadHandler{
		s3:       s3,
		jobRepo:  jobRepo,
		chatRepo: chatRepo,
		db:       db,
	}
}

func (h *UploadHandler) ChatUpload(c *fiber.Ctx) error {
	ctx := c.Context()
	roomID := c.Params("id")

	// Parse multipart file
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing file field"})
	}

	contentType := file.Header.Get("Content-Type")
	size := file.Size

	// Validate allowed types and max size
	isAudio := strings.HasPrefix(contentType, "audio/")
	isImage := strings.HasPrefix(contentType, "image/")

	if !isAudio && !isImage {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unsupported file type"})
	}

	if isAudio && size > 10*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "audio file exceeds 10MB limit"})
	}
	if isImage && size > 5*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "image file exceeds 5MB limit"})
	}

	allowedTypes := map[string]bool{
		"audio/webm": true, "audio/mp4": true, "audio/ogg": true,
		"image/jpeg": true, "image/png": true, "image/webp": true,
	}
	if !allowedTypes[contentType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "disallowed MIME type"})
	}

	// Determine type
	msgType := "image"
	if isAudio {
		msgType = "voice"
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to open file"})
	}
	defer src.Close()

	// Generate key: chat/{roomId}/{timestamp}_{originalFilename}
	timestamp := time.Now().UnixNano()
	filename := filepath.Base(file.Filename)
	key := fmt.Sprintf("chat/%s/%d_%s", roomID, timestamp, filename)

	// Upload to MinIO
	_, err = h.s3.UploadFile(ctx, key, src, size, contentType)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("upload failed: %v", err)})
	}
	mediaURL := getPublicURL(c, h.s3, key)

	// Generate presigned URL
	expiry := 24 * time.Hour
	if isAudio {
		expiry = 2 * time.Hour
	}
	presignedURL, err := h.s3.GeneratePresignedURL(ctx, key, expiry)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sign url"})
	}

	return c.JSON(fiber.Map{
		"mediaUrl":     mediaURL,
		"presignedUrl": presignedURL,
		"type":         msgType,
		"size":         size,
	})
}

func (h *UploadHandler) JobImages(c *fiber.Ctx) error {
	ctx := c.Context()
	jobID := c.Params("id")
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	jobEntity, err := h.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
	}

	// Validate authorization: customer or technician of this job
	var isParticipant bool
	if jobEntity.CustomerID == userID {
		isParticipant = true
	} else {
		var techID string
		err = h.db.QueryRow(ctx, "SELECT id FROM technicians WHERE user_id = $1", userID).Scan(&techID)
		if err == nil && techID != "" && jobEntity.TechnicianID == techID {
			isParticipant = true
		}
	}
	if !isParticipant {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not authorized to upload images for this job"})
	}

	// Parse file and type field
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing file field"})
	}

	imageType := c.FormValue("type") // "before" or "after"
	if imageType != "before" && imageType != "after" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid type field, must be 'before' or 'after'"})
	}

	contentType := file.Header.Get("Content-Type")
	size := file.Size

	// Validate: max 5MB, image/jpeg or image/png only
	if size > 5*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "image exceeds 5MB limit"})
	}
	if contentType != "image/jpeg" && contentType != "image/png" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only jpeg or png images are allowed"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to open file"})
	}
	defer src.Close()

	// Key: jobs/{jobId}/{type}_{timestamp}.jpg
	timestamp := time.Now().UnixNano()
	ext := ".jpg"
	if contentType == "image/png" {
		ext = ".png"
	}
	key := fmt.Sprintf("jobs/%s/%s_%d%s", jobID, imageType, timestamp, ext)

	// Upload to MinIO
	_, err = h.s3.UploadFile(ctx, key, src, size, contentType)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "upload failed"})
	}
	imageURL := getPublicURL(c, h.s3, key)

	// Save URL to job record
	err = h.jobRepo.AddJobImage(ctx, jobID, imageType, imageURL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save image to job record"})
	}

	// Generate presigned URL (24 hours expiry)
	presignedURL, err := h.s3.GeneratePresignedURL(ctx, key, 24*time.Hour)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sign url"})
	}

	return c.JSON(fiber.Map{
		"imageUrl":     imageURL,
		"presignedUrl": presignedURL,
	})
}

func (h *UploadHandler) UserUpload(c *fiber.Ctx) error {
	ctx := c.Context()
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
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
	key := fmt.Sprintf("users/%s/upload_%d%s", userID, timestamp, ext)

	_, err = h.s3.UploadFile(ctx, key, src, size, contentType)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "upload failed"})
	}
	imageUrl := getPublicURL(c, h.s3, key)

	presignedURL, err := h.s3.GeneratePresignedURL(ctx, key, 24*time.Hour)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sign url"})
	}

	_, err = h.db.Exec(ctx, `UPDATE users SET profile_picture_url = $1, updated_at = NOW() WHERE id = $2`, imageUrl, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save profile picture to database"})
	}

	return c.JSON(fiber.Map{
		"imageUrl":     imageUrl,
		"presignedUrl": presignedURL,
	})
}

func getPublicURL(c *fiber.Ctx, s3 *storage.S3Client, key string) string {
	if s3.PublicURL() != "" {
		return fmt.Sprintf("%s/%s/%s", strings.TrimSuffix(s3.PublicURL(), "/"), s3.Bucket(), key)
	}
	return fmt.Sprintf("%s/api/v1/storage/%s/%s", strings.TrimSuffix(c.BaseURL(), "/"), s3.Bucket(), key)
}
