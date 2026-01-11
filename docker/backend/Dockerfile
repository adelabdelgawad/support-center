# ==============================================================================
# Production-Ready Dockerfile for FastAPI Backend
# Base: Python 3.13 Debian Slim with UV Package Manager
# ==============================================================================

# ==============================================================================
# STAGE 1: Builder - Install dependencies using uv
# ==============================================================================
FROM python:3.13-slim AS builder

# Install uv
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

# Install dependencies using uv
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

# Install ONLY runtime dependencies
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

# Start command: Initialize DB, stamp alembic, then start server
CMD python init_db.py && alembic stamp head && uvicorn main:app --host 0.0.0.0 --port 8000
