# Docker Infrastructure Examples

Real-world examples for Docker Compose configurations.

## Example 1: Full-Stack Application Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  # =============================================================================
  # DATABASE
  # =============================================================================
  postgres:
    image: postgres:16-alpine
    container_name: myapp_postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app_network
    restart: unless-stopped

  # =============================================================================
  # CACHE
  # =============================================================================
  redis:
    image: redis:7-alpine
    container_name: myapp_redis
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxclients 10000
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app_network
    restart: unless-stopped

  # =============================================================================
  # BACKEND
  # =============================================================================
  backend:
    build:
      context: ./src/backend
      dockerfile: ../../docker/backend/Dockerfile
    container_name: myapp_backend
    env_file:
      - docker/env/.env.backend
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
      - app_network
    restart: unless-stopped

  # =============================================================================
  # FRONTEND
  # =============================================================================
  frontend:
    build:
      context: ./src/frontend
      dockerfile: ../../docker/frontend/Dockerfile
    container_name: myapp_frontend
    env_file:
      - docker/env/.env.frontend
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - app_network
    restart: unless-stopped

  # =============================================================================
  # REVERSE PROXY
  # =============================================================================
  nginx:
    image: nginx:alpine
    container_name: myapp_nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
      - frontend
    networks:
      - app_network
    restart: unless-stopped

volumes:
  postgres_data:

networks:
  app_network:
    driver: bridge
```

## Example 2: Horizontal Scaling with Load Balancing

```yaml
# docker-compose.yml - Multiple backend instances
services:
  backend_1:
    build:
      context: ./src/backend
      dockerfile: ../../docker/backend/Dockerfile
    container_name: myapp_backend_1
    env_file:
      - docker/env/.env.backend
    environment:
      - INSTANCE_ID=backend_1
    networks:
      - app_network

  backend_2:
    build:
      context: ./src/backend
      dockerfile: ../../docker/backend/Dockerfile
    container_name: myapp_backend_2
    env_file:
      - docker/env/.env.backend
    environment:
      - INSTANCE_ID=backend_2
    networks:
      - app_network

  backend_3:
    build:
      context: ./src/backend
      dockerfile: ../../docker/backend/Dockerfile
    container_name: myapp_backend_3
    env_file:
      - docker/env/.env.backend
    environment:
      - INSTANCE_ID=backend_3
    networks:
      - app_network
```

```nginx
# nginx.conf - Load balancing
upstream backend_cluster {
    least_conn;
    server backend_1:8000 weight=1;
    server backend_2:8000 weight=1;
    server backend_3:8000 weight=1;
}

server {
    listen 80;
    
    location /api {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Example 3: Development vs Production

```yaml
# docker-compose.yml (base)
services:
  backend:
    build:
      context: ./src/backend
      dockerfile: ../../docker/backend/Dockerfile
    env_file:
      - docker/env/.env.backend

# docker-compose.dev.yml (development override)
services:
  backend:
    build:
      target: development
    volumes:
      - ./src/backend:/app
    environment:
      - DEBUG=true
      - RELOAD=true
    ports:
      - "8000:8000"  # Expose for debugging

# docker-compose.prod.yml (production override)
services:
  backend:
    build:
      target: production
    environment:
      - DEBUG=false
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

**Usage:**
```bash
# Development
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Example 4: Multi-Stage Dockerfile

```dockerfile
# docker/backend/Dockerfile
FROM python:3.13-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install UV package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Development stage
FROM base AS development
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache
COPY . .
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production stage
FROM base AS production
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache --no-dev
COPY . .
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app
USER appuser
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

## Example 5: Monitoring Stack

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: myapp_prometheus
    volumes:
      - ./docker/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
    networks:
      - app_network
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: myapp_grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./docker/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    depends_on:
      - prometheus
    networks:
      - app_network
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

```yaml
# docker/monitoring/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'backend'
    static_configs:
      - targets: ['backend_1:8000', 'backend_2:8000', 'backend_3:8000']
    metrics_path: /metrics
  
  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
```

## Example 6: Isolated Services (MinIO)

```yaml
services:
  minio:
    image: minio/minio:latest
    container_name: myapp_minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - minio_network  # Isolated network
    restart: unless-stopped

networks:
  minio_network:
    driver: bridge
    internal: true  # No external access
```

## Example 7: Environment Variable Management

```bash
# .env (root - shared secrets)
POSTGRES_USER=myapp
POSTGRES_PASSWORD=secure_password_123
POSTGRES_DB=myapp_db
REDIS_PASSWORD=redis_secure_456
JWT_SECRET_KEY=your_jwt_secret_key

# docker/env/.env.backend
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
SECRET_KEY=${JWT_SECRET_KEY}
DEBUG=false

# docker/env/.env.frontend
NEXT_PUBLIC_API_URL=http://localhost/api
NEXT_PUBLIC_SITE_URL=http://localhost
```

## Common Commands

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f backend

# Scale service
docker compose up -d --scale backend=3

# Execute command in container
docker compose exec backend bash

# Rebuild single service
docker compose up -d --build backend

# Stop and remove everything
docker compose down -v

# Check health status
docker compose ps
```
