.PHONY: install api web test build types check-contract docker
install:
	uv sync --directory backend --frozen
	pnpm --dir frontend install --frozen-lockfile
api:
	uv run --directory backend uvicorn isolator.api.main:app --host 127.0.0.1 --port 8000 --reload
web:
	pnpm --dir frontend dev
build:
	pnpm --dir frontend build
test:
	uv run --directory backend pytest -q
	pnpm --dir frontend test
	pnpm --dir frontend test:e2e
types:
	uv run --directory backend python ../scripts/export_openapi.py
	pnpm --dir frontend types
check-contract:
	uv run --directory backend python ../scripts/check_contract.py
docker:
	docker compose up --build -d
