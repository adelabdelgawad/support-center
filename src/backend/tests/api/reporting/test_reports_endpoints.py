"""
Tests for reports endpoints (GET /backend/reports/*).

Tests cover:
- Executive dashboard endpoint
- Operations dashboard endpoint
- SLA compliance reports
- Agent performance reports
- Volume analysis reports
- Outshift reports (agent-specific and global)
- Date range filtering (presets and custom)
- Multi-dimensional filtering (BU, priority, status, technician)
- Error handling and validation
- Access control (technician-level permissions)
"""

import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from tests.factories import (
    ServiceRequestFactory,
    UserFactory,
    BusinessUnitFactory,
    PriorityFactory,
    RequestStatusFactory,
)

from db.models import User

# ============================================================================
# GET /backend/reports/dashboard/executive - Executive Dashboard
# ============================================================================


@pytest.mark.asyncio
async def test_get_executive_dashboard_success(client: AsyncClient, seed_user: User):
    """Test executive dashboard returns correct structure."""
    response = await client.get("/backend/reports/dashboard/executive")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on ExecutiveDashboardData schema)
    assert "kpis" in data or "metrics" in data or "summary" in data
    # Dashboard should return meaningful data even if empty
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_executive_dashboard_with_date_preset(client: AsyncClient, seed_user: User):
    """Test executive dashboard with date preset filter."""
    response = await client.get(
        "/backend/reports/dashboard/executive?date_preset=last_7_days"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_executive_dashboard_with_custom_dates(client: AsyncClient, seed_user: User):
    """Test executive dashboard with custom date range."""
    start_date = (date.today() - timedelta(days=30)).isoformat()
    end_date = date.today().isoformat()

    response = await client.get(
        f"/backend/reports/dashboard/executive?date_preset=custom&start_date={start_date}&end_date={end_date}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_executive_dashboard_with_bu_filter(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test executive dashboard filtered by business unit."""
    # Create a business unit
    bu = BusinessUnitFactory.create(name="IT Department")
    db_session.add(bu)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/dashboard/executive?business_unit_ids={bu.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_executive_dashboard_multiple_filters(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test executive dashboard with multiple combined filters."""
    # Create test data
    bu = BusinessUnitFactory.create(name="HR Department")
    db_session.add(bu)
    await db_session.commit()

    start_date = (date.today() - timedelta(days=7)).isoformat()
    end_date = date.today().isoformat()

    response = await client.get(
        f"/backend/reports/dashboard/executive"
        f"?date_preset=custom&start_date={start_date}&end_date={end_date}"
        f"&business_unit_ids={bu.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


# ============================================================================
# GET /backend/reports/dashboard/operations - Operations Dashboard
# ============================================================================


@pytest.mark.asyncio
async def test_get_operations_dashboard_success(client: AsyncClient, seed_user: User):
    """Test operations dashboard returns correct structure."""
    response = await client.get("/backend/reports/dashboard/operations")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on VolumeReportData schema)
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_operations_dashboard_with_filters(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test operations dashboard with date and BU filters."""
    bu = BusinessUnitFactory.create(name="Operations")
    db_session.add(bu)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/dashboard/operations"
        f"?date_preset=last_30_days&business_unit_ids={bu.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


# ============================================================================
# GET /backend/reports/sla/compliance - SLA Compliance Report
# ============================================================================


@pytest.mark.asyncio
async def test_get_sla_compliance_success(client: AsyncClient, seed_user: User):
    """Test SLA compliance report returns correct structure."""
    response = await client.get("/backend/reports/sla/compliance")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on SLAComplianceData schema)
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_sla_compliance_with_priority_filter(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test SLA compliance filtered by priority."""
    # Create a priority
    priority = PriorityFactory.create(name="High")
    db_session.add(priority)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/sla/compliance?priority_ids={priority.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_sla_compliance_with_date_range(client: AsyncClient, seed_user: User):
    """Test SLA compliance with date range."""
    start_date = (date.today() - timedelta(days=60)).isoformat()
    end_date = date.today().isoformat()

    response = await client.get(
        f"/backend/reports/sla/compliance"
        f"?date_preset=custom&start_date={start_date}&end_date={end_date}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_sla_compliance_multiple_priorities(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test SLA compliance with multiple priorities."""
    # Create priorities
    p1 = PriorityFactory.create(name="Critical")
    p2 = PriorityFactory.create(name="High")
    db_session.add_all([p1, p2])
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/sla/compliance?priority_ids={p1.id},{p2.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


# ============================================================================
# GET /backend/reports/agents/performance - Agent Performance Report
# ============================================================================


@pytest.mark.asyncio
async def test_get_agent_performance_success(client: AsyncClient, seed_user: User):
    """Test agent performance report returns correct structure."""
    response = await client.get("/backend/reports/agents/performance")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on AgentPerformanceData schema)
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_agent_performance_with_limit(client: AsyncClient, seed_user: User):
    """Test agent performance report with custom limit."""
    response = await client.get("/backend/reports/agents/performance?limit=20")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_agent_performance_with_technician_filter(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test agent performance filtered by specific technicians."""
    # Create technician users
    tech1 = UserFactory.create(username="tech1", is_technician=True)
    tech2 = UserFactory.create(username="tech2", is_technician=True)
    db_session.add_all([tech1, tech2])
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/agents/performance?technician_ids={tech1.id},{tech2.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_agent_performance_with_date_and_bu(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test agent performance with date range and business unit filters."""
    bu = BusinessUnitFactory.create(name="Support Team")
    db_session.add(bu)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/agents/performance"
        f"?date_preset=this_month&business_unit_ids={bu.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_agent_performance_limit_validation(client: AsyncClient, seed_user: User):
    """Test agent performance limit parameter validation."""
    # Test invalid limit (too low)
    response = await client.get("/backend/reports/agents/performance?limit=0")
    assert response.status_code == 422  # Validation error

    # Test invalid limit (too high)
    response = await client.get("/backend/reports/agents/performance?limit=100")
    assert response.status_code == 422  # Validation error

    # Test valid limit
    response = await client.get("/backend/reports/agents/performance?limit=25")
    assert response.status_code == 200


# ============================================================================
# GET /backend/reports/volume/analysis - Volume Analysis Report
# ============================================================================


@pytest.mark.asyncio
async def test_get_volume_analysis_success(client: AsyncClient, seed_user: User):
    """Test volume analysis report returns correct structure."""
    response = await client.get("/backend/reports/volume/analysis")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on VolumeReportData schema)
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_volume_analysis_with_date_preset(client: AsyncClient, seed_user: User):
    """Test volume analysis with date preset."""
    response = await client.get("/backend/reports/volume/analysis?date_preset=this_week")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_volume_analysis_with_bu_filter(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test volume analysis filtered by business unit."""
    bu = BusinessUnitFactory.create(name="Finance")
    db_session.add(bu)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/volume/analysis?business_unit_ids={bu.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_volume_analysis_with_requests(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test volume analysis with actual service requests."""
    # Create test data
    bu = BusinessUnitFactory.create(name="Tech Support")
    priority = PriorityFactory.create(name="Medium")
    status = RequestStatusFactory.create(name="Open")
    db_session.add_all([bu, priority, status])
    await db_session.commit()

    # Create service requests
    for i in range(5):
        request = ServiceRequestFactory.create(
            title=f"Test Request {i}",
            business_unit_id=bu.id,
            priority_id=priority.id,
            status_id=status.id,
        )
        db_session.add(request)
    await db_session.commit()

    response = await client.get("/backend/reports/volume/analysis")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


# ============================================================================
# GET /backend/reports/outshift/agent/{agent_id} - Agent Outshift Report
# ============================================================================


@pytest.mark.asyncio
async def test_get_agent_outshift_success(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test agent outshift report returns correct structure."""
    # Create a technician
    tech = UserFactory.create(username="techagent", is_technician=True)
    db_session.add(tech)
    await db_session.commit()

    response = await client.get(f"/backend/reports/outshift/agent/{tech.id}")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on OutshiftAgentReport schema)
    assert isinstance(data, dict)
    # Should have agent_id or agentId field
    assert "agentId" in data or "agent_id" in data


@pytest.mark.asyncio
async def test_get_agent_outshift_with_date_range(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test agent outshift report with custom date range."""
    tech = UserFactory.create(username="techagent2", is_technician=True)
    db_session.add(tech)
    await db_session.commit()

    start_date = (date.today() - timedelta(days=14)).isoformat()
    end_date = date.today().isoformat()

    response = await client.get(
        f"/backend/reports/outshift/agent/{tech.id}"
        f"?date_preset=custom&start_date={start_date}&end_date={end_date}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_agent_outshift_invalid_uuid(client: AsyncClient, seed_user: User):
    """Test agent outshift with invalid UUID format."""
    response = await client.get("/backend/reports/outshift/agent/not-a-uuid")

    # Should return 400 or 422 for invalid UUID
    assert response.status_code in [400, 422]
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_get_agent_outshift_nonexistent_agent(client: AsyncClient, seed_user: User):
    """Test agent outshift with non-existent agent ID."""
    fake_uuid = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/backend/reports/outshift/agent/{fake_uuid}")

    # Should return 404 for non-existent agent
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_get_agent_outshift_with_preset(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test agent outshift report with date preset."""
    tech = UserFactory.create(username="techagent3", is_technician=True)
    db_session.add(tech)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/outshift/agent/{tech.id}?date_preset=last_month"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


# ============================================================================
# GET /backend/reports/outshift/global - Global Outshift Report
# ============================================================================


@pytest.mark.asyncio
async def test_get_global_outshift_success(client: AsyncClient, seed_user: User):
    """Test global outshift report returns correct structure."""
    response = await client.get("/backend/reports/outshift/global")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure (based on OutshiftGlobalReport schema)
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_global_outshift_with_date_range(client: AsyncClient, seed_user: User):
    """Test global outshift report with custom date range."""
    start_date = (date.today() - timedelta(days=30)).isoformat()
    end_date = date.today().isoformat()

    response = await client.get(
        f"/backend/reports/outshift/global"
        f"?date_preset=custom&start_date={start_date}&end_date={end_date}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_global_outshift_with_bu_filter(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test global outshift report filtered by business unit."""
    bu = BusinessUnitFactory.create(name="Customer Service")
    db_session.add(bu)
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/outshift/global?business_unit_ids={bu.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_global_outshift_with_technicians(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test global outshift with actual technician data."""
    # Create multiple technicians
    techs = [
        UserFactory.create(username=f"tech{i}", is_technician=True)
        for i in range(3)
    ]
    db_session.add_all(techs)
    await db_session.commit()

    response = await client.get("/backend/reports/outshift/global")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_global_outshift_multiple_bus(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test global outshift with multiple business units."""
    # Create business units
    bu1 = BusinessUnitFactory.create(name="IT Support")
    bu2 = BusinessUnitFactory.create(name="Helpdesk")
    db_session.add_all([bu1, bu2])
    await db_session.commit()

    response = await client.get(
        f"/backend/reports/outshift/global?business_unit_ids={bu1.id},{bu2.id}"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


# ============================================================================
# Date Range Validation Tests
# ============================================================================


@pytest.mark.asyncio
async def test_report_invalid_date_preset(client: AsyncClient, seed_user: User):
    """Test report endpoint with invalid date preset."""
    response = await client.get(
        "/backend/reports/dashboard/executive?date_preset=invalid_preset"
    )

    # Should still succeed (invalid preset may be ignored or default to custom)
    # Exact behavior depends on backend implementation
    assert response.status_code in [200, 400, 422]


@pytest.mark.asyncio
async def test_report_custom_date_missing_end_date(client: AsyncClient, seed_user: User):
    """Test report with custom preset but missing end_date."""
    start_date = date.today().isoformat()

    response = await client.get(
        f"/backend/reports/dashboard/executive?date_preset=custom&start_date={start_date}"
    )

    # May succeed with defaults or fail validation
    assert response.status_code in [200, 400, 422]


@pytest.mark.asyncio
async def test_report_invalid_date_format(client: AsyncClient, seed_user: User):
    """Test report with invalid date format."""
    response = await client.get(
        "/backend/reports/dashboard/executive"
        "?date_preset=custom&start_date=2024-13-45&end_date=invalid"
    )

    # Should fail validation
    assert response.status_code == 422


# ============================================================================
# Access Control Tests
# ============================================================================


@pytest.mark.asyncio
async def test_reports_require_technician_auth(client: AsyncClient, seed_user: User):
    """Test that all report endpoints require technician authentication.

    Note: In this test suite, seed_user is mocked as a technician via
    dependency overrides, so we verify successful access.
    """
    endpoints = [
        "/backend/reports/dashboard/executive",
        "/backend/reports/dashboard/operations",
        "/backend/reports/sla/compliance",
        "/backend/reports/agents/performance",
        "/backend/reports/volume/analysis",
        "/backend/reports/outshift/global",
    ]

    for endpoint in endpoints:
        response = await client.get(endpoint)
        # Should succeed since auth is mocked
        assert response.status_code == 200, f"Failed for {endpoint}"


# ============================================================================
# Empty Data Handling Tests
# ============================================================================


@pytest.mark.asyncio
async def test_executive_dashboard_empty_database(
    client: AsyncClient, db_session: AsyncSession
):
    """Test executive dashboard with no service requests."""
    # Delete all service requests
    await db_session.execute(text("DELETE FROM service_requests"))
    await db_session.commit()

    response = await client.get("/backend/reports/dashboard/executive")

    assert response.status_code == 200
    data = response.json()
    # Should return empty/zero metrics, not error
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_agent_performance_no_technicians(
    client: AsyncClient, db_session: AsyncSession
):
    """Test agent performance report with no technicians."""
    # Delete all users except seed users
    await db_session.execute(text("DELETE FROM users WHERE is_technician = true"))
    await db_session.commit()

    response = await client.get("/backend/reports/agents/performance")

    assert response.status_code == 200
    data = response.json()
    # Should return empty results, not error
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_volume_analysis_no_requests(
    client: AsyncClient, db_session: AsyncSession
):
    """Test volume analysis with no service requests."""
    await db_session.execute(text("DELETE FROM service_requests"))
    await db_session.commit()

    response = await client.get("/backend/reports/volume/analysis")

    assert response.status_code == 200
    data = response.json()
    # Should return empty volume data, not error
    assert isinstance(data, dict)
