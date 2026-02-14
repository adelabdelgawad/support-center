# Environment Variables Pattern Reference

Managing environment variables across Docker services with a single source of truth.

## Architecture

```
Root .env (Single Source of Truth)
├── POSTGRES_DB             → Used by: postgres, backend
├── POSTGRES_USER           → Used by: postgres, backend
├── POSTGRES_PASSWORD       → Used by: postgres, backend
├── REDIS_PASSWORD          → Used by: backend, redis, celery
├── JWT_SECRET_KEY          → Used by: backend, frontend, signalr
├── SESSION_SECRET          → Used by: backend, frontend
└── SIGNALR_INTERNAL_API_KEY → Used by: backend, signalr

Service-Specific .env Files (docker/env/)
├── .env.backend            → Backend service variables
├── .env.frontend           → Frontend service variables
├── .env.postgres           → PostgreSQL variables
├── .env.redis              → Redis cache variables
├── .env.minio              → MinIO object storage
└── .env.coturn             → TURN server variables
```

## Root .env Template

```bash
# =============================================================================
# ROOT .env - Single Source of Truth for Shared Secrets
# =============================================================================
# Copy to .env and update with secure values
# Generate secrets: openssl rand -hex 32

# Database
POSTGRES_DB=appdb
POSTGRES_USER=appuser
POSTGRES_PASSWORD=CHANGE_ME_SECURE_PASSWORD

# Redis
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# JWT & Sessions
JWT_SECRET_KEY=CHANGE_ME_JWT_SECRET_KEY_32_CHARS_MIN
SESSION_SECRET=CHANGE_ME_SESSION_SECRET_32_CHARS_MIN

# Internal API Keys
SIGNALR_INTERNAL_API_KEY=CHANGE_ME_SIGNALR_API_KEY

# TURN Server (WebRTC)
TURN_SECRET=CHANGE_ME_TURN_SECRET

# Optional Port Overrides
POSTGRES_PORT=5433
REDIS_PORT=6380
BACKEND_PORT_1=8000
BACKEND_PORT_2=8001
BACKEND_PORT_3=8002
FRONTEND_PORT=3010
```

## Backend .env Template

```bash
# =============================================================================
# Backend Application Configuration
# =============================================================================
# NOTE: Variables with ${VAR} are substituted from root .env

# DATABASE
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10
DATABASE_POOL_TIMEOUT=30
DATABASE_POOL_RECYCLE=3600

# REDIS
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
REDIS_MAX_CONNECTIONS=50

# SECURITY
SECURITY_SECRET_KEY=${SESSION_SECRET}
JWT_SECRET_KEY=${JWT_SECRET_KEY}
ALGORITHM=HS256
JWT_ISSUER=my-app
JWT_AUDIENCE=my-app-users
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# APPLICATION
API_APP_NAME=My Application
API_APP_VERSION=1.0.0
API_DEBUG=false
API_API_V1_PREFIX=/api/v1

# CORS
CORS_ORIGINS=["http://localhost:3010","https://myapp.com"]

# FILE UPLOAD
UPLOAD_MAX_UPLOAD_SIZE=52428800
UPLOAD_UPLOAD_DIR=./uploads
UPLOAD_ALLOWED_EXTENSIONS=jpg,jpeg,png,gif,pdf,doc,docx

# EMAIL
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=noreply@example.com
EMAIL_SMTP_PASSWORD=CHANGE_ME
EMAIL_SMTP_FROM=noreply@example.com
EMAIL_SMTP_TLS=true

# SIGNALR
SIGNALR_INTERNAL_URL=http://signalr-service:5000
SIGNALR_INTERNAL_API_KEY=${SIGNALR_INTERNAL_API_KEY}
SIGNALR_ENABLED=true

# MINIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=CHANGE_ME
MINIO_SECRET_KEY=CHANGE_ME
MINIO_BUCKET_NAME=app-files
MINIO_SECURE=false

# CELERY
CELERY_BROKER_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD}@redis:6379/1

# LOGGING
LOG_LEVEL=INFO
LOG_ENABLE_FILE_LOGGING=true
LOG_LOG_DIR=logs

# MONITORING
MONITORING_ENABLE_METRICS=true
```

## PostgreSQL .env Template

```bash
# =============================================================================
# PostgreSQL Configuration
# =============================================================================
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

## Redis .env Template

```bash
# =============================================================================
# Redis Configuration
# =============================================================================
REDIS_PASSWORD=${REDIS_PASSWORD}
```

## Frontend .env Template

```bash
# =============================================================================
# Frontend Configuration (Next.js)
# =============================================================================
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_PATH=/api/v1
NEXT_PUBLIC_SIGNALR_URL=http://localhost:5000/hubs

# Server-side only
JWT_SECRET_KEY=${JWT_SECRET_KEY}
SESSION_SECRET=${SESSION_SECRET}
```

## MinIO .env Template

```bash
# =============================================================================
# MinIO Object Storage Configuration
# =============================================================================
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=CHANGE_ME_MINIO_PASSWORD
```

## How Variable Substitution Works

### In docker-compose.yml

```yaml
services:
  postgres:
    env_file:
      - docker/env/.env.postgres
    environment:
      # Direct from root .env
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

### In Service .env Files

```bash
# docker/env/.env.backend
# ${VAR} references are substituted by Docker Compose
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

### Resolution Flow

1. Docker Compose reads root `.env`
2. Service `.env` files are processed
3. `${VAR}` references are substituted with root `.env` values
4. Final environment is passed to container

## Verification Commands

```bash
# Check root .env has all shared variables
cat .env | grep -E "^[A-Z_]+="

# Check service env files use ${VAR} references
grep -r "\${.*}" docker/env/.env.*

# Test variable substitution
docker compose config | grep -A5 "backend"

# Verify specific variable
docker compose config | grep DATABASE_URL
```

## Security Best Practices

### Do's
- ✅ Store secrets in root `.env` only
- ✅ Use `${VAR}` references in service `.env` files
- ✅ Add `.env` files to `.gitignore`
- ✅ Commit `.env.example` files as templates
- ✅ Use strong, unique passwords (32+ chars)
- ✅ Rotate secrets periodically

### Don'ts
- ❌ Never commit actual `.env` files
- ❌ Don't duplicate secrets across files
- ❌ Don't hardcode secrets in docker-compose.yml
- ❌ Don't expose sensitive ports publicly
- ❌ Don't use default passwords in production

## .gitignore Pattern

```gitignore
# Environment files with real secrets
docker/env/.env.backend
docker/env/.env.frontend
docker/env/.env.postgres
docker/env/.env.redis
docker/env/.env.minio
docker/env/.env.coturn
.env

# Keep example files
!docker/env/.env.example.*
!.env.example
```

## Shared Variables Reference

| Variable | Services | Purpose |
|----------|----------|---------|
| `POSTGRES_DB` | postgres, backend | Database name |
| `POSTGRES_USER` | postgres, backend | Database user |
| `POSTGRES_PASSWORD` | postgres, backend | Database password |
| `REDIS_PASSWORD` | redis, backend, celery | Redis auth |
| `JWT_SECRET_KEY` | backend, frontend, signalr | JWT signing |
| `SESSION_SECRET` | backend, frontend | Session encryption |
| `SIGNALR_INTERNAL_API_KEY` | backend, signalr | Internal API auth |
| `TURN_SECRET` | backend, coturn | WebRTC auth |
