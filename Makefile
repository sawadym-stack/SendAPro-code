.PHONY: up down build proto test deploy

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

proto:
	cd fixflow-backend && buf generate proto/

test:
	cd fixflow-backend && go test ./... -cover

test-frontend:
	cd fixflow-frontend && npm run test

seed:
	cd fixflow-backend && go run ./cmd/seed

migrate:
	cd fixflow-backend && go run ./cmd/migrate up

logs-backend:
	docker compose logs -f backend

logs-all:
	docker compose logs -f

clean:
	docker compose down -v --remove-orphans
