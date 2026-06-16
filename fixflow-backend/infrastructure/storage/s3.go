package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/yourname/fixflow-backend/internal/pkg/config"
)

type S3Client struct {
	client   *minio.Client
	bucket   string
	endpoint string
	useSSL   bool
}

func NewS3Client(ctx context.Context, cfg *config.Config) (*S3Client, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio init error: %w", err)
	}

	return &S3Client{
		client:   client,
		bucket:   cfg.MinIOBucket,
		endpoint: cfg.MinIOEndpoint,
		useSSL:   cfg.MinIOUseSSL,
	}, nil
}

func (s *S3Client) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("failed to check bucket existence: %w", err)
	}
	if !exists {
		err = s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	// Make the bucket public read-only so direct URLs can be loaded in the browser
	policy := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}`, s.bucket)
	err = s.client.SetBucketPolicy(ctx, s.bucket, policy)
	if err != nil {
		return fmt.Errorf("failed to set public bucket policy: %w", err)
	}

	return nil
}

func (s *S3Client) UploadFile(ctx context.Context, key string, reader io.Reader, size int64, contentType string) (string, error) {
	opts := minio.PutObjectOptions{ContentType: contentType}
	_, err := s.client.PutObject(ctx, s.bucket, key, reader, size, opts)
	if err != nil {
		return "", fmt.Errorf("failed to upload object to minio: %w", err)
	}

	scheme := "http"
	if s.useSSL {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/%s/%s", scheme, s.endpoint, s.bucket, key), nil
}

func (s *S3Client) GeneratePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	reqParams := make(url.Values)
	presignedURL, err := s.client.PresignedGetObject(ctx, s.bucket, key, expiry, reqParams)
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned GET url: %w", err)
	}
	return presignedURL.String(), nil
}

func (s *S3Client) DeleteFile(ctx context.Context, key string) error {
	err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete object from minio: %w", err)
	}
	return nil
}
