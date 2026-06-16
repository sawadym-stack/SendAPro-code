package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/yourname/fixflow-backend/internal/pkg/token"
)

func main() {
	tm := token.NewManager("change-me")
	tok, _, err := tm.Generate("e2541fcd-00e6-4122-9139-6bbe9b9a8c25", "sawadjr9669@gmail.com", "customer", "access", 24*time.Hour)
	if err != nil {
		log.Fatalf("generate token error: %v", err)
	}

	urls := []string{
		"http://localhost:5173/api/v1/reviews/7b96133e-4955-4712-95eb-a3c09a53000b",
	}

	client := &http.Client{}

	for _, u := range urls {
		req, err := http.NewRequest("GET", u, nil)
		if err != nil {
			log.Fatalf("new request error: %v", err)
		}
		req.Header.Set("Authorization", "Bearer "+tok)

		resp, err := client.Do(req)
		if err != nil {
			log.Fatalf("do request error: %v", err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Fatalf("read body error: %v", err)
		}

		fmt.Printf("URL: %s\nStatus: %d\nBody: %s\n\n", u, resp.StatusCode, string(body))
	}
}
