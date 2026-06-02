package main

import (
	"context"
	"fmt"
	"log"
	// "time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx := context.Background()
	postgresURL := "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable"
	db, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer db.Close()

	techID := "09d92611-e9f8-4c6c-a3cb-3a27b743ec0b"
	pageSize := 10
	offset := 0

	var total int32
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE technician_id=$1`, techID).Scan(&total); err != nil {
		log.Fatalf("count error: %v", err)
	}
	fmt.Printf("Total jobs for tech %s: %d\n", techID, total)

	q := `SELECT j.id, j.customer_id, COALESCE(j.technician_id::text,''), j.title, j.description,
	      COALESCE(ST_Y(j.location::geometry),0), COALESCE(ST_X(j.location::geometry),0), j.priority, j.status, j.created_at, j.updated_at,
	      u_cust.full_name AS customer_name, COALESCE(u_cust.phone, '') AS customer_phone,
	      COALESCE(u_tech.full_name, '') AS technician_name, COALESCE(u_tech.phone, '') AS technician_phone
	      FROM jobs j
	      JOIN users u_cust ON j.customer_id = u_cust.id
	      LEFT JOIN technicians t ON j.technician_id = t.id
	      LEFT JOIN users u_tech ON t.user_id = u_tech.id
	      WHERE j.technician_id=$1 ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`

	rows, err := db.Query(ctx, q, techID, pageSize, offset)
	if err != nil {
		log.Fatalf("query error: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var j struct {
			ID              string
			CustomerID      string
			TechnicianID    string
			Title           string
			Description     string
			Lat             float64
			Lng             float64
			Priority        string
			Status          string
			CreatedAt       interface{}
			UpdatedAt       interface{}
			CustomerName    string
			CustomerPhone   string
			TechnicianName  string
			TechnicianPhone string
		}
		err := rows.Scan(&j.ID, &j.CustomerID, &j.TechnicianID, &j.Title, &j.Description, &j.Lat, &j.Lng, &j.Priority, &j.Status, &j.CreatedAt, &j.UpdatedAt, &j.CustomerName, &j.CustomerPhone, &j.TechnicianName, &j.TechnicianPhone)
		if err != nil {
			log.Fatalf("scan error: %v", err)
		}
		fmt.Printf("Scan success: Job ID=%s, Title=%s, Tech=%s, Status=%s, CreatedAt=%v, UpdatedAt=%v\n", j.ID, j.Title, j.TechnicianName, j.Status, j.CreatedAt, j.UpdatedAt)
	}
	fmt.Println("Finished check.")
}
