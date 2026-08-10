# ==============================================================================
# Onedata AI Agent - Makefile
# ==============================================================================
# Common commands for development, build, deploy, and testing.
# ==============================================================================

.PHONY: help dev dev-up dev-down build deploy test lint clean \
        load-ontology index-opensearch sample-queries \
        infra-synth infra-deploy infra-destroy

# Default target
help: ## Show this help message
	@echo "Onedata AI Agent - Available Commands"
	@echo "======================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ==============================================================================
# Development
# ==============================================================================

dev: dev-up ## Start local development environment
	@echo "Development environment started."
	@echo "  Frontend: http://localhost:3000"
	@echo "  Backend:  http://localhost:8000"
	@echo "  OpenSearch: http://localhost:9200"
	@echo "  Neptune (Fuseki): http://localhost:8182"

dev-up: ## Start Docker Compose services
	docker compose up -d --build

dev-down: ## Stop Docker Compose services
	docker compose down

dev-logs: ## Show logs from all services
	docker compose logs -f

dev-restart: ## Restart all services
	docker compose restart

backend-shell: ## Open shell in backend container
	docker compose exec backend bash

frontend-shell: ## Open shell in frontend container
	docker compose exec frontend sh

# ==============================================================================
# Build
# ==============================================================================

build: build-backend build-frontend ## Build all Docker images

build-backend: ## Build backend Docker image
	docker build -t onedata-agent-backend:latest ./backend

build-frontend: ## Build frontend Docker image
	docker build -t onedata-agent-frontend:latest ./frontend

build-infra: ## Compile CDK TypeScript
	cd infra && npm install && npm run build

# ==============================================================================
# Deploy (AWS CDK)
# ==============================================================================

deploy: infra-deploy push-images ## Deploy full stack to AWS

infra-synth: ## Synthesize CDK CloudFormation template
	cd infra && npx cdk synth

infra-deploy: ## Deploy CDK stack to AWS
	cd infra && npx cdk deploy --all --require-approval never

infra-destroy: ## Destroy CDK stack (CAUTION)
	cd infra && npx cdk destroy --all --force

infra-diff: ## Show CDK diff against deployed stack
	cd infra && npx cdk diff

push-images: ## Push Docker images to ECR
	@echo "Pushing images to ECR..."
	aws ecr get-login-password --region ap-northeast-2 | \
		docker login --username AWS --password-stdin $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-2.amazonaws.com
	docker tag onedata-agent-backend:latest \
		$$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-2.amazonaws.com/onedata-agent-backend:latest
	docker push $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-2.amazonaws.com/onedata-agent-backend:latest
	docker tag onedata-agent-frontend:latest \
		$$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-2.amazonaws.com/onedata-agent-frontend:latest
	docker push $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-2.amazonaws.com/onedata-agent-frontend:latest

# ==============================================================================
# Data / Ontology
# ==============================================================================

load-ontology: ## Load domain.ttl ontology into Neptune
	python scripts/load_ontology_to_neptune.py

load-ontology-local: ## Load ontology into local Fuseki (dev mode)
	curl -X POST http://localhost:8182/onedata/data \
		-H "Content-Type: text/turtle" \
		--data-binary @ontology/domain.ttl

index-opensearch: ## Index table metadata into OpenSearch
	python scripts/index_opensearch.py

index-opensearch-local: ## Index into local OpenSearch (no embeddings)
	python scripts/index_opensearch.py \
		--endpoint http://localhost:9200 \
		--skip-embeddings \
		--recreate

validate-ontology: ## Validate TTL ontology file syntax
	python scripts/load_ontology_to_neptune.py --dry-run

# ==============================================================================
# Testing
# ==============================================================================

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests
	cd backend && python -m pytest tests/ -v --tb=short

test-frontend: ## Run frontend tests
	cd frontend && npm test

sample-queries: ## Run sample Athena queries to verify data access
	python scripts/sample_queries.py

lint: lint-backend lint-frontend ## Run all linters

lint-backend: ## Lint backend Python code
	cd backend && python -m ruff check . && python -m mypy app/

lint-frontend: ## Lint frontend TypeScript code
	cd frontend && npm run lint

format: ## Format all code
	cd backend && python -m ruff format .
	cd frontend && npx prettier --write "**/*.{ts,tsx,json,css}"

# ==============================================================================
# Utility
# ==============================================================================

clean: ## Clean build artifacts and containers
	docker compose down -v --remove-orphans
	rm -rf infra/dist infra/cdk.out
	rm -rf frontend/.next frontend/node_modules
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

setup: ## Initial project setup (install dependencies)
	@echo "Setting up backend..."
	cd backend && pip install -e ".[dev]" 2>/dev/null || pip install -r requirements.txt
	@echo "Setting up frontend..."
	cd frontend && npm install
	@echo "Setting up infra..."
	cd infra && npm install
	@echo "Setup complete!"

check-env: ## Verify required environment variables
	@echo "Checking environment..."
	@test -n "$$AWS_REGION" || echo "WARNING: AWS_REGION not set (default: ap-northeast-2)"
	@test -n "$$NEPTUNE_ENDPOINT" || echo "WARNING: NEPTUNE_ENDPOINT not set"
	@test -n "$$OPENSEARCH_ENDPOINT" || echo "WARNING: OPENSEARCH_ENDPOINT not set"
	@echo "Environment check complete."
