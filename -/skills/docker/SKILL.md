# Docker Infrastructure Skill

Production-ready Docker infrastructure for full-stack applications with FastAPI backend, Next.js frontend, and supporting services.

## When to Use This Skill

Use this skill when asked to:
- Set up Docker infrastructure for a project
- Configure multi-service Docker Compose environments
- Add new services to existing Docker infrastructure
- Configure nginx reverse proxy, monitoring, or SSL

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (80/443)                        │
│              Reverse Proxy + SSL Termination                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Frontend    │ │  Backend API  │ │   SignalR     │
│  (Next.js)    │ │  (FastAPI)    │ │  (Real-time)  │
│    :3010      │ │  :8000-8002   │ │    :5000      │
└───────────────┘ └───────┬───────┘ └───────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   PostgreSQL  │ │     Redis     │ │     MinIO     │
│    + PgBouncer│ │   (Cache/PubSub)│ │  (Object Store)│
│   :5432/:6432 │ │    :6379      │ │    :9000      │
└───────────────┘ └───────────────┘ └───────────────┘
                          │
                          ▼
                ┌───────────────────┐
                │   Celery Worker   │
                │ (Background Tasks)│
                └───────────────────┘
                          │
                          ▼
        ┌─────────────────┴─────────────────┐
        │                                   │
        ▼                                   ▼
┌───────────────┐                 ┌───────────────┐
│  Prometheus   │                 │    Grafana    │
│   :9090       │─────────────────│    :3030      │
└───────────────┘                 └───────────────┘
```

## Directory Structure

```
docker/
├── docker-compose.yml          # Main compose file
├── backend/
│   ├── Dockerfile              # FastAPI multi-stage build
│   └── .dockerignore
├── frontend/
│   ├── Dockerfile              # Next.js build
│   └── .dockerignore
├── env/
│   ├── .env.example.backend    # Backend env template
│   ├── .env.example.frontend   # Frontend env template
│   ├── .env.example.postgres   # Database env template
│   ├── .env.example.redis      # Cache env template
│   ├── .env.example.minio      # Object storage env template
│   ├── .env.example.coturn     # TURN server env template
│   └── ENVIRONMENT_STRUCTURE.md
├── nginx/
│   ├── nginx.conf              # Reverse proxy config
│   ├── ssl/                    # SSL certificates
│   └── acme-challenge/         # Let's Encrypt
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   ├── alerts/
│   │   └── rules/
│   └── grafana/
│       └── provisioning/
├── coturn/
│   └── turnserver.conf         # WebRTC TURN config
└── signalr-service/
    ├── Dockerfile
    └── .dockerignore
```

## Core Services

### 1. PostgreSQL + PgBouncer

```yaml
# Database with connection pooling
postgres:
  image: postgres:15-alpine
  env_file:
    - docker/env/.env.postgres
  volumes:
    - ~/workspace/docker/project/postgres:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
    interval: 10s
    timeout: 5s
    retries: 5

pgbouncer:
  image: edoburu/pgbouncer:latest
  environment:
    - DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
    - POOL_MODE=transaction
    - DEFAULT_POOL_SIZE=50
    - MAX_CLIENT_CONN=500
  depends_on:
    postgres:
      condition: service_healthy
```

### 2. Redis

```yaml
redis:
  image: redis:7-alpine
  command: >
    sh -c 'redis-server 
    --maxmemory 2gb 
    --maxmemory-policy allkeys-lru 
    --appendonly yes 
    --notify-keyspace-events Ex 
    --maxclients 10000 
    --requirepass $$REDIS_PASSWORD'
  healthcheck:
    test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
```

### 3. FastAPI Backend (Scaled)

```yaml
backend-1:
  build:
    context: ./src/backend
    dockerfile: ../../docker/backend/Dockerfile
  environment:
    - INSTANCE_ID=backend-1
  env_file:
    - docker/env/.env.backend
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

### 4. Celery Worker

```yaml
celery_worker:
  build:
    context: ./src/backend
    dockerfile: ../../docker/backend/Dockerfile
  command: celery -A celery_app worker --loglevel=info --concurrency=4 -Q celery,file_queue
  env_file:
    - docker/env/.env.backend
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

### 5. Nginx Reverse Proxy

```yaml
nginx:
  image: nginx:alpine
  volumes:
    - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./docker/nginx/ssl:/etc/nginx/ssl:ro
  ports:
    - "80:80"
    - "443:443"
```

## Environment Variable Strategy

### Single Source of Truth Pattern

```
Root .env (shared secrets)
├── POSTGRES_PASSWORD     → Used by: postgres, backend
├── REDIS_PASSWORD        → Used by: redis, backend, celery
├── JWT_SECRET_KEY        → Used by: backend, frontend, signalr
└── SESSION_SECRET        → Used by: backend, frontend

Service .env files reference shared vars:
# docker/env/.env.backend
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
```

## Network Architecture

```yaml
networks:
  # Main application network
  app_network:
    driver: bridge

  # Isolated network for object storage (security)
  minio_network:
    driver: bridge
    internal: true  # No external connectivity
```

## Dockerfile Patterns

### Multi-Stage Python Build

```dockerfile
# Stage 1: Builder
FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
RUN apt-get update && apt-get install -y gcc g++ libpq-dev
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Stage 2: Runtime
FROM python:3.13-slim
ENV PATH="/app/.venv/bin:$PATH"
RUN apt-get update && apt-get install -y libpq5 curl
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
    CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Key Patterns

1. **Health Checks** - Every service has health checks for orchestration
2. **Resource Limits** - CPU and memory limits prevent runaway containers
3. **Dependency Conditions** - `depends_on` with `condition: service_healthy`
4. **Volume Persistence** - Data volumes for databases, uploads, logs
5. **Internal Networks** - Isolated networks for sensitive services
6. **Environment Substitution** - `${VAR}` references in env files

## References

See the `references/` directory for:
- `docker-compose-pattern.md` - Full compose file patterns
- `dockerfile-pattern.md` - Multi-stage build patterns
- `nginx-pattern.md` - Reverse proxy configuration
- `env-pattern.md` - Environment variable management
- `monitoring-pattern.md` - Prometheus/Grafana setup
