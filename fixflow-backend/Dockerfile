# ─── Stage 1: Proto generation + Build ───
FROM golang:1.25-alpine AS builder

# Install system deps
RUN apk add --no-cache git curl wget unzip ca-certificates

# Install buf CLI for proto generation
RUN curl -sSL \
  "https://github.com/bufbuild/buf/releases/latest/download/buf-Linux-x86_64" \
  -o /usr/local/bin/buf && chmod +x /usr/local/bin/buf

# Install protoc plugins
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && \
    go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@latest && \
    go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-openapiv2@latest

WORKDIR /app

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Generate gRPC stubs from proto files
COPY proto/ proto/
COPY buf.yaml buf.gen.yaml ./
RUN buf generate proto/

# Copy all source
COPY . .

# Build binary
# CGO_ENABLED=0 for static binary (no libc dependency)
# -ldflags="-s -w" strips debug info (smaller binary)
# -trimpath removes local file paths from binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -X main.Version=$(git describe --tags --always --dirty 2>/dev/null || echo 'unknown')" \
    -trimpath \
    -o /app/server \
    ./cmd/server

# ─── Stage 2: Minimal runtime image ───
FROM alpine:3.19 AS runtime

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Runtime dependencies only
RUN apk add --no-cache ca-certificates wget tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .

# Copy migration files
COPY --from=builder /app/migrations ./migrations

# Copy .env.example (for reference only — real config via env vars)
COPY .env.example .

# Set timezone
ENV TZ=Asia/Kolkata

# Run as non-root
USER appuser

# Expose both HTTP and gRPC ports
EXPOSE 8080 50051

# Health check
HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  --start-period=15s \
  --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Run server
CMD ["./server"]
