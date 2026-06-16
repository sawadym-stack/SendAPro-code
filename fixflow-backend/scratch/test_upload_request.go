package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type LoginResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
}

func main() {
	ctx := context.Background()
	postgresURL := "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable"
	db, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		fmt.Printf("Database connection failed: %v\n", err)
		return
	}
	defer db.Close()

	// Find a quotation and the corresponding supplier user
	var quotationID string
	var supplierUserID string
	err = db.QueryRow(ctx, `
		SELECT q.id, q.supplier_id 
		FROM quotations q 
		ORDER BY q.requested_at DESC LIMIT 1
	`).Scan(&quotationID, &supplierUserID)
	if err != nil {
		fmt.Printf("Failed to find a quotation: %v\n", err)
		return
	}
	fmt.Printf("Found quotation ID: %s, Supplier User ID: %s\n", quotationID, supplierUserID)

	// Get supplier email
	var email string
	err = db.QueryRow(ctx, "SELECT email FROM users WHERE id = $1", supplierUserID).Scan(&email)
	if err != nil {
		fmt.Printf("Failed to find supplier user email: %v\n", err)
		return
	}
	fmt.Printf("Supplier email: %s\n", email)

	// Log in to get token
	loginBody, _ := json.Marshal(map[string]string{
		"email":    email,
		"password": "seed",
	})
	resp, err := http.Post("http://127.0.0.1:8080/api/v1/auth/login", "application/json", bytes.NewBuffer(loginBody))
	if err != nil {
		fmt.Printf("Login request failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		fmt.Printf("Login failed with status %d: %s\n", resp.StatusCode, string(body))
		return
	}

	var loginResp LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&loginResp); err != nil {
		fmt.Printf("Failed to decode login response: %v\n", err)
		return
	}
	fmt.Println("Login successful! Obtained JWT token.")

	// Prepare multipart form data
	bodyBuf := &bytes.Buffer{}
	bodyWriter := multipart.NewWriter(bodyBuf)
	fileWriter, err := bodyWriter.CreateFormFile("file", "test_delivery.jpg")
	if err != nil {
		fmt.Printf("Failed to create form file: %v\n", err)
		return
	}

	// Write small dummy image bytes
	dummyImageBytes := []byte("RIFF....WEBPVP8 ... dummy image content")
	fileWriter.Write(dummyImageBytes)
	bodyWriter.Close()

	// Perform PATCH request
	req, err := http.NewRequest("PATCH", fmt.Sprintf("http://127.0.0.1:8080/api/v1/quotations/%s/delivery-photo", quotationID), bodyBuf)
	if err != nil {
		fmt.Printf("Failed to create PATCH request: %v\n", err)
		return
	}
	req.Header.Set("Content-Type", bodyWriter.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+loginResp.Token)

	client := &http.Client{}
	patchResp, err := client.Do(req)
	if err != nil {
		fmt.Printf("PATCH request failed: %v\n", err)
		return
	}
	defer patchResp.Body.Close()

	patchBody, _ := io.ReadAll(patchResp.Body)
	fmt.Printf("PATCH request response status: %d\n", patchResp.StatusCode)
	fmt.Printf("Response: %s\n", string(patchBody))
}
