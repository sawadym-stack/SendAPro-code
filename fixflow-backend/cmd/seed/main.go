package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/internal/pkg/config"
	"github.com/yourname/fixflow-backend/internal/pkg/database"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := database.NewPostgres(ctx, cfg.PostgresURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword, DB: cfg.RedisDB})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis ping failed at %s. Some features may not work. Start Redis and retry. Error: %v", cfg.RedisAddr, err)
	}
	defer rdb.Close()

	// 1. Truncate all tables for a clean slate
	log.Println("Truncating tables for clean seed...")
	_, err = db.Exec(ctx, `TRUNCATE users, technicians, jobs, payments, invoices, reviews, disputes, suppliers, materials, quotations CASCADE`)
	if err != nil {
		log.Printf("Warning: TRUNCATE failed: %v", err)
	}

	// 2. Run migrations to ensure PascalCase check constraints are active
	log.Println("Applying PascalCase check constraints...")
	_, err = db.Exec(ctx, `
		ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
		ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('Requested', 'Accepted', 'OnTheWay', 'Arrived', 'Working', 'Completed', 'Cancelled', 'Scheduled'));

		ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
		ALTER TABLE disputes ADD CONSTRAINT disputes_status_check CHECK (status IN ('Open', 'UnderReview', 'Resolved', 'Rejected'));

		ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
		ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('Pending', 'Authorized', 'Captured', 'Failed', 'Refunded'));

		DROP INDEX IF EXISTS idx_one_active_job_per_tech;
		CREATE UNIQUE INDEX idx_one_active_job_per_tech ON jobs(technician_id) WHERE status NOT IN ('Completed', 'Cancelled') AND technician_id IS NOT NULL;

		DROP INDEX IF EXISTS idx_one_open_dispute;
		CREATE UNIQUE INDEX idx_one_open_dispute ON disputes(job_id) WHERE status IN ('Open', 'UnderReview');
	`)
	if err != nil {
		log.Printf("Warning: Applying PascalCase check constraints failed: %v", err)
	}

	services := []string{"plumbing", "electrical", "ac_repair"}
	customerIDs := make([]string, 0, 5)
	techIDs := make([]string, 0, 10)
	supplierUserIDs := make([]string, 0, 3)
	supplierIDs := make([]string, 0, 3)

	// Hash password once for all seed users
	password := "seed"
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	// Kerala customer names
	customerNames := []string{"Rahul Nair", "Anjali Menon", "Siddharth Pillai", "Fathima Rizvi", "Gokul Das"}
	for i, name := range customerNames {
		uid := uuid.NewString()
		_, err = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,$5,'customer',true) ON CONFLICT (email) DO NOTHING`, uid, name, fmt.Sprintf("customer%d@fixflow.dev", i+1), fmt.Sprintf("90000000%02d", i+1), string(passwordHash))
		if err != nil {
			log.Fatal(err)
		}
		// Retrieve ID if conflict happened
		_ = db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, fmt.Sprintf("customer%d@fixflow.dev", i+1)).Scan(&uid)
		customerIDs = append(customerIDs, uid)
	}

	// Kerala technician names
	techNames := []string{
		"Karan Joseph", "Anoop Krishnan", "Manoj Kumar", "Jithesh KV", "Safeer Ali",
		"Arun Chandran", "Harish Madhavan", "Vimal Raj", "Shaju PK", "Deepak PV",
	}
	for i, name := range techNames {
		uid := uuid.NewString()
		tid := uuid.NewString()
		service := services[i%len(services)]
		// Geolocation around Kozhikode (lat: 11.2588, lng: 75.7804)
		lat := 11.2588 + float64(i)*0.005
		lng := 75.7804 + float64(i)*0.005

		_, err = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,$5,'technician',true) ON CONFLICT (email) DO NOTHING`, uid, name, fmt.Sprintf("tech%d@fixflow.dev", i+1), fmt.Sprintf("91000000%02d", i+1), string(passwordHash))
		if err != nil {
			log.Fatal(err)
		}
		_ = db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, fmt.Sprintf("tech%d@fixflow.dev", i+1)).Scan(&uid)

		_, err = db.Exec(ctx, `INSERT INTO technicians (id, user_id, skills, years_experience, service_radius_km, current_location, is_available) VALUES ($1,$2,$3,3,15,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,true) ON CONFLICT (user_id) DO NOTHING`, tid, uid, []string{service}, lng, lat)
		if err != nil {
			log.Fatal(err)
		}
		_ = db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1`, uid).Scan(&tid)
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

	// Kerala supplier names
	supplierNames := []string{"Malabar Electricals", "Kozhikode Plumbing Hub", "Kerala Air Conditioning Controls"}
	for i, name := range supplierNames {
		uid := uuid.NewString()
		sid := uuid.NewString()
		lat := 11.2588 - float64(i)*0.004
		lng := 75.7804 - float64(i)*0.004

		_, err = db.Exec(ctx, `INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,$5,'supplier',true) ON CONFLICT (email) DO NOTHING`, uid, name, fmt.Sprintf("supplier%d@fixflow.dev", i+1), fmt.Sprintf("92000000%02d", i+1), string(passwordHash))
		if err != nil {
			log.Fatal(err)
		}
		_ = db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, fmt.Sprintf("supplier%d@fixflow.dev", i+1)).Scan(&uid)
		supplierUserIDs = append(supplierUserIDs, uid)

		_, err = db.Exec(ctx, `INSERT INTO suppliers (id, user_id, name, email, phone, address, location, service_radius_km, is_verified) VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,25,true) ON CONFLICT (email) DO NOTHING`, sid, uid, name, fmt.Sprintf("supplier%d@fixflow.dev", i+1), fmt.Sprintf("92000000%02d", i+1), "Kozhikode, Kerala", lng, lat)
		if err != nil {
			log.Fatal(err)
		}
		_ = db.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, uid).Scan(&sid)
		supplierIDs = append(supplierIDs, sid)

		// Add to Redis Geo for suppliers
		_ = rdb.GeoAdd(ctx, "suppliers:geo", &redis.GeoLocation{
			Name:      sid,
			Latitude:  lat,
			Longitude: lng,
		}).Err()
	}

	// Seed materials for each supplier
	materialNames := map[string][]string{
		"electrical": {"LED Bulb 9W", "Copper Wire 1.5 sq mm", "Modular Switch 6A"},
		"plumbing":   {"PVC Pipe 1/2 inch", "Brass Tap", "Thread Seal Tape"},
		"ac_repair":  {"AC Capacitor 45uF", "R32 Refrigerant Gas", "Copper Pipe 1/4 inch"},
	}

	categories := []string{"electrical", "plumbing", "ac_repair"}
	var seededMaterials []string
	for i, sid := range supplierIDs {
		cat := categories[i%len(categories)]
		mList := materialNames[cat]
		for j, mName := range mList {
			mid := uuid.NewString()
			price := 50.0 + float64(j*30)
			_, err = db.Exec(ctx, `INSERT INTO materials (id, supplier_id, name, category, unit, unit_price, stock_quantity, is_available) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`, mid, sid, mName, cat, "pcs", price, 100)
			if err == nil {
				seededMaterials = append(seededMaterials, mid)
			}
		}
	}

	// Seed jobs
	for i := 1; i <= 20; i++ {
		jid := uuid.NewString()
		customerID := customerIDs[i%len(customerIDs)]
		lat := 11.2588 + float64(i)*0.003
		lng := 75.7804 + float64(i)*0.003
		service := services[i%len(services)]

		var status string
		var assignedTechID interface{} = nil // default no tech assigned

		// Map status so at most 1 active job per technician is seeded
		if i == 1 {
			status = "Accepted"
			assignedTechID = techIDs[0]
		} else if i == 2 {
			status = "Working"
			assignedTechID = techIDs[1]
		} else if i == 3 {
			status = "OnTheWay"
			assignedTechID = techIDs[2]
		} else if i == 4 {
			status = "Arrived"
			assignedTechID = techIDs[3]
		} else if i == 5 {
			status = "Requested" // No tech assigned for Requested (new request)
			assignedTechID = nil
		} else if i == 6 {
			status = "Scheduled" // No tech assigned for Scheduled
			assignedTechID = nil
		} else {
			// Alternate Completed and Cancelled (inactive - multiple allowed per tech)
			if i%2 == 0 {
				status = "Completed"
			} else {
				status = "Cancelled"
			}
			assignedTechID = techIDs[i%len(techIDs)]
		}

		_, err = db.Exec(ctx, `INSERT INTO jobs (id, customer_id, technician_id, title, description, status, priority, address, location) VALUES ($1,$2,$3,$4,$5,$6,'normal',$7,ST_SetSRID(ST_MakePoint($8,$9),4326)::geography) ON CONFLICT (id) DO NOTHING`, jid, customerID, assignedTechID, service, "Realistic seeded Kerala service job description.", status, "Kozhikode, Kerala", lng, lat)
		if err != nil {
			log.Fatal(err)
		}

		// If completed, add invoice and captured payment
		if status == "Completed" {
			payID := uuid.NewString()
			amount := 350.0 + float64(i*50)
			_, _ = db.Exec(ctx, `INSERT INTO payments (id, job_id, customer_id, technician_id, amount, currency, status, razorpay_order_id, razorpay_payment_id, idempotency_key, created_at, updated_at) VALUES ($1,$2,$3,(SELECT user_id FROM technicians WHERE id = $4),$5,'INR','Captured',$6,$7,$8,NOW(),NOW())`, payID, jid, customerID, assignedTechID, amount, fmt.Sprintf("order_%d", i), fmt.Sprintf("pay_%d", i), uuid.NewString())
			_, _ = db.Exec(ctx, `UPDATE jobs SET is_paid = true WHERE id = $1`, jid)

			// Add Invoice
			itemsJSON := fmt.Sprintf(`[{"description":"Service labor charge","quantity":1,"unitPrice":%f,"total":%f}]`, amount, amount)
			_, _ = db.Exec(ctx, `INSERT INTO invoices (job_id, payment_id, customer_name, tech_name, service_type, line_items, subtotal, tax_rate, tax_amount, total) VALUES ($1,$2,'Customer','Technician',$3,$4,$5,0.0,0.0,$5)`, jid, payID, service, itemsJSON, amount)

			// Add a review
			randRating := int(3 + rand.Intn(3)) // 3 to 5 stars
			_, _ = db.Exec(ctx, `INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1,$2,(SELECT user_id FROM technicians WHERE id = $3),$4,'Great service, highly professional.')`, jid, customerID, assignedTechID, randRating)
		}
	}

	// Update average ratings on tech profile
	_, _ = db.Exec(ctx, `
		UPDATE technicians t
		SET avg_rating = COALESCE((SELECT AVG(rating) FROM reviews WHERE reviewee_id = t.user_id), 5.0),
		    review_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE reviewee_id = t.user_id), 0)
	`)

	fmt.Printf("seed complete: %d customers, %d technicians, %d suppliers, %d jobs, %d materials\n", len(customerIDs), len(techIDs), len(supplierIDs), 20, len(seededMaterials))
	log.Println("Database seeded successfully with Kerala demographics.")
}
