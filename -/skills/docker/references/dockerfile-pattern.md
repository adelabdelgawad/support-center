# Dockerfile Pattern Reference

Multi-stage build patterns for production-ready containers.

## FastAPI Backend (Python + UV)

```dockerfile
# ==============================================================================
# Production-Ready Dockerfile for FastAPI Backend
# Base: Python 3.13 Debian Slim with UV Package Manager
# ==============================================================================

# ==============================================================================
# STAGE 1: Builder - Install dependencies using uv
# ==============================================================================
FROM python:3.13-slim AS builder

# Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Install build dependencies for compilation
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Enable bytecode compilation for faster startup
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Copy dependency files first (for better caching)
COPY pyproject.toml uv.lock ./

# Install dependencies using uv with cache
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Copy application source code
COPY . .

# Install the project
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ==============================================================================
# STAGE 2: Runtime - Minimal production image
# ==============================================================================
FROM python:3.13-slim

# Production environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/app/.venv/bin:$PATH"

# Install ONLY runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY --from=builder /app /app

# Create necessary directories
RUN mkdir -p /app/uploads /app/temp_uploads /app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Start command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Next.js Frontend

```dockerfile
# ==============================================================================
# Production-Ready Dockerfile for Next.js Frontend
# ==============================================================================

# ==============================================================================
# STAGE 1: Dependencies
# ==============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# ==============================================================================
# STAGE 2: Builder
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Build arguments for environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_BASE_PATH
ARG NEXT_PUBLIC_SIGNALR_URL

# Set environment variables for build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_BASE_PATH=$NEXT_PUBLIC_API_BASE_PATH
ENV NEXT_PUBLIC_SIGNALR_URL=$NEXT_PUBLIC_SIGNALR_URL

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build application
RUN npm run build

# ==============================================================================
# STAGE 3: Runner
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Production environment
ENV NODE_ENV=production
ENV PORT=3010

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3010/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3010

# Start command
CMD ["node", "server.js"]
```

## .NET SignalR Service

```dockerfile
# ==============================================================================
# Production-Ready Dockerfile for .NET SignalR Service
# ==============================================================================

# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project files
COPY ["SignalRService.csproj", "./"]
RUN dotnet restore

# Copy source and build
COPY . .
RUN dotnet publish -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

# Copy published app
COPY --from=build /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Expose port
EXPOSE 5000

# Start command
ENTRYPOINT ["dotnet", "SignalRService.dll"]
```

## .dockerignore Pattern

```dockerignore
# Git
.git
.gitignore

# IDE
.idea
.vscode
*.swp

# Python
__pycache__
*.pyc
*.pyo
.pytest_cache
.mypy_cache
.coverage
htmlcov
.tox
.venv
venv
env

# Node
node_modules
.next
.nuxt
dist
build

# Docker
Dockerfile*
docker-compose*
.dockerignore

# Tests
tests
test
*_test.py
test_*.py

# Documentation
docs
*.md
!README.md

# Logs and databases
*.log
*.sqlite
*.db

# Environment
.env*
!.env.example

# OS
.DS_Store
Thumbs.db
```

## Key Patterns

### Multi-Stage Build Benefits
- **Smaller images** - Only runtime dependencies in final image
- **Build cache** - Dependencies cached separately from source
- **Security** - No build tools in production image

### Cache Optimization
```dockerfile
# Copy dependency files FIRST
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# THEN copy source code
COPY . .
RUN uv sync --frozen
```

### Health Checks
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

### Non-Root User (Security)
```dockerfile
RUN addgroup --system --gid 1001 appgroup
RUN adduser --system --uid 1001 appuser
USER appuser
```

### Environment Variables
```dockerfile
# Build-time args (for NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Runtime env
ENV NODE_ENV=production
```
