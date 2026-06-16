package main

import (
	"context"
	"fmt"
	"log"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func testConnect(endpoint, accessKey, secretKey string, secure bool) error {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return err
	}

	buckets, err := client.ListBuckets(context.Background())
	if err != nil {
		return err
	}
	fmt.Printf("Successfully connected! Found %d buckets:\n", len(buckets))
	for _, b := range buckets {
		fmt.Printf(" - %s (Created: %v)\n", b.Name, b.CreationDate)
	}
	return nil
}

func main() {
	endpoint := "127.0.0.1:9000"
	secure := false

	fmt.Println("Attempting connection with key 'minioadmin' and secret 'minioadmin'...")
	err := testConnect(endpoint, "minioadmin", "minioadmin", secure)
	if err != nil {
		fmt.Printf("Failed: %v\n", err)
	}

	fmt.Println("\nAttempting connection with key 'minioadmin' and secret 'minioadmin123'...")
	err2 := testConnect(endpoint, "minioadmin", "minioadmin123", secure)
	if err2 != nil {
		fmt.Printf("Failed: %v\n", err2)
	}
}
