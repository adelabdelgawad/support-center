---
name: generate-docker-service
description: Generate Docker service configuration for docker-compose. Use when user needs to add a new service to Docker infrastructure.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Docker Service Generation Agent

Generate Docker service configurations with proper health checks, networking, and resource limits.

## When This Agent Activates

- User requests: "Add [service] to Docker"
- User requests: "Create Docker service for [service]"
- User requests: "Add [service] to docker-compose"
- Command: `/generate docker-service [name]`

## Agent Lifecycle

### Phase 1: Detection

**Check for Docker setup:**

```bash
# Check for docker-compose
ls docker-compose.yml docker-compose.yaml 2>/dev/null

# Check for existing services
grep "services:" docker-compose.yml 2>/dev/null
grep -A 1 "services:" docker-compose.yml 2>/dev/null | tail -1

# Check for docker directory
ls -d docker/ 2>/dev/null
ls docker/*.Dockerfile docker/*/Dockerfile 2>/dev/null
```

**Decision Tree:**

```
IF no docker-compose found:
    → "No Docker Compose found. Would you like to set up Docker infrastructure?"
    → Suggest: /scaffold docker

IF docker-compose exists:
    → Proceed to dialogue
```

### Phase 2: Interactive Dialogue

```markdown
## Docker Service Configuration

I'll help you add a new service to your Docker setup.

### Service Type

**1. What type of service?**

- [ ] **Application** - Backend/Frontend/Worker
- [ ] **Database** - PostgreSQL, MySQL, MongoDB
- [ ] **Cache** - Redis, Memcached
- [ ] **Queue** - RabbitMQ, Kafka
- [ ] **Proxy** - Nginx, Traefik
- [ ] **Monitoring** - Prometheus, Grafana
- [ ] **Custom** - Other service

### Application Service

**If Application selected:**

**2. Application Type**
- [ ] FastAPI backend
- [ ] Next.js frontend
- [ ] Celery worker
- [ ] Celery beat
- [ ] Custom application

**3. Build Configuration**
- [ ] Build from Dockerfile
- [ ] Use pre-built image

**If Dockerfile:**
- Dockerfile path: `docker/{service}/Dockerfile` [default]
- Context path: `.` [default]

**If pre-built image:**
- Image name: ___________
- Image tag: `latest` [default]

### Database Service

**If Database selected:**

**2. Database Type**
- [ ] PostgreSQL
- [ ] MySQL
- [ ] MongoDB
- [ ] SQLite (not recommended for Docker)

**3. Configuration**
- Database name: ___________
- Username: ___________
- Password: (will use env variable)
- Port: (default for selected DB)

**4. Persistence**
- [ ] Named volume (recommended)
- [ ] Bind mount

### General Configuration

**5. Port Mapping**
- Internal port: ___
- External port: ___ (or leave empty for internal only)

**6. Environment Variables**
What environment variables does this service need?

Format: `VAR_NAME=value` or `VAR_NAME=${ENV_VAR}`

**7. Dependencies**
Which services does this depend on?

Existing services in your docker-compose:
{list_existing_services}

**8. Resource Limits**
- [ ] No limits (development)
- [ ] Standard limits (1 CPU, 512MB RAM)
- [ ] Custom: CPU=___ Memory=___

**9. Health Check**
- [ ] Auto-detect (based on service type)
- [ ] HTTP endpoint: ___________
- [ ] TCP port check
- [ ] Command: ___________
- [ ] None
```

### Phase 3: Generation Plan

```markdown
## Generation Plan

Service: **{service_name}**

### Changes to docker-compose.yml

```yaml
services:
  {service_name}:
    build:
      context: .
      dockerfile: docker/{service}/Dockerfile
    container_name: {project}_{service_name}
    restart: unless-stopped
    ports:
      - "{external_port}:{internal_port}"
    environment:
      - ENV_VAR=${ENV_VAR}
    depends_on:
      {dependency}:
        condition: service_healthy
    healthcheck:
      test: {health_check}
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
    networks:
      - {network}
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docker-compose.yml` | Modify | Add service definition |
| `docker/{service}/Dockerfile` | Create | Dockerfile for service |
| `docker/env/{service}.env` | Create | Environment file |

**Confirm?** Reply "yes" to generate.
```

### Phase 4: Code Generation

**Read skill references:**

1. Read `skills/docker/references/docker-compose-pattern.md`
2. Read `skills/docker/references/dockerfile-pattern.md`
3. Read `skills/docker/references/env-pattern.md`

**Generate with patterns:**

- Proper service ordering
- Health checks for dependencies
- Resource limits
- Network configuration
- Volume management

### Phase 5: Next Steps

```markdown
## Generation Complete

Docker service **{service_name}** has been added.

### Files Modified/Created

- [x] `docker-compose.yml` - Service added
- [x] `docker/{service}/Dockerfile` - Created
- [x] `docker/env/{service}.env` - Created

### Test the Service

```bash
# Build the service
docker compose build {service_name}

# Start the service
docker compose up -d {service_name}

# Check logs
docker compose logs -f {service_name}

# Check health
docker compose ps
```

### Service Information

| Property | Value |
|----------|-------|
| Container | {project}_{service_name} |
| Port | {external_port}:{internal_port} |
| Health | {health_endpoint} |
| Network | {network} |

### Related Actions

- [ ] **Add monitoring** for this service (Prometheus)?
- [ ] **Configure Nginx** to proxy this service?
- [ ] **Add replicas** for load balancing?
```

## Common Service Templates

### FastAPI Backend Service

```yaml
backend:
  build:
    context: .
    dockerfile: docker/backend/Dockerfile
  container_name: ${PROJECT_NAME}_backend
  restart: unless-stopped
  ports:
    - "8000:8000"
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
    - SECRET_KEY=${SECRET_KEY}
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
```

### Celery Worker Service

```yaml
celery-worker:
  build:
    context: .
    dockerfile: docker/backend/Dockerfile
  command: celery -A celery_app worker --loglevel=info
  container_name: ${PROJECT_NAME}_celery_worker
  restart: unless-stopped
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
  depends_on:
    - backend
    - redis
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M
```

### PostgreSQL Service

```yaml
postgres:
  image: postgres:16-alpine
  container_name: ${PROJECT_NAME}_postgres
  restart: unless-stopped
  environment:
    - POSTGRES_USER=${POSTGRES_USER}
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    - POSTGRES_DB=${POSTGRES_DB}
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### Redis Service

```yaml
redis:
  image: redis:7-alpine
  container_name: ${PROJECT_NAME}_redis
  restart: unless-stopped
  command: redis-server --appendonly yes
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```
