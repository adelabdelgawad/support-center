# Docker Compose Pattern Reference

Complete docker-compose.yml patterns for multi-service applications.

## Service Definition Pattern

```yaml
services:
  # Service name (used for DNS within Docker network)
  service-name:
    # Image or build context
    image: image:tag
    # OR
    build:
      context: ./path/to/source
      dockerfile: ./path/to/Dockerfile
      args:
        - BUILD_ARG=value
    
    # Container identification
    container_name: project_service_name
    
    # Environment configuration
    environment:
      - KEY=value
      - KEY_FROM_ROOT=${ROOT_VAR}
    env_file:
      - docker/env/.env.service
    
    # Volume mounts
    volumes:
      - ~/workspace/docker/project/data:/app/data
      - ./config/file.conf:/etc/app/file.conf:ro
    
    # Port mapping (host:container)
    ports:
      - "127.0.0.1:8080:8080"  # Localhost only
      - "8080:8080"             # All interfaces
    
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    
    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    # Dependencies
    depends_on:
      database:
        condition: service_healthy
      cache:
        condition: service_healthy
    
    # Networking
    networks:
      - app_network
      - internal_network
    
    # Restart policy
    restart: unless-stopped
```

## Database Service Pattern

```yaml
postgres:
  image: postgres:15-alpine
  container_name: project_postgres
  env_file:
    - docker/env/.env.postgres
  volumes:
    - ~/workspace/docker/project/postgres:/var/lib/postgresql/data
  ports:
    - "${POSTGRES_PORT:-5433}:5432"
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-app}"]
    interval: 10s
    timeout: 5s
    retries: 5
  networks:
    - app_network
  restart: unless-stopped

# Connection pooler for horizontal scaling
pgbouncer:
  image: edoburu/pgbouncer:latest
  container_name: project_pgbouncer
  environment:
    - DATABASE_URL=postgres://${PGBOUNCER_DB_USER}:${PGBOUNCER_DB_PASSWORD}@postgres:5432/${PGBOUNCER_DB_NAME}
    - POOL_MODE=transaction
    - DEFAULT_POOL_SIZE=50
    - MAX_CLIENT_CONN=500
    - MAX_DB_CONNECTIONS=100
    - SERVER_RESET_QUERY=DISCARD ALL
    - IGNORE_STARTUP_PARAMETERS=extra_float_digits
  ports:
    - "127.0.0.1:${PGBOUNCER_PORT:-6432}:5432"
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 5432 -U ${PGBOUNCER_DB_USER}"]
    interval: 10s
    timeout: 5s
    retries: 5
  networks:
    - app_network
  restart: unless-stopped
```

## Redis Service Pattern

```yaml
redis:
  image: redis:7-alpine
  container_name: project_redis
  env_file:
    - docker/env/.env.redis
  command: >
    sh -c 'redis-server 
    --maxmemory 2gb 
    --maxmemory-policy allkeys-lru 
    --appendonly yes 
    --notify-keyspace-events Ex 
    --maxclients 10000 
    --timeout 0 
    --tcp-keepalive 300 
    --requirepass $$REDIS_PASSWORD'
  volumes:
    - ~/workspace/docker/project/redis:/data
  ports:
    - "127.0.0.1:${REDIS_PORT:-6380}:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
  networks:
    - app_network
  restart: unless-stopped
```

## Backend API Pattern (Multiple Instances)

```yaml
# Primary instance
backend-1:
  build:
    context: ./src/backend
    dockerfile: ../../docker/backend/Dockerfile
  container_name: project_backend_1
  environment:
    - INSTANCE_ID=backend-1
  env_file:
    - docker/env/.env.backend
  volumes:
    - ~/workspace/docker/project/backend/uploads:/app/uploads
    - ~/workspace/docker/project/backend/temp_uploads:/app/temp_uploads
  ports:
    - "${BACKEND_PORT_1:-8000}:8000"
  depends_on:
    postgres:
      condition: service_healthy
    pgbouncer:
      condition: service_healthy
    redis:
      condition: service_healthy
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
  networks:
    - app_network
    - minio_network
  restart: unless-stopped

# Additional instances (copy and change INSTANCE_ID and port)
backend-2:
  # Same as backend-1 with:
  environment:
    - INSTANCE_ID=backend-2
  ports:
    - "${BACKEND_PORT_2:-8001}:8000"
```

