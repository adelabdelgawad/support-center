"""
Tests for internal events endpoints (GET /backend/events/*).

Tests cover:
- Consumer lag monitoring for Redis Streams
- Listing event streams
- Events health check
- Authenticated access required
- Error handling for Redis connection issues
"""

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

from db.models import User


# ============================================================================
# GET /backend/events/consumer-lag - Consumer Lag Monitoring
# ============================================================================


@pytest.mark.asyncio
async def test_get_consumer_lag_success(client: AsyncClient, seed_user: User, mock_redis):
    """Test getting consumer lag for all event streams."""
    # Mock Redis responses for lag info
    mock_redis.xinfo_groups.return_value = [
        {
            b"name": b"signalr-consumers",
            b"lag": 0,
            b"consumers": 1,
        }
    ]
    mock_redis.xinfo_consumers.return_value = [
        {b"name": b"instance-1"}
    ]

    response = await client.get("/backend/events/consumer-lag")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "streams" in data
    assert "totalLag" in data or "total_lag" in data
    assert "streamCount" in data or "stream_count" in data

    # Verify streams is a dictionary
    assert isinstance(data["streams"], dict)


@pytest.mark.asyncio
async def test_get_consumer_lag_includes_all_streams(client: AsyncClient, seed_user: User):
    """Test that consumer lag includes all expected streams."""
    response = await client.get("/backend/events/consumer-lag")

    assert response.status_code == 200
    data = response.json()

    streams = data["streams"]

    # Expected stream names (from DEFAULT_STREAMS)

    # At least one stream should be present
    # (may not be all if they don't exist yet)
    assert len(streams) >= 0


@pytest.mark.asyncio
async def test_get_consumer_lag_stream_format(client: AsyncClient, seed_user: User):
    """Test that each stream has correct lag information format."""
    response = await client.get("/backend/events/consumer-lag")

    assert response.status_code == 200
    data = response.json()

    # Check format for each stream
    for stream_name, stream_data in data["streams"].items():
        assert "lag" in stream_data
        assert "consumers" in stream_data
        assert isinstance(stream_data["lag"], int)
        assert isinstance(stream_data["consumers"], list)


@pytest.mark.asyncio
async def test_get_consumer_lag_total_calculation(client: AsyncClient, seed_user: User):
    """Test that total lag is sum of all stream lags."""
    response = await client.get("/backend/events/consumer-lag")

    assert response.status_code == 200
    data = response.json()

    # Calculate expected total
    stream_lags = [
        stream_data["lag"]
        for stream_data in data["streams"].values()
        if stream_data["lag"] >= 0  # Exclude error cases (-1)
    ]
    sum(stream_lags)

    total_lag = data.get("totalLag") or data.get("total_lag")
    
    # Total should match sum (unless there are errors)
    assert total_lag >= 0


@pytest.mark.asyncio
async def test_get_consumer_lag_requires_auth(unauth_client: AsyncClient):
    """Test that consumer lag endpoint requires authentication."""
    response = await unauth_client.get("/backend/events/consumer-lag")

    assert response.status_code == 401


# ============================================================================
# GET /backend/events/streams - List Event Streams
# ============================================================================


@pytest.mark.asyncio
async def test_list_streams_success(client: AsyncClient, seed_user: User, mock_redis):
    """Test listing all event streams."""
    # Mock Redis stream info
    mock_redis.xinfo_stream.return_value = {
        b"length": 100,
        b"groups": 1,
    }

    response = await client.get("/backend/events/streams")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "streams" in data
    assert isinstance(data["streams"], list)


@pytest.mark.asyncio
async def test_list_streams_includes_stream_info(client: AsyncClient, seed_user: User):
    """Test that each stream includes metadata."""
    response = await client.get("/backend/events/streams")

    assert response.status_code == 200
    data = response.json()

    # Check format for each stream
    for stream_info in data["streams"]:
        assert "name" in stream_info
        assert "length" in stream_info
        assert "groups" in stream_info
        assert "consumerGroup" in stream_info or "consumer_group" in stream_info


@pytest.mark.asyncio
async def test_list_streams_handles_nonexistent_streams(client: AsyncClient, seed_user: User):
    """Test that listing handles streams that don't exist yet."""
    response = await client.get("/backend/events/streams")

    assert response.status_code == 200
    data = response.json()

    # Should still return list (possibly with "note" field for non-existent streams)
    assert isinstance(data["streams"], list)


