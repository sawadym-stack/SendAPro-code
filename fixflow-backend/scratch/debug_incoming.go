package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourname/fixflow-backend/internal/domain/job"
	"github.com/yourname/fixflow-backend/internal/repository/postgres"
)

func main() {
	ctx := context.Background()
	postgresURL := "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable"
	db, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer db.Close()

	// Let's resolve the technician user and profile first
	// Shameer: user_id = 6fd5c6a0-84f3-4748-89fb-2ba967405387
	userID := "6fd5c6a0-84f3-4748-89fb-2ba967405387"
	var tech struct {
		ID              string
		Skills          []string
		ServiceRadiusKm float64
		HasLocation     bool
	}
	err = db.QueryRow(ctx, `
		SELECT id, skills, service_radius_km, (current_location IS NOT NULL)
		FROM technicians
		WHERE user_id = $1 OR id = $1
	`, userID).Scan(&tech.ID, &tech.Skills, &tech.ServiceRadiusKm, &tech.HasLocation)
	if err != nil {
		log.Fatalf("failed to query tech: %v", err)
	}
	fmt.Printf("Tech: ID=%s, Skills=%v, Radius=%f, HasLocation=%v\n", tech.ID, tech.Skills, tech.ServiceRadiusKm, tech.HasLocation)

	// Now run the query for incoming requests
	radius := tech.ServiceRadiusKm
	if radius < 50 {
		radius = 50
	}

	fmt.Println("--- RUNNING FIRST QUERY (with skills) ---")
	q := `
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
			ORDER BY j.created_at DESC`

	rows, err := db.Query(ctx, q, tech.ID, tech.Skills, radius)
	if err != nil {
		log.Fatalf("query failed: %v", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
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
		err := rows.Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.Title, &j.Description, &j.Lat, &j.Lng, &j.Priority, &j.Status, &j.CreatedAt, &j.UpdatedAt)
		if err != nil {
			log.Fatalf("scan failed: %v", err)
		}
		count++
		fmt.Printf("Job: ID=%s, CustID=%s, TechID=%s, Title=%s, Status=%s\n", j.ID, j.CustomerID, j.TechnicianID, j.Title, j.Status)
	}
	fmt.Printf("Total results: %d\n", count)

	techUUID := "7b96133e-4955-4712-95eb-a3c09a53000b"
	jobID := "beb4dd02-c858-4ab9-9233-7c784e7da8be"
	fmt.Printf("--- TESTING REPO UPDATESTATUS FOR JOB %s to Working ---\n", jobID)
	
	repo := postgres.NewJobRepository(db)
	err = repo.UpdateStatus(ctx, jobID, job.StatusWorking, techUUID)
	if err != nil {
		fmt.Printf("UpdateStatus Error: %v\n", err)
	} else {
		fmt.Println("UpdateStatus succeeded!")
	}
}
