---
name: scaffold-docker-infrastructure
description: Scaffold Docker infrastructure with docker-compose, Dockerfiles, and production configuration.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Docker Infrastructure Scaffold Agent

Create production-ready Docker infrastructure including docker-compose, Dockerfiles, and service configurations.

## When This Agent Activates

- User requests: "Add Docker to project"
- User requests: "Scaffold Docker infrastructure"
- User requests: "Create docker-compose"
- Command: `/scaffold docker`

## Infrastructure Configuration Dialogue

```markdown
## Docker Infrastructure Configuration

I'll create production-ready Docker infrastructure for your project.

### Project Detection

Detected projects:
- [ ] FastAPI backend at `./`
- [ ] Next.js frontend at `./frontend`
- [ ] Celery workers at `./`

### Services

**1. Application Services**
Which application services to containerize?
- [ ] FastAPI backend
- [ ] Next.js frontend
- [ ] Celery worker
- [ ] Celery beat (scheduler)

**2. Database**
- [ ] PostgreSQL (recommended)
- [ ] MySQL
- [ ] MongoDB
- [ ] None (external database)

**3. Cache/Message Broker**
- [ ] Redis (recommended)
- [ ] RabbitMQ
- [ ] None

**4. Reverse Proxy**
- [ ] Nginx (recommended)
- [ ] Traefik
- [ ] None

**5. Monitoring**
- [ ] Prometheus + Grafana
- [ ] None

### Environment

**6. Configuration**
- [ ] Development (hot reload, debug)
- [ ] Production (optimized builds)
- [ ] Both (separate compose files)

### Scaling

**7. Replicas**
- Backend replicas: ___ (default: 1)
- Worker replicas: ___ (default: 1)
```

## Generated Structure

```
docker/
├── backend/
│   └── Dockerfile              # FastAPI Dockerfile
├── frontend/
│   └── Dockerfile              # Next.js Dockerfile
├── nginx/
│   ├── nginx.conf              # Nginx configuration
│   └── Dockerfile              # Nginx Dockerfile
├── env/
│   ├── backend.env             # Backend environment
│   ├── frontend.env            # Frontend environment
│   ├── postgres.env            # Database environment
│   └── redis.env               # Redis environment
└── scripts/
    ├── wait-for-it.sh          # Service wait script
    └── backup.sh               # Database backup script

docker-compose.yml              # Main compose file
docker-compose.dev.yml          # Development overrides
docker-compose.prod.yml         # Production overrides
.dockerignore                   # Docker ignore rules
```

## Generated Files

### docker-compose.yml

```yaml
version: "3.8"

services:
  # Database
  postgres:
    image: postgres:16-alpine
    container_name: ${PROJECT_NAME:-app}_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      POSTGRES_DB: ${POSTGRES_DB:-app}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-app}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # Redis
  redis:
    image: redis:7-alpine
    container_name: ${PROJECT_NAME:-app}_redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # FastAPI Backend
  backend:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: ${PROJECT_NAME:-app}_backend
    restart: unless-stopped
    env_file:
      - docker/env/backend.env
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-app}:${POSTGRES_PASSWORD:-secret}@postgres:5432/${POSTGRES_DB:-app}
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - backend
      - frontend

  # Celery Worker
  celery-worker:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    command: celery -A celery_app worker --loglevel=info
    container_name: ${PROJECT_NAME:-app}_celery_worker
    restart: unless-stopped
    env_file:
      - docker/env/backend.env
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-app}:${POSTGRES_PASSWORD:-secret}@postgres:5432/${POSTGRES_DB:-app}
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - backend
      - redis
    networks:
      - backend

  # Next.js Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/frontend/Dockerfile
    container_name: ${PROJECT_NAME:-app}_frontend
    restart: unless-stopped
    env_file:
      - docker/env/frontend.env
    environment:
      - NEXT_PUBLIC_API_URL=http://nginx/api
    depends_on:
      - backend
    networks:
      - frontend

  # Nginx Reverse Proxy
  nginx:
    build:
      context: ./docker/nginx
      dockerfile: Dockerfile
    container_name: ${PROJECT_NAME:-app}_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
      - frontend
    networks:
      - frontend

volumes:
  postgres_data:
  redis_data:

networks:
  backend:
    driver: bridge
  frontend:
    driver: bridge
```

### docker/backend/Dockerfile

```dockerfile
# Build stage
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels and install
COPY --from=builder /app/wheels /wheels
RUN pip install --no-cache /wheels/*

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### docker/frontend/Dockerfile

```dockerfile
# Dependencies stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

### docker/nginx/nginx.conf

```nginx
upstream backend {
    server backend:8000;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name localhost;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health checks
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

## Post-Scaffold Instructions

```markdown
## Docker Infrastructure Created!

### Files Created

{list of all created files}

### Quick Start

1. **Build all services:**
   ```bash
   docker compose build
   ```

2. **Start all services:**
   ```bash
   docker compose up -d
   ```

3. **Check status:**
   ```bash
   docker compose ps
   ```

4. **View logs:**
   ```bash
   docker compose logs -f
   ```

### Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost/api |
| API Docs | http://localhost/api/docs |

### Common Commands

```bash
# Stop all services
docker compose down

# Rebuild specific service
docker compose build backend

# Scale workers
docker compose up -d --scale celery-worker=3

# Database backup
docker compose exec postgres pg_dump -U app app > backup.sql

# View specific logs
docker compose logs -f backend
```

### Next Steps

- [ ] Configure SSL certificates
- [ ] Set up monitoring
- [ ] Configure CI/CD deployment
```
