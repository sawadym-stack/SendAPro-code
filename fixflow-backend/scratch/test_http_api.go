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
	tok, _, err := tm.Generate("6fd5c6a0-84f3-4748-89fb-2ba967405387", "sawadymofficial@gmail.com", "technician", "access", 24*time.Hour)
	if err != nil {
		log.Fatalf("generate token error: %v", err)
	}

	urls := []string{
		"http://localhost:8080/api/v1/reviews/undefined",
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