## Celery Worker Pattern

```yaml
celery_worker:
  build:
    context: ./src/backend
    dockerfile: ../../docker/backend/Dockerfile
  container_name: project_celery_worker
  command: celery -A celery_app worker --loglevel=info --concurrency=4 -Q celery,file_queue,ad_queue
  env_file:
    - docker/env/.env.backend
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  volumes:
    - ~/workspace/docker/project/backend/temp_uploads:/app/temp_uploads
  healthcheck:
    test: ["CMD-SHELL", "celery -A celery_app inspect ping -d celery@$$HOSTNAME || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
  networks:
    - app_network
    - minio_network
  restart: unless-stopped
```

## Frontend Service Pattern

```yaml
frontend:
  build:
    context: ./src/frontend
    dockerfile: ../../docker/frontend/Dockerfile
    args:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://backend-1:8000}
      - NEXT_PUBLIC_API_BASE_PATH=${NEXT_PUBLIC_API_BASE_PATH:-/api/v1}
  container_name: project_frontend
  env_file:
    - docker/env/.env.frontend
  ports:
    - "${FRONTEND_PORT:-3010}:3010"
  depends_on:
    backend-1:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "node", "-e", "require('http').get('http://localhost:3010/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 20s
  networks:
    - app_network
  restart: unless-stopped
```

## Nginx Reverse Proxy Pattern

```yaml
nginx:
  image: nginx:alpine
  container_name: project_nginx
  volumes:
    - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./docker/nginx/ssl:/etc/nginx/ssl:ro
    - ./docker/nginx/acme-challenge:/var/www/acme-challenge:ro
  ports:
    - "80:80"
    - "443:443"
  extra_hosts:
    - "host.docker.internal:host-gateway"
  networks:
    - app_network
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "sh", "-c", "nc -zv 127.0.0.1 443 || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 3
```

## Object Storage Pattern (Isolated)

```yaml
minio:
  image: minio/minio:latest
  container_name: project_minio
  command: server /data --console-address ":9001"
  env_file:
    - docker/env/.env.minio
  volumes:
    - ~/workspace/docker/project/minio:/data
  # No ports exposed - internal network only
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 5
  networks:
    - minio_network  # Isolated internal network
  restart: unless-stopped
```

## Monitoring Stack Pattern

```yaml
prometheus:
  image: prom/prometheus:v2.48.0
  container_name: project_prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.path=/prometheus'
    - '--storage.tsdb.retention.time=30d'
    - '--storage.tsdb.retention.size=10GB'
    - '--web.enable-lifecycle'
  volumes:
    - ./docker/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - ./docker/monitoring/prometheus/alerts:/etc/prometheus/alerts:ro
    - ~/workspace/docker/project/prometheus:/prometheus
  ports:
    - "127.0.0.1:${PROMETHEUS_PORT:-9090}:9090"
  networks:
    - app_network
  restart: unless-stopped

grafana:
  image: grafana/grafana:10.2.2
  container_name: project_grafana
  environment:
    - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-changeme}
    - GF_USERS_ALLOW_SIGN_UP=false
  volumes:
    - ./docker/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    - ~/workspace/docker/project/grafana:/var/lib/grafana
  ports:
    - "127.0.0.1:${GRAFANA_PORT:-3030}:3000"
  depends_on:
    - prometheus
  networks:
    - app_network
  restart: unless-stopped
```

## Networks Definition

```yaml
networks:
  # Main application network
  app_network:
    driver: bridge

  # Isolated internal network for sensitive services
  minio_network:
    driver: bridge
    internal: true  # No external connectivity
```

## Key Patterns Summary

1. **Health Checks** - Every service has a health check
2. **Dependency Conditions** - Use `condition: service_healthy`
3. **Resource Limits** - Always set CPU and memory limits
4. **Port Security** - Use `127.0.0.1:` prefix for localhost-only
5. **Volume Paths** - Use `~/workspace/docker/project/` pattern
6. **Network Isolation** - Use `internal: true` for sensitive services
7. **Environment Files** - Separate env files per service
8. **Variable Substitution** - Use `${VAR:-default}` pattern
