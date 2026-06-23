package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	gateway "github.com/yourname/fixflow-backend/infrastructure/gateway"
	grpcserver "github.com/yourname/fixflow-backend/infrastructure/grpc"
	jobhttp "github.com/yourname/fixflow-backend/internal/delivery/http/handler"
	authgrpc "github.com/yourname/fixflow-backend/internal/grpc/auth"
	jobgrpc "github.com/yourname/fixflow-backend/internal/grpc/job"
	notificationgrpc "github.com/yourname/fixflow-backend/internal/grpc/notification"
	"github.com/yourname/fixflow-backend/internal/middleware"
	"github.com/yourname/fixflow-backend/internal/pkg/config"
	"github.com/yourname/fixflow-backend/internal/pkg/database"
	"github.com/yourname/fixflow-backend/internal/pkg/token"
	userrepo "github.com/yourname/fixflow-backend/internal/repository/postgres"
	redisrepo "github.com/yourname/fixflow-backend/internal/repository/redis"
	analyticsuc "github.com/yourname/fixflow-backend/internal/usecase/analytics"
	authuc "github.com/yourname/fixflow-backend/internal/usecase/auth"
	jobuc "github.com/yourname/fixflow-backend/internal/usecase/job"
	matchinguc "github.com/yourname/fixflow-backend/internal/usecase/matching"
	notificationuc "github.com/yourname/fixflow-backend/internal/usecase/notification"

	"time"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	websocket "github.com/yourname/fixflow-backend/internal/delivery/websocket"
	chatgrpc "github.com/yourname/fixflow-backend/internal/grpc/chat"
	trackinggrpc "github.com/yourname/fixflow-backend/internal/grpc/tracking"
	"github.com/yourname/fixflow-backend/infrastructure/storage"
	suppliergrpc "github.com/yourname/fixflow-backend/internal/grpc/supplier"
	"github.com/yourname/fixflow-backend/internal/worker"
	razorpayinfra "github.com/yourname/fixflow-backend/infrastructure/razorpay"
	paymentgrpc "github.com/yourname/fixflow-backend/internal/grpc/payment"
	"github.com/yourname/fixflow-backend/internal/usecase/emergency"
	reviewgrpc "github.com/yourname/fixflow-backend/internal/grpc/review"
	disputegrpc "github.com/yourname/fixflow-backend/internal/grpc/dispute"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	logger, _ := zap.NewProduction()
	defer logger.Sync()

	db, err := database.NewPostgres(ctx, cfg.PostgresURL)
	if err != nil {
		log.Fatalf("postgres: %v. Make sure PostgreSQL is running and reachable at %s.", err, cfg.PostgresURL)
	}
	defer db.Close()

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword, DB: cfg.RedisDB})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis ping failed at %s. Some features may not work. Start Redis and retry. Error: %v", cfg.RedisAddr, err)
	}
	defer rdb.Close()

	// Automatically ensure database schema and seed data
	ensureSchema(ctx, db, rdb)

	tm := token.NewManager(cfg.JWTSecret)
	userRepository := userrepo.NewUserRepository(db)
	jobRepository := userrepo.NewJobRepository(db)
	notificationRepository := userrepo.NewNotificationRepository(db)
	notificationUsecase := notificationuc.NewUsecase(notificationRepository, nil, rdb)
	authUsecase := authuc.NewUsecase(userRepository, rdb, tm, cfg)
	// Initialize S3 storage client (MinIO)
	s3Client, err := storage.NewS3Client(ctx, cfg)
	if err != nil {
		log.Fatalf("failed to initialize S3 client: %v", err)
	}
	if err := s3Client.EnsureBucket(ctx); err != nil {
		log.Printf("Warning: failed to ensure S3 bucket: %v", err)
	}

	// Initialize Firebase FCM Client
	var fcmClient *firebase.FCMClient
	if cfg.FirebaseCredsFile != "" {
		if _, err := os.Stat(cfg.FirebaseCredsFile); err == nil {
			fcmClient, err = firebase.NewFCMClient(ctx, cfg.FirebaseCredsFile)
			if err != nil {
				log.Printf("Warning: failed to initialize Firebase FCM client: %v", err)
			}
		} else {
			log.Printf("Warning: Firebase credentials file '%s' not found. FCM push notifications will be skipped.", cfg.FirebaseCredsFile)
		}
	}

	pubsubRepo := redisrepo.NewRedisPubSubRepo(rdb)
	chatRepository := userrepo.NewChatRepository(db)
	geoRepo := redisrepo.NewGeoRepository(rdb, db)
	lockRepo := redisrepo.NewLockRepository(rdb)
	jobUsecase := jobuc.NewUsecase(jobRepository, notificationUsecase, rdb, db, geoRepo, pubsubRepo, fcmClient)
	matchingUsecase := matchinguc.NewUsecase(jobRepository, geoRepo, lockRepo, notificationUsecase, chatRepository)
	authService := authgrpc.NewServer(authUsecase)
	jobService := jobgrpc.NewServer(jobUsecase, matchingUsecase)
	notificationService := notificationgrpc.NewServer(notificationUsecase)
	chatService := chatgrpc.NewServer(db, chatRepository, pubsubRepo, tm)

	// Payment initializations
	if fcmClient != nil {
		fcmClient.SetDBAndRedis(db, rdb)
	}
	razorpayClient := razorpayinfra.NewRazorpayClient(cfg.RazorpayKeyID, cfg.RazorpayKeySecret, cfg.RazorpayWebhookSecret)
	paymentRepository := userrepo.NewPaymentRepository(db)
	invoiceRepository := userrepo.NewInvoiceRepository(db)
	paymentService := paymentgrpc.NewServer(
		db, rdb, paymentRepository, invoiceRepository, jobRepository, userRepository,
		razorpayClient, s3Client, fcmClient, pubsubRepo, cfg.RazorpayKeyID,
	)

	// Review & Dispute initializations
	reviewRepository := userrepo.NewReviewRepository(db)
	disputeRepository := userrepo.NewDisputeRepository(db)
	reviewService := reviewgrpc.NewServer(reviewRepository, jobRepository, userRepository, db, fcmClient, pubsubRepo)
	disputeService := disputegrpc.NewServer(db, disputeRepository, jobRepository, paymentRepository, razorpayClient, fcmClient, pubsubRepo)

	// Emergency initialization
	emergencyUsecase := emergency.NewUsecase(db, rdb, jobRepository, geoRepo, fcmClient, pubsubRepo)

	// Supplier and Quotation initializations
	supplierRepository := userrepo.NewSupplierRepository(db)
	materialRepository := userrepo.NewMaterialRepository(db)
	quotationRepository := userrepo.NewQuotationRepository(db)
	supplierService := suppliergrpc.NewServer(db, supplierRepository, materialRepository, quotationRepository, rdb, pubsubRepo, fcmClient, tm)

	// Rebuild suppliers:geo from DB in case Redis was flushed
	suppliersList, err := supplierRepository.GetAll(ctx)
	if err == nil {
		for _, s := range suppliersList {
			_ = rdb.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{
				Name:      s.ID,
				Longitude: s.Lng,
				Latitude:  s.Lat,
			}).Err()
		}
	}

	// Rebuild technicians:geo from DB in case Redis was flushed
	techRows, err := db.Query(ctx, `
		SELECT id::text, ST_X(current_location::geometry) as lng, ST_Y(current_location::geometry) as lat, is_available
		FROM technicians
		WHERE current_location IS NOT NULL
	`)
	if err == nil {
		defer techRows.Close()
		countTechs := 0
		for techRows.Next() {
			var tid string
			var lng, lat float64
			var isAvailable bool
			if err := techRows.Scan(&tid, &lng, &lat, &isAvailable); err == nil {
				_ = rdb.GeoAdd(ctx, "technicians:geo", &redis.GeoLocation{
					Name:      tid,
					Longitude: lng,
					Latitude:  lat,
				}).Err()
				_ = rdb.HSet(ctx, "tech:location:"+tid, "lat", fmt.Sprintf("%f", lat), "lng", fmt.Sprintf("%f", lng)).Err()
				status := "Offline"
				if isAvailable {
					status = "Online"
				}
				_ = rdb.HSet(ctx, "tech:availability:"+tid, "status", status).Err()
				countTechs++
			}
		}
		log.Printf("Rebuilt %d technician locations and statuses in Redis from database.\n", countTechs)
	} else {
		log.Printf("Warning: Failed to query technicians for Redis rebuild: %v\n", err)
	}

	// Start quotation expiry worker running every 10 minutes
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				worker.RunQuotationExpiry(context.Background(), quotationRepository, materialRepository, rdb, fcmClient)
			}
		}
	}()

	// Start approval expiry worker running every 10 minutes
	go func() {
		worker.RunApprovalExpiryWorker(db, rdb)
	}()

	// Start scheduled jobs worker running every 1 minute
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				worker.RunSchedulerWorker(context.Background(), rdb, jobRepository, fcmClient, db, geoRepo, pubsubRepo)
			}
		}
	}()

	// Initialize Tracking service
	trackingService := trackinggrpc.NewServer(db, geoRepo, rdb, jobRepository, pubsubRepo, fcmClient, tm)

	// Initialize and run the WebSocket Hub
	hub := websocket.NewHub(rdb)
	hub.DB = db
	go hub.Run()
	go hub.StartRedisSubscriber(ctx)

	rateLimiter := middleware.RateLimitInterceptor(rdb, 100, 100.0/60.0)
	gs, err := grpcserver.New(":50051", logger, tm, authService, jobService, notificationService, trackingService, chatService, supplierService, paymentService, reviewService, disputeService, rateLimiter)
	if err != nil {
		log.Fatalf("grpc init: %v", err)
	}
	go func() {
		if err := gs.Start(); err != nil {
			log.Fatalf("grpc serve: %v", err)
		}
	}()

	gw, err := gateway.NewMux(ctx, "127.0.0.1:50051")
	if err != nil {
		log.Fatalf("gateway init: %v", err)
	}

	app := fiber.New(fiber.Config{
		BodyLimit: 20 * 1024 * 1024, // 20MB
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
	})

	// Enable CORS for all origins, headers and methods
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization, X-Requested-With",
		AllowMethods: "GET,POST,HEAD,PUT,DELETE,PATCH,OPTIONS",
	}))
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.All("/v1/*", adaptor.HTTPHandler(gw))

	// Prometheus metrics endpoint
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	// WebSocket handler
	app.Get("/ws", websocket.WSHandler(hub, cfg.JWTSecret))

	analyticsUsecase := analyticsuc.NewUsecase(db, rdb)
	analyticsHandler := jobhttp.NewAnalyticsHandler(analyticsUsecase, db)

	jobHandler := jobhttp.NewJobHandler(jobUsecase, matchingUsecase, db, emergencyUsecase)
	matchingHandler := jobhttp.NewMatchingHandler(matchingUsecase, db, rdb)
	uploadHandler := jobhttp.NewUploadHandler(s3Client, jobRepository, chatRepository, db)
	chatHandler := jobhttp.NewChatHandler(chatRepository, pubsubRepo, db)
	supplierHandler := jobhttp.NewSupplierHandler(db, supplierRepository, materialRepository, quotationRepository, rdb, pubsubRepo, fcmClient, s3Client)
	paymentHandler := jobhttp.NewPaymentHandler(paymentService, paymentRepository, razorpayClient, fcmClient, pubsubRepo, db)
	reviewHandler := jobhttp.NewReviewHandler(reviewService)
	disputeHandler := jobhttp.NewDisputeHandler(disputeService, db)
	notificationHandler := jobhttp.NewNotificationHandler(notificationService, db)
	authHandler := jobhttp.NewAuthHandler(authUsecase, db, rdb)

	// Public auth routes (NO auth middleware!)
	app.Post("/api/v1/auth/admin/login", authHandler.AdminLogin)
	app.Post("/api/v1/auth/register/customer", authHandler.CustomerRegister)
	app.Post("/api/v1/auth/register/technician", authHandler.TechnicianRegister)
	app.Post("/api/v1/auth/register/supplier", authHandler.SupplierRegister)
	app.Post("/api/v1/auth/login", authHandler.Login)
	app.Post("/api/v1/auth/refresh-token", authHandler.RefreshToken)
	app.Post("/api/v1/auth/send-otp", authHandler.SendOTP)
	app.Post("/api/v1/auth/verify-otp", authHandler.VerifyOTP)

	// Webhook route is public (NO auth middleware!)
	app.Post("/api/v1/payments/webhook", paymentHandler.WebhookHandler)

	// Storage proxy route for uploaded files (NO auth middleware so images can be loaded in <img src="..." />)
	app.Get("/api/v1/storage/*", func(c *fiber.Ctx) error {
		key := c.Params("*")
		reader, contentType, size, err := s3Client.GetObject(c.Context(), key)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file not found"})
		}
		defer reader.Close()

		if contentType == "" || contentType == "application/octet-stream" {
			ext := strings.ToLower(filepath.Ext(key))
			switch ext {
			case ".jpg", ".jpeg":
				contentType = "image/jpeg"
			case ".png":
				contentType = "image/png"
			case ".gif":
				contentType = "image/gif"
			case ".webp":
				contentType = "image/webp"
			case ".svg":
				contentType = "image/svg+xml"
			case ".pdf":
				contentType = "application/pdf"
			}
		}

		c.Set("Content-Type", contentType)
		c.Set("Content-Length", fmt.Sprintf("%d", size))
		return c.SendStream(reader)
	})

	api := app.Group("/api/v1", middleware.FiberJWTAuth(tm))
	api.Get("/notifications", notificationHandler.ListNotifications)
	api.Patch("/notifications/:id/read", notificationHandler.MarkRead)
	api.Post("/jobs", middleware.RequireRoleFiber("customer", "admin"), jobHandler.CreateJob)
	api.Get("/jobs", middleware.RequireRoleFiber("customer", "technician", "admin"), jobHandler.ListCustomerJobs)
	api.Get("/jobs/:id", middleware.RequireRoleFiber("customer", "technician", "admin"), jobHandler.GetJob)
	api.Patch("/jobs/:id/status", middleware.RequireRoleFiber("customer", "technician", "admin"), jobHandler.UpdateJobStatus)
	api.Get("/technicians/nearby", middleware.RequireRoleFiber("customer", "admin"), matchingHandler.NearbyTechnicians)
	api.Post("/jobs/:id/accept", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.AcceptBooking)
	api.Post("/jobs/:id/reject", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.RejectBooking)
	api.Post("/technicians/location", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.UpdateTechnicianLocation)
	api.Get("/technicians/me", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.GetTechnicianMe)
	api.Get("/technicians/requests", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.GetIncomingRequests)
	api.Get("/technicians/:id", middleware.RequireRoleFiber("customer", "technician", "admin"), matchingHandler.GetTechnicianProfile)
	api.Patch("/technicians/availability", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.UpdateTechnicianAvailability)
	api.Put("/technicians/skills", middleware.RequireRoleFiber("technician", "admin"), matchingHandler.UpdateTechnicianSkills)
	api.Post("/chat/rooms/:id/upload", uploadHandler.ChatUpload)
	api.Post("/jobs/:id/images", uploadHandler.JobImages)
	api.Post("/users/me/upload", uploadHandler.UserUpload)
	api.Get("/users/me", authHandler.GetMe)
	api.Get("/chat/rooms/:jobId/messages", chatHandler.GetMessages)
	api.Get("/chat/rooms/:jobId", chatHandler.GetRoomInfo)
	api.Post("/chat/rooms/:id/messages", chatHandler.PostMessage)
	api.Post("/chat/rooms/:id/read", chatHandler.MarkRead)

	// Supplier routes
	api.Post("/suppliers/register", supplierHandler.RegisterSupplier)
	api.Get("/suppliers/me", supplierHandler.GetMyProfile)
	api.Patch("/suppliers/me", supplierHandler.UpdateMyProfile)
	api.Get("/suppliers/nearby", supplierHandler.GetNearbySuppliers)
	api.Get("/suppliers/me/stats", supplierHandler.GetStats)

	// Material routes (supplier, customer, technician, admin)
	api.Get("/suppliers/materials", middleware.RequireRoleFiber("supplier", "customer", "technician", "admin"), supplierHandler.ListMaterials)
	api.Post("/suppliers/materials", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.AddMaterial)
	api.Patch("/suppliers/materials/:id", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.UpdateMaterial)
	api.Delete("/suppliers/materials/:id", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.DeleteMaterial)
	api.Patch("/suppliers/materials/:id/stock", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.UpdateStock)
	api.Post("/suppliers/materials/import", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.ImportMaterials)

	// Quotation routes
	api.Post("/quotations", middleware.RequireRoleFiber("customer", "technician", "admin"), supplierHandler.RequestQuotation)
	api.Get("/quotations", supplierHandler.ListQuotations)
	api.Get("/quotations/:id", supplierHandler.GetQuotation)
	api.Patch("/quotations/:id/respond", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.RespondToQuotation)
	api.Patch("/quotations/:id/counter", middleware.RequireRoleFiber("customer", "technician", "admin"), supplierHandler.CounterOffer)
	api.Patch("/quotations/:id/accept", middleware.RequireRoleFiber("customer", "technician", "admin"), supplierHandler.AcceptQuotation)
	api.Patch("/quotations/:id/reject", supplierHandler.RejectQuotation)
	api.Patch("/quotations/:id/order-status", middleware.RequireRoleFiber("supplier", "customer", "technician", "admin"), supplierHandler.UpdateOrderStatus)
	api.Patch("/quotations/:id/delivery-photo", middleware.RequireRoleFiber("supplier", "admin"), supplierHandler.UploadDeliveryPhoto)

	// Payment routes
	api.Post("/payments/invoice", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.GenerateInvoice)
	api.Get("/payments/invoice/:jobId", middleware.RequireRoleFiber("customer", "technician", "admin"), paymentHandler.GetInvoice)
	api.Post("/payments/invoice/:jobId/remind", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.SendInvoiceReminder)
	api.Post("/payments/order", middleware.RequireRoleFiber("customer", "admin"), paymentHandler.CreatePaymentOrder)
	api.Post("/payments/verify", middleware.RequireRoleFiber("customer", "admin"), paymentHandler.VerifyAndCapture)
	api.Get("/payments/history", middleware.RequireRoleFiber("customer", "technician", "admin"), paymentHandler.GetHistory)
	api.Get("/technicians/platform-fee/pending", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.GetPendingPlatformFees)
	api.Post("/technicians/platform-fee/pay", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.PayPlatformFee)
	api.Post("/technicians/platform-fee/verify", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.VerifyPlatformFee)
	api.Get("/technicians/rewards/status", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.GetRewardsStatus)
	api.Post("/technicians/rewards/claim", middleware.RequireRoleFiber("technician", "admin"), paymentHandler.ClaimReward)

	// Emergency & Scheduled Job routes
	api.Post("/jobs/emergency", middleware.RequireRoleFiber("customer", "admin"), jobHandler.CreateEmergency)
	api.Post("/jobs/schedule", middleware.RequireRoleFiber("customer", "admin"), jobHandler.ScheduleJob)
	api.Get("/jobs/scheduled", middleware.RequireRoleFiber("customer", "admin"), jobHandler.ListScheduledJobs)
	api.Delete("/jobs/scheduled/:id", middleware.RequireRoleFiber("customer", "admin"), jobHandler.CancelScheduledJob)
	api.Patch("/jobs/scheduled/:id", middleware.RequireRoleFiber("customer", "admin"), jobHandler.RescheduleJob)

	// Stats endpoints
	api.Get("/customers/me/stats", middleware.RequireRoleFiber("customer", "admin"), jobHandler.GetCustomerStats)
	api.Get("/technicians/me/stats", middleware.RequireRoleFiber("technician", "admin"), jobHandler.GetTechnicianStats)

	// Review routes
	api.Post("/reviews", middleware.RequireRoleFiber("customer", "technician", "admin"), reviewHandler.SubmitReview)
	api.Get("/reviews/:id", middleware.RequireRoleFiber("customer", "technician", "admin"), reviewHandler.GetReviews)
	api.Get("/reviews/:id/rating", middleware.RequireRoleFiber("customer", "technician", "admin"), reviewHandler.GetRating)

	// Dispute routes
	api.Post("/disputes", middleware.RequireRoleFiber("customer", "technician", "admin"), disputeHandler.RaiseDispute)
	api.Post("/disputes/:id/evidence", middleware.RequireRoleFiber("customer", "technician", "admin"), disputeHandler.UploadEvidence)
	api.Post("/disputes/:id/resolve", middleware.RequireRoleFiber("admin"), disputeHandler.ResolveDispute)
	api.Get("/disputes", middleware.RequireRoleFiber("customer", "technician", "admin"), disputeHandler.GetDisputes)
	api.Get("/disputes/:id", middleware.RequireRoleFiber("customer", "technician", "admin"), disputeHandler.GetDispute)
	api.Patch("/disputes/:id", middleware.RequireRoleFiber("admin"), disputeHandler.UpdateDisputeStatus)

	// Analytics routes
	api.Get("/admin/analytics/overview", middleware.RequireRoleFiber("admin"), analyticsHandler.GetOverview)
	api.Get("/admin/analytics/jobs", middleware.RequireRoleFiber("admin"), analyticsHandler.GetJobStats)
	api.Get("/admin/analytics/revenue", middleware.RequireRoleFiber("admin"), analyticsHandler.GetRevenueStats)
	api.Get("/admin/analytics/technicians", middleware.RequireRoleFiber("admin"), analyticsHandler.GetTopTechnicians)
	api.Get("/admin/reports/export", middleware.RequireRoleFiber("admin"), analyticsHandler.ExportReport)
	api.Get("/suppliers/me/analytics", middleware.RequireRoleFiber("supplier"), analyticsHandler.GetSupplierAnalytics)

	// Admin approval routes (admin only)
	api.Get("/admin/approvals", middleware.RequireRoleFiber("admin"), authHandler.GetApprovalRequests)
	api.Post("/admin/approvals/:id/approve", middleware.RequireRoleFiber("admin"), authHandler.ApproveRequest)
	api.Post("/admin/approvals/:id/reject", middleware.RequireRoleFiber("admin"), authHandler.RejectRequest)
	api.Get("/admin/users", middleware.RequireRoleFiber("admin"), authHandler.GetUsers)
	api.Patch("/admin/users/:id/status", middleware.RequireRoleFiber("admin"), authHandler.UpdateUserStatus)
	api.Get("/admin/technicians/verification-queue", middleware.RequireRoleFiber("admin"), authHandler.GetTechnicianVerificationQueue)
	api.Patch("/admin/technicians/:id/verify", middleware.RequireRoleFiber("admin"), authHandler.VerifyTechnician)

	// Start real-time metrics push broadcaster
	go worker.RunMetricsBroadcaster(analyticsUsecase, pubsubRepo)

	go func() {
		if err := app.Listen(":8080"); err != nil {
			log.Fatalf("fiber listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down servers: broadcasting server_shutdown to WebSocket clients...")
	hub.BroadcastShutdown()
	log.Println("Waiting 10s for WebSocket clients to disconnect gracefully...")
	time.Sleep(10 * time.Second)

	log.Println("Stopping gRPC and Fiber HTTP servers...")
	gs.Stop()
	_ = app.Shutdown()
}

func ensureSchema(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client) {
	migrations := []struct {
		checkQuery string
		sqlFile    string
		logMsg     string
	}{
		{
			checkQuery: "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users')",
			sqlFile:    "001_init.up.sql",
			logMsg:     "Checking 001_init migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_rooms')",
			sqlFile:    "002_chat.up.sql",
			logMsg:     "Checking 002_chat migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='suppliers' AND column_name='business_name')",
			sqlFile:    "003_supplier_quotation.up.sql",
			logMsg:     "Checking 003_supplier_quotation migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices')",
			sqlFile:    "004_payment_invoice.up.sql",
			logMsg:     "Checking 004_payment_invoice migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='technicians' AND column_name='review_count')",
			sqlFile:    "005_core_final.up.sql",
			logMsg:     "Checking 005_core_final migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='jobs' AND column_name='arrived_at')",
			sqlFile:    "006_fixes.up.sql",
			logMsg:     "Checking 006_fixes migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='users' AND column_name='email_verified')",
			sqlFile:    "007_auth_flow.up.sql",
			logMsg:     "Checking 007_auth_flow migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='users' AND column_name='is_email_verified')",
			sqlFile:    "008_auth_approval.up.sql",
			logMsg:     "Checking 008_auth_approval migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='users' AND column_name='is_suspended')",
			sqlFile:    "009_user_suspension.up.sql",
			logMsg:     "Checking 009_user_suspension migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'technician_platform_fees')",
			sqlFile:    "010_platform_fees_and_rewards.up.sql",
			logMsg:     "Checking 010_platform_fees_and_rewards migration...",
		},
		{
			checkQuery: "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name='users' AND column_name='profile_picture_url')",
			sqlFile:    "011_add_profile_picture_url.up.sql",
			logMsg:     "Checking 011_add_profile_picture_url migration...",
		},
	}

	for _, m := range migrations {
		var exists bool
		err := db.QueryRow(ctx, m.checkQuery).Scan(&exists)
		if err != nil || !exists {
			log.Println(m.logMsg)
			paths := []string{
				"migrations/" + m.sqlFile,
				"../migrations/" + m.sqlFile,
				"../../migrations/" + m.sqlFile,
			}
			var sqlBytes []byte
			var readErr error
			for _, p := range paths {
				sqlBytes, readErr = os.ReadFile(p)
				if readErr == nil {
					break
				}
			}
			if readErr != nil {
				log.Printf("Warning: Failed to read migration file %s: %v", m.sqlFile, readErr)
				continue
			}
			_, err = db.Exec(ctx, string(sqlBytes))
			if err != nil {
				log.Printf("Warning: Failed to run migration %s: %v", m.sqlFile, err)
			} else {
				log.Printf("Migration %s executed successfully.", m.sqlFile)
			}
		}
	}

	_, _ = db.Exec(ctx, "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT")
	_, _ = db.Exec(ctx, "ALTER TABLE materials ALTER COLUMN unit DROP NOT NULL")
	_, _ = db.Exec(ctx, "ALTER TABLE materials ALTER COLUMN unit SET DEFAULT 'pcs'")


	// Migrate statuses and constraints to PascalCase
	log.Println("Migrating database statuses and constraints to PascalCase...")
	_, err := db.Exec(ctx, `
		-- Dynamically drop any CHECK constraints on jobs.status, disputes.status, payments.status
		DO $$
		DECLARE
			r RECORD;
		BEGIN
			-- jobs.status
			FOR r IN
				SELECT tc.constraint_name
				FROM information_schema.table_constraints tc
				JOIN information_schema.constraint_column_usage ccu 
				  ON tc.constraint_name = ccu.constraint_name
				  AND tc.table_schema = ccu.table_schema
				WHERE tc.constraint_type = 'CHECK'
				  AND tc.table_name = 'jobs'
				  AND ccu.column_name = 'status'
			LOOP
				EXECUTE 'ALTER TABLE jobs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
			END LOOP;

			-- disputes.status
			FOR r IN
				SELECT tc.constraint_name
				FROM information_schema.table_constraints tc
				JOIN information_schema.constraint_column_usage ccu 
				  ON tc.constraint_name = ccu.constraint_name
				  AND tc.table_schema = ccu.table_schema
				WHERE tc.constraint_type = 'CHECK'
				  AND tc.table_name = 'disputes'
				  AND ccu.column_name = 'status'
			LOOP
				EXECUTE 'ALTER TABLE disputes DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
			END LOOP;

			-- payments.status
			FOR r IN
				SELECT tc.constraint_name
				FROM information_schema.table_constraints tc
				JOIN information_schema.constraint_column_usage ccu 
				  ON tc.constraint_name = ccu.constraint_name
				  AND tc.table_schema = ccu.table_schema
				WHERE tc.constraint_type = 'CHECK'
				  AND tc.table_name = 'payments'
				  AND ccu.column_name = 'status'
			LOOP
				EXECUTE 'ALTER TABLE payments DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
			END LOOP;
		END $$;

		-- Migrate jobs status column values
		UPDATE jobs SET status = 'Requested' WHERE status IN ('created', 'quoted');
		UPDATE jobs SET status = 'Scheduled' WHERE status = 'scheduled';
		UPDATE jobs SET status = 'Accepted' WHERE status = 'assigned';
		UPDATE jobs SET status = 'Working' WHERE status = 'in_progress';
		UPDATE jobs SET status = 'Completed' WHERE status = 'completed';
		UPDATE jobs SET status = 'Cancelled' WHERE status = 'cancelled';
		
		-- Add new check constraint
		ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('Requested', 'Accepted', 'OnTheWay', 'Arrived', 'Working', 'Completed', 'Cancelled', 'Scheduled'));

		-- Migrate disputes status column values
		UPDATE disputes SET status = 'Open' WHERE status = 'open';
		UPDATE disputes SET status = 'UnderReview' WHERE status IN ('in_review', 'UnderReview');
		UPDATE disputes SET status = 'Resolved' WHERE status = 'resolved';
		UPDATE disputes SET status = 'Rejected' WHERE status = 'rejected';

		ALTER TABLE disputes ADD CONSTRAINT disputes_status_check CHECK (status IN ('Open', 'UnderReview', 'Resolved', 'Rejected'));

		-- Migrate payments status column values
		UPDATE payments SET status = 'Pending' WHERE status = 'pending';
		UPDATE payments SET status = 'Authorized' WHERE status = 'authorized';
		UPDATE payments SET status = 'Captured' WHERE status = 'captured';
		UPDATE payments SET status = 'Failed' WHERE status = 'failed';
		UPDATE payments SET status = 'Refunded' WHERE status = 'refunded';

		ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('Pending', 'Authorized', 'Captured', 'Failed', 'Refunded'));

		-- Update indexes
		DROP INDEX IF EXISTS idx_one_active_job_per_tech;
		CREATE UNIQUE INDEX idx_one_active_job_per_tech
		ON jobs(technician_id)
		WHERE status NOT IN ('Completed', 'Cancelled')
		AND technician_id IS NOT NULL;

		DROP INDEX IF EXISTS idx_one_open_dispute;
		CREATE UNIQUE INDEX idx_one_open_dispute
		ON disputes(job_id)
		WHERE status IN ('Open', 'UnderReview');
	`)
	if err != nil {
		log.Printf("Warning: Failed to migrate statuses and constraints: %v", err)
	} else {
		log.Println("Database statuses and constraints migrated successfully.")
	}


	// 2. Check if we need to seed
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		log.Printf("Warning: Failed to count users: %v", err)
		return
	}

	if count > 0 {
		migrateLegacySeedPasswords(ctx, db)
		// Clean up legacy admin if exists
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE email = 'admin@fixflow.dev'`)
		// Ensure admin user exists even on existing databases
		var adminCount int
		if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&adminCount); err == nil && adminCount == 0 {
			adminHash, _ := bcrypt.GenerateFromPassword([]byte("admin@123"), bcrypt.DefaultCost)
			adminUID := uuid.NewString()
			_, _ = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified, is_email_verified, approval_status) VALUES ($1,'Admin','admin@gmail.com','00000000001',$2,'admin',true,true,'auto_approved') ON CONFLICT (email) DO NOTHING`, adminUID, string(adminHash))
			log.Println("Admin user seeded: admin@gmail.com / admin@123")
		}
	}

	if count == 0 {
		log.Println("Database is empty. Seeding data...")
		services := []string{"plumbing", "electrical", "ac_repair"}
		customerIDs := make([]string, 0, 5)
		techIDs := make([]string, 0, 10)
		supplierIDs := make([]string, 0, 3)

		password := "seed"
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Warning: Failed to generate bcrypt hash: %v", err)
			return
		}

		for i := 1; i <= 5; i++ {
			uid := uuid.NewString()
			_, err = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,$5,'customer',true) ON CONFLICT (email) DO NOTHING`, uid, fmt.Sprintf("Customer %d", i), fmt.Sprintf("customer%d@fixflow.dev", i), fmt.Sprintf("90000000%02d", i), string(passwordHash))
			if err != nil {
				log.Printf("Warning: Failed to seed customer %d: %v", i, err)
				return
			}
			customerIDs = append(customerIDs, uid)
		}

		for i := 1; i <= 10; i++ {
			uid := uuid.NewString()
			tid := uuid.NewString()
			service := services[i%len(services)]
			lat := 11.0 + float64(i)*0.01
			lng := 76.1 + float64(i)*0.01
			_, err = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,$5,'technician',true) ON CONFLICT (email) DO NOTHING`, uid, fmt.Sprintf("Technician %d", i), fmt.Sprintf("tech%d@fixflow.dev", i), fmt.Sprintf("91000000%02d", i), string(passwordHash))
			if err != nil {
				log.Printf("Warning: Failed to seed tech user %d: %v", i, err)
				return
			}
			_, err = db.Exec(ctx, `INSERT INTO technicians (id, user_id, skills, years_experience, service_radius_km, current_location, is_available) VALUES ($1,$2,$3,3,15,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,true) ON CONFLICT (user_id) DO NOTHING`, tid, uid, []string{service}, lng, lat)
			if err != nil {
				log.Printf("Warning: Failed to seed technician %d: %v", i, err)
				return
			}
			techIDs = append(techIDs, tid)

			// Add to Redis Geo and mark Online
			_ = rdb.GeoAdd(ctx, "technicians:geo", &redis.GeoLocation{
				Name:      tid,
				Latitude:  lat,
				Longitude: lng,
			}).Err()
			_ = rdb.HSet(ctx, "tech:location:"+tid, "lat", fmt.Sprintf("%f", lat), "lng", fmt.Sprintf("%f", lng)).Err()
			_ = rdb.HSet(ctx, "tech:availability:"+tid, "status", "Online").Err()
		}

		// Seed admin user
		adminHash, _ := bcrypt.GenerateFromPassword([]byte("admin@123"), bcrypt.DefaultCost)
		adminUID := uuid.NewString()
		_, _ = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified, is_email_verified, approval_status) VALUES ($1,'Admin','admin@gmail.com','00000000001',$2,'admin',true,true,'auto_approved') ON CONFLICT (email) DO NOTHING`, adminUID, string(adminHash))

		for i := 1; i <= 3; i++ {
			suid := uuid.NewString()
			sid := uuid.NewString()
			slat := 11.15 + float64(i)*0.05
			slng := 75.85 + float64(i)*0.05
			_, _ = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,$5,'supplier',true) ON CONFLICT (email) DO NOTHING`, suid, fmt.Sprintf("Kozhikode Hardware & Supply %d", i), fmt.Sprintf("supplier%d@fixflow.dev", i), fmt.Sprintf("92000000%02d", i), string(passwordHash))
			_, err = db.Exec(ctx, `INSERT INTO suppliers (id, user_id, name, email, phone, address, location) VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography) ON CONFLICT (email) DO NOTHING`, sid, suid, fmt.Sprintf("Kozhikode Hardware & Supply %d", i), fmt.Sprintf("supplier%d@fixflow.dev", i), fmt.Sprintf("92000000%02d", i), "Kozhikode, Kerala", slng, slat)
			if err != nil {
				log.Printf("Warning: Failed to seed supplier %d: %v", i, err)
			}
			supplierIDs = append(supplierIDs, sid)
			_ = rdb.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{Name: sid, Latitude: slat, Longitude: slng}).Err()
		}

		// Seed jobs with PascalCase statuses. Each technician gets at most one non-terminal job.
		// Non-terminal: Requested, Accepted, OnTheWay, Arrived, Working
		// Terminal: Completed, Cancelled
		techHasActiveJob := make(map[string]bool)
		terminalStatuses := []string{"Completed", "Cancelled"}
		activeStatuses := []string{"Requested", "Accepted", "Working"}
		jobCount := 0
		for i := 1; i <= 20; i++ {
			jid := uuid.NewString()
			customerID := customerIDs[i%len(customerIDs)]
			techID := techIDs[i%len(techIDs)]
			var status string
			if !techHasActiveJob[techID] {
				status = activeStatuses[i%len(activeStatuses)]
				techHasActiveJob[techID] = true
			} else {
				status = terminalStatuses[i%len(terminalStatuses)]
			}
			lat := 11.0 + float64(i)*0.005
			lng := 76.1 + float64(i)*0.005
			_, err = db.Exec(ctx, `INSERT INTO jobs (id, customer_id, technician_id, title, description, status, priority, address, location) VALUES ($1,$2,$3,$4,$5,$6,'Normal',$7,ST_SetSRID(ST_MakePoint($8,$9),4326)::geography) ON CONFLICT (id) DO NOTHING`, jid, customerID, techID, fmt.Sprintf("Job %d", i), "Seeded job", status, "Kerala", lng, lat)
			if err != nil {
				log.Printf("Warning: Failed to seed job %d: %v", i, err)
			} else {
				jobCount++
			}
		}

		log.Printf("Database seed complete: 1 admin, %d customers, %d technicians, %d suppliers, %d jobs\n", len(customerIDs), len(techIDs), len(supplierIDs), jobCount)
	}
}

func migrateLegacySeedPasswords(ctx context.Context, db *pgxpool.Pool) {
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE password_hash = 'seed'`).Scan(&count); err != nil {
		log.Printf("Warning: Failed to count legacy seed passwords: %v", err)
		return
	}
	if count == 0 {
		return
	}

	password := "seed"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Warning: Failed to generate bcrypt hash for legacy seed password: %v", err)
		return
	}

	if _, err := db.Exec(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE password_hash = 'seed'`, string(hash)); err != nil {
		log.Printf("Warning: Failed to migrate legacy seed passwords: %v", err)
		return
	}
	log.Printf("Migrated %d legacy seed password(s) to bcrypt hashes.", count)
}
