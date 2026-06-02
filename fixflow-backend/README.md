# fixflow-backend

Backend service for FixFlow, scaffolded with Go, gRPC/protobuf, PostgreSQL (PostGIS), Redis, MinIO, and Jaeger.

## Project Structure

```text
fixflow-backend/
+-- cmd/api
+-- internal
�   +-- adapter
�   �   +-- grpc
�   �   +-- http
�   �   +-- repository
�   +-- app
�   +-- domain
�   +-- pkg
�   �   +-- config
�   �   +-- database
�   �   +-- logger
�   +-- usecase
+-- migrations
+-- proto
�   +-- auth/v1
�   +-- chat/v1
�   +-- job/v1
�   +-- notification/v1
�   +-- supplier/v1
�   +-- tracking/v1
+-- buf.yaml
+-- buf.gen.yaml
+-- docker-compose.yml
+-- .env.example
```

## Local Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Start dependencies:

```bash
docker compose up -d
```

3. Verify PostgreSQL and Redis are available on the mapped ports before running the backend:

```bash
docker compose ps
```

4. Install Go dependencies:

```bash
go mod tidy
```

4. Install buf CLI (if not installed):

```bash
# https://buf.build/docs/installation
```

5. Generate protobuf code:

```bash
buf generate
```

6. Apply database migration using your migration tool (example with migrate):

```bash
migrate -path migrations -database "$POSTGRES_URL" up
```

7. Run the API:

```bash
go run ./cmd/api
```

## Notes

- `tracking` and `chat` services expose bidirectional streams.
- `job` updates and `notification` events expose server streams.
- PostGIS is enabled in the first migration.
