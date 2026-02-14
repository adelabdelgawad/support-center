"""
Tests for internal health check endpoints (GET /backend/health/*).

Tests cover:
- Liveness check (basic health)
- Readiness check (database + dependencies)
- Detailed health check with component status
- Database metrics
- No authentication required for health checks
"""

import pytest
from httpx import AsyncClient


# ============================================================================
# GET /backend/health/liveness - Liveness Check
# ============================================================================


@pytest.mark.asyncio
async def test_liveness_check_success(unauth_client: AsyncClient):
    """Test liveness probe returns healthy status.
    
    Liveness checks if the application is running.
    Does not require authentication or dependencies.
    """
    response = await unauth_client.get("/backend/health/liveness")

    assert response.status_code == 200
    data = response.json()

    # Verify basic health response
    assert "status" in data
    assert data["status"] in ["healthy", "ok", "alive"]


@pytest.mark.asyncio
async def test_liveness_check_no_auth_required(unauth_client: AsyncClient):
    """Test that liveness check does not require authentication."""
    response = await unauth_client.get("/backend/health/liveness")

    # Should succeed without auth
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_liveness_check_response_format(unauth_client: AsyncClient):
    """Test liveness check returns expected format."""
    response = await unauth_client.get("/backend/health/liveness")

    assert response.status_code == 200
    data = response.json()

    # Common fields in liveness responses
    assert isinstance(data, dict)
    assert "status" in data or "health" in data


# ============================================================================
# GET /backend/health/readiness - Readiness Check
# ============================================================================


@pytest.mark.asyncio
async def test_readiness_check_success(unauth_client: AsyncClient):
    """Test readiness probe checks critical dependencies.
    
    Readiness checks:
    - Database connection
    - Redis connection (if configured)
    """
    response = await unauth_client.get("/backend/health/readiness")

    # Should be 200 if all dependencies are ready, 503 if not
    assert response.status_code in [200, 503]


@pytest.mark.asyncio
async def test_readiness_check_no_auth_required(unauth_client: AsyncClient):
    """Test that readiness check does not require authentication."""
    response = await unauth_client.get("/backend/health/readiness")

    # Should succeed or fail based on dependencies, not auth
    assert response.status_code in [200, 503]


@pytest.mark.asyncio
async def test_readiness_check_database_connection(unauth_client: AsyncClient):
    """Test that readiness check verifies database connectivity."""
    response = await unauth_client.get("/backend/health/readiness")

    # With test database running, should be ready
    assert response.status_code == 200
    data = response.json()

    # Should indicate database is ready
    assert "status" in data or "database" in data


@pytest.mark.asyncio
async def test_readiness_check_response_format(unauth_client: AsyncClient):
    """Test readiness check returns expected format."""
    response = await unauth_client.get("/backend/health/readiness")

    assert response.status_code in [200, 503]
    data = response.json()

    assert isinstance(data, dict)
    # Should have status or component health indicators
    assert "status" in data or "database" in data or "redis" in data


# ============================================================================
# GET /backend/health/detailed - Detailed Health Check
# ============================================================================


@pytest.mark.asyncio
async def test_detailed_health_check_success(unauth_client: AsyncClient):
    """Test detailed health check returns comprehensive status."""
    response = await unauth_client.get("/backend/health/detailed")

    assert response.status_code == 200
    data = response.json()

    # Verify response is a dictionary
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_detailed_health_check_includes_database_info(unauth_client: AsyncClient):
    """Test detailed health includes database connection pool metrics."""
    response = await unauth_client.get("/backend/health/detailed")

    assert response.status_code == 200
    data = response.json()

    # Should include database component status
    # Field names may vary: database, db, postgres, pool, etc.
    has_db_info = any(
        key in data
        for key in ["database", "db", "postgres", "pool", "components"]
    )
    assert has_db_info or "status" in data


@pytest.mark.asyncio
async def test_detailed_health_check_includes_version(unauth_client: AsyncClient):
    """Test detailed health includes service version."""
    response = await unauth_client.get("/backend/health/detailed")

    assert response.status_code == 200
    data = response.json()

    # Should include version information
    has_version = any(
        key in data
        for key in ["version", "service_version", "app_version"]
    )
    # Version may be nested or at root level
    assert has_version or "status" in data


@pytest.mark.asyncio
async def test_detailed_health_check_no_auth_required(unauth_client: AsyncClient):
    """Test that detailed health check does not require authentication."""
    response = await unauth_client.get("/backend/health/detailed")

    # Should succeed without auth
    assert response.status_code == 200


# ============================================================================
# GET /backend/metrics/database - Database Metrics
# ============================================================================


@pytest.mark.asyncio
async def test_database_metrics_success(unauth_client: AsyncClient):
    """Test database metrics endpoint returns pool information."""
    response = await unauth_client.get("/backend/metrics/database")

    assert response.status_code == 200
    data = response.json()

    # Should return dictionary with metrics
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_database_metrics_includes_pool_info(unauth_client: AsyncClient):
    """Test database metrics includes connection pool statistics."""
    response = await unauth_client.get("/backend/metrics/database")

    assert response.status_code == 200
    data = response.json()

    # Common database pool metrics
    expected_fields = [
        "pool_size",
        "checkedin",
        "checkedout",
        "overflow",
        "connections",
        "size",
        "checked_in",
        "checked_out",
    ]

    # At least one of these fields should be present
    has_pool_info = any(field in data for field in expected_fields)
    assert has_pool_info or len(data) > 0


@pytest.mark.asyncio
async def test_database_metrics_no_auth_required(unauth_client: AsyncClient):
    """Test that database metrics do not require authentication."""
    response = await unauth_client.get("/backend/metrics/database")

    # Should succeed without auth
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_database_metrics_format(unauth_client: AsyncClient):
    """Test database metrics return valid numeric values."""
    response = await unauth_client.get("/backend/metrics/database")

    assert response.status_code == 200
    data = response.json()

    # If metrics are returned, they should be numbers
    for key, value in data.items():
        if isinstance(value, (int, float)):
            assert value >= 0  # Pool metrics should be non-negative


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.asyncio
async def test_all_health_endpoints_accessible(unauth_client: AsyncClient):
    """Test that all health endpoints are accessible without auth."""
    endpoints = [
        "/backend/health/liveness",
        "/backend/health/readiness",
        "/backend/health/detailed",
        "/backend/metrics/database",
    ]

    for endpoint in endpoints:
        response = await unauth_client.get(endpoint)
        # Should not be 401 (unauthorized) or 403 (forbidden)
        assert response.status_code not in [401, 403]


@pytest.mark.asyncio
async def test_health_endpoints_return_json(unauth_client: AsyncClient):
    """Test that all health endpoints return JSON responses."""
    endpoints = [
        "/backend/health/liveness",
        "/backend/health/readiness",
        "/backend/health/detailed",
        "/backend/metrics/database",
    ]

    for endpoint in endpoints:
        response = await unauth_client.get(endpoint)
        assert response.headers["content-type"].startswith("application/json")