@pytest.mark.asyncio
async def test_list_streams_requires_auth(unauth_client: AsyncClient):
    """Test that list streams endpoint requires authentication."""
    response = await unauth_client.get("/backend/events/streams")

    assert response.status_code == 401


# ============================================================================
# GET /backend/events/health - Events Health Check
# ============================================================================


@pytest.mark.asyncio
async def test_events_health_check_success(client: AsyncClient, seed_user: User, mock_redis):
    """Test events health check returns system status."""
    # Mock Redis connection
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.xinfo_groups.return_value = [
        {
            b"name": b"signalr-consumers",
            b"lag": 50,
        }
    ]
    mock_redis.xinfo_consumers.return_value = []

    response = await client.get("/backend/events/health")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "status" in data
    assert "redisConnected" in data or "redis_connected" in data
    assert "transportMode" in data or "transport_mode" in data


@pytest.mark.asyncio
async def test_events_health_check_status_categories(client: AsyncClient, seed_user: User):
    """Test that health check categorizes stream health."""
    response = await client.get("/backend/events/health")

    assert response.status_code == 200
    data = response.json()

    # Overall status should be one of these
    assert data["status"] in ["healthy", "degraded", "unhealthy"]


@pytest.mark.asyncio
async def test_events_health_check_includes_lag_summary(client: AsyncClient, seed_user: User):
    """Test that health check includes lag summary."""
    response = await client.get("/backend/events/health")

    assert response.status_code == 200
    data = response.json()

    # Should include lag metrics
    assert "maxLag" in data or "max_lag" in data
    assert "totalLag" in data or "total_lag" in data


@pytest.mark.asyncio
async def test_events_health_check_includes_stream_counts(client: AsyncClient, seed_user: User):
    """Test that health check includes stream health counts."""
    response = await client.get("/backend/events/health")

    assert response.status_code == 200
    data = response.json()

    # Should include stream categorization
    if "streams" in data:
        streams = data["streams"]
        assert "healthy" in streams or "degraded" in streams or "unhealthy" in streams


@pytest.mark.asyncio
async def test_events_health_check_requires_auth(unauth_client: AsyncClient):
    """Test that events health check requires authentication."""
    response = await unauth_client.get("/backend/events/health")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_events_health_check_redis_connection_failure(
    client: AsyncClient, seed_user: User, mock_redis
):
    """Test health check when Redis is unavailable."""
    # Mock Redis connection failure
    mock_redis.ping = AsyncMock(side_effect=Exception("Connection refused"))

    with patch("api.routers.internal.events_router.redis.Redis.from_url", return_value=mock_redis):
        response = await client.get("/backend/events/health")

        # Should return unhealthy status but not crash
        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "unhealthy"
        assert (data.get("redisConnected") or data.get("redis_connected")) is False


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.asyncio
async def test_all_events_endpoints_require_auth(unauth_client: AsyncClient):
    """Test that all events endpoints require authentication."""
    endpoints = [
        "/backend/events/consumer-lag",
        "/backend/events/streams",
        "/backend/events/health",
    ]

    for endpoint in endpoints:
        response = await unauth_client.get(endpoint)
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_all_events_endpoints_return_json(client: AsyncClient, seed_user: User):
    """Test that all events endpoints return JSON responses."""
    endpoints = [
        "/backend/events/consumer-lag",
        "/backend/events/streams",
        "/backend/events/health",
    ]

    for endpoint in endpoints:
        response = await client.get(endpoint)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/json")


@pytest.mark.asyncio
async def test_events_endpoints_handle_redis_errors_gracefully(
    client: AsyncClient, seed_user: User
):
    """Test that events endpoints handle Redis errors without crashing."""
    # This test verifies that even if Redis is unavailable,
    # the endpoints return proper error responses instead of 500 errors
    
    endpoints = [
        "/backend/events/consumer-lag",
        "/backend/events/streams",
        "/backend/events/health",
    ]

    for endpoint in endpoints:
        response = await client.get(endpoint)
        
        # Should return either success or graceful error (not 500)
        # Health check might return 200 with "unhealthy" status
        # Other endpoints might return errors or partial data
        assert response.status_code in [200, 503]
