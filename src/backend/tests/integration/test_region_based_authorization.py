"""
Integration tests for Region-Based Authorization.

Tests that technicians assigned to a BusinessUnit can see ALL requests
from ALL BusinessUnits in the same Region, not just their assigned BU.

Example:
- Region "Egypt" contains BUs: "SMH" and "ARC"
- Technician assigned to "SMH" should see requests from both "SMH" and "ARC"
- Technician should NOT see requests from BUs in other regions
"""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    User,
    BusinessUnit,
    BusinessUnitRegion,
    TechnicianBusinessUnit,
    TechnicianRegion,
    RequestStatus,
    Priority,
)
from crud.service_request_crud import ServiceRequestCRUD
from tests.factories import (
    UserFactory,
    ServiceRequestFactory,
)


# ============================================================================
# Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def egypt_region(db_session: AsyncSession) -> BusinessUnitRegion:
    """Create Egypt region."""
    region = BusinessUnitRegion(
        name="Egypt",
        description="Egypt Region",
        is_active=True,
        is_deleted=False,
    )
    db_session.add(region)
    await db_session.commit()
    await db_session.refresh(region)
    return region


@pytest_asyncio.fixture
async def saudi_region(db_session: AsyncSession) -> BusinessUnitRegion:
    """Create Saudi Arabia region."""
    region = BusinessUnitRegion(
        name="Saudi Arabia",
        description="Saudi Arabia Region",
        is_active=True,
        is_deleted=False,
    )
    db_session.add(region)
    await db_session.commit()
    await db_session.refresh(region)
    return region


@pytest_asyncio.fixture
async def smh_business_unit(
    db_session: AsyncSession, egypt_region: BusinessUnitRegion
) -> BusinessUnit:
    """Create SMH business unit in Egypt region."""
    bu = BusinessUnit(
        name="SMH",
        description="SMH Business Unit",
        business_unit_region_id=egypt_region.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(bu)
    await db_session.commit()
    await db_session.refresh(bu)
    return bu


@pytest_asyncio.fixture
async def arc_business_unit(
    db_session: AsyncSession, egypt_region: BusinessUnitRegion
) -> BusinessUnit:
    """Create ARC business unit in Egypt region (same as SMH)."""
    bu = BusinessUnit(
        name="ARC",
        description="ARC Business Unit",
        business_unit_region_id=egypt_region.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(bu)
    await db_session.commit()
    await db_session.refresh(bu)
    return bu


@pytest_asyncio.fixture
async def saudi_business_unit(
    db_session: AsyncSession, saudi_region: BusinessUnitRegion
) -> BusinessUnit:
    """Create Saudi business unit in Saudi Arabia region (different region)."""
    bu = BusinessUnit(
        name="Saudi BU",
        description="Saudi Business Unit",
        business_unit_region_id=saudi_region.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(bu)
    await db_session.commit()
    await db_session.refresh(bu)
    return bu


@pytest_asyncio.fixture
async def sample_statuses(db_session: AsyncSession) -> list[RequestStatus]:
    """Get or create standard request statuses."""
    result = await db_session.execute(
        select(RequestStatus)
        .where(RequestStatus.is_active)
        .order_by(RequestStatus.id)
    )
    existing_statuses = result.scalars().all()

    if existing_statuses:
        return list(existing_statuses)

    # Create new statuses
    import uuid

    suffix = uuid.uuid4().hex[:6]
    statuses = [
        RequestStatus(
            name=f"New_{suffix}",
            name_en="New",
            name_ar="جديد",
            color="#3B82F6",
        ),
        RequestStatus(
            name=f"Open_{suffix}",
            name_en="Open",
            name_ar="مفتوح",
            color="#10B981",
        ),
        RequestStatus(
            name=f"InProgress_{suffix}",
            name_en="In Progress",
            name_ar="قيد التنفيذ",
            color="#F59E0B",
        ),
    ]
    for status in statuses:
        db_session.add(status)
    await db_session.commit()

    for status in statuses:
        await db_session.refresh(status)
    return statuses


@pytest_asyncio.fixture
async def sample_priorities(db_session: AsyncSession) -> list[Priority]:
    """Get or create standard priorities."""
    result = await db_session.execute(
        select(Priority)
        .where(Priority.is_active)
        .order_by(Priority.response_time_minutes)
    )
    existing_priorities = result.scalars().all()

    if existing_priorities:
        return list(existing_priorities)

    # Create new priorities
    import uuid

    suffix = uuid.uuid4().hex[:6]
    priorities = [
        Priority(
            name=f"Medium_{suffix}",
            response_time_minutes=240,
            resolution_time_hours=24,
            is_active=True,
        ),
    ]
    for priority in priorities:
        db_session.add(priority)
    await db_session.commit()

    for priority in priorities:
        await db_session.refresh(priority)
    return priorities


@pytest_asyncio.fixture
async def technician_user(db_session: AsyncSession) -> User:
    """Create a technician user."""
    user = UserFactory.create_technician(full_name="Test Technician")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def requester_user(db_session: AsyncSession) -> User:
    """Create a requester user."""
    user = UserFactory.create(full_name="Test Requester")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ============================================================================
# Region-Based Authorization Tests
# ============================================================================


class TestRegionBasedAuthorization:
    """Tests for region-based authorization filtering."""

    @pytest.mark.asyncio
    async def test_technician_sees_all_business_units_in_same_region(
        self,
        db_session: AsyncSession,
        technician_user: User,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        arc_business_unit: BusinessUnit,
        egypt_region: BusinessUnitRegion,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """
        Test that a technician assigned to BU "SMH" (in Region "Egypt")
        can see requests from BOTH "SMH" and "ARC" (both in Egypt region).
        """
        # Assign technician to SMH business unit only
        assignment = TechnicianBusinessUnit(
            technician_id=technician_user.id,
            business_unit_id=smh_business_unit.id,
            is_active=True,
            is_deleted=False,
        )
        db_session.add(assignment)

        # Create request in SMH
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_smh)

        # Create request in ARC (same region as SMH)
        request_arc = ServiceRequestFactory.create(
            title="Request in ARC",
            requester_id=requester_user.id,
            business_unit_id=arc_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_arc)

        await db_session.commit()

        # Refresh user to load relationships
        await db_session.refresh(technician_user, ["business_unit_assigns"])

        # Get unassigned requests (should show both SMH and ARC requests)
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=technician_user,
            page=1,
            per_page=20,
        )

        # Technician should see BOTH requests (from SMH and ARC)
        request_ids = {str(r.id) for r in requests}
        assert str(request_smh.id) in request_ids, "Should see SMH request"
        assert str(request_arc.id) in request_ids, "Should see ARC request (same region)"
        assert total >= 2

    @pytest.mark.asyncio
    async def test_technician_does_not_see_requests_from_other_regions(
        self,
        db_session: AsyncSession,
        technician_user: User,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        saudi_business_unit: BusinessUnit,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """
        Test that a technician assigned to BU "SMH" (in Region "Egypt")
        CANNOT see requests from "Saudi BU" (in different region).
        """
        # Assign technician to SMH business unit (Egypt region)
        assignment = TechnicianBusinessUnit(
            technician_id=technician_user.id,
            business_unit_id=smh_business_unit.id,
            is_active=True,
            is_deleted=False,
        )
        db_session.add(assignment)

        # Create request in SMH (Egypt)
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_smh)

        # Create request in Saudi BU (different region)
        request_saudi = ServiceRequestFactory.create(
            title="Request in Saudi",
            requester_id=requester_user.id,
            business_unit_id=saudi_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_saudi)

        await db_session.commit()

        # Refresh user to load relationships
        await db_session.refresh(technician_user, ["business_unit_assigns"])

        # Get unassigned requests
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=technician_user,
            page=1,
            per_page=20,
        )

        # Technician should see ONLY SMH request, NOT Saudi request
        request_ids = {str(r.id) for r in requests}
        assert str(request_smh.id) in request_ids, "Should see SMH request"
        assert (
            str(request_saudi.id) not in request_ids
        ), "Should NOT see Saudi request (different region)"

    @pytest.mark.asyncio
    async def test_technician_assigned_to_multiple_regions_sees_all(
        self,
        db_session: AsyncSession,
        technician_user: User,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        saudi_business_unit: BusinessUnit,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """
        Test that a technician assigned to BUs in multiple regions
        sees requests from ALL BUs in ALL those regions.
        """
        # Assign technician to both SMH (Egypt) and Saudi BU
        assignment_smh = TechnicianBusinessUnit(
            technician_id=technician_user.id,
            business_unit_id=smh_business_unit.id,
            is_active=True,
            is_deleted=False,
        )
        assignment_saudi = TechnicianBusinessUnit(
            technician_id=technician_user.id,
            business_unit_id=saudi_business_unit.id,
            is_active=True,
            is_deleted=False,
        )
        db_session.add(assignment_smh)
        db_session.add(assignment_saudi)

        # Create requests in both BUs
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        request_saudi = ServiceRequestFactory.create(
            title="Request in Saudi",
            requester_id=requester_user.id,
            business_unit_id=saudi_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_smh)
        db_session.add(request_saudi)

        await db_session.commit()

        # Refresh user to load relationships
        await db_session.refresh(technician_user, ["business_unit_assigns"])

        # Get unassigned requests
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=technician_user,
            page=1,
            per_page=20,
        )

        # Technician should see BOTH requests (from both regions)
        request_ids = {str(r.id) for r in requests}
        assert str(request_smh.id) in request_ids, "Should see SMH request"
        assert str(request_saudi.id) in request_ids, "Should see Saudi request"
        assert total >= 2

    @pytest.mark.asyncio
    async def test_super_admin_sees_all_requests(
        self,
        db_session: AsyncSession,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        saudi_business_unit: BusinessUnit,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """Test that super admin sees ALL requests regardless of region."""
        # Create super admin user
        super_admin = UserFactory.create_admin(
            full_name="Super Admin", is_super_admin=True
        )
        db_session.add(super_admin)

        # Create requests in different BUs
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        request_saudi = ServiceRequestFactory.create(
            title="Request in Saudi",
            requester_id=requester_user.id,
            business_unit_id=saudi_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_smh)
        db_session.add(request_saudi)

        await db_session.commit()

        # Get unassigned requests as super admin
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=super_admin,
            page=1,
            per_page=20,
        )

        # Super admin should see ALL requests
        request_ids = {str(r.id) for r in requests}
        assert str(request_smh.id) in request_ids
        assert str(request_saudi.id) in request_ids

    @pytest.mark.asyncio
    async def test_technician_with_region_assignment_sees_all_bus_in_region(
        self,
        db_session: AsyncSession,
        technician_user: User,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        arc_business_unit: BusinessUnit,
        egypt_region: BusinessUnitRegion,
        saudi_business_unit: BusinessUnit,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """
        Test that a technician assigned to a Region (via TechnicianRegion)
        sees ALL requests from ALL BUs in that region.
        """
        # Assign technician to Egypt region (not specific BU)
        region_assignment = TechnicianRegion(
            technician_id=technician_user.id,
            region_id=egypt_region.id,
            is_active=True,
            is_deleted=False,
        )
        db_session.add(region_assignment)

        # Create requests in Egypt region BUs
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        request_arc = ServiceRequestFactory.create(
            title="Request in ARC",
            requester_id=requester_user.id,
            business_unit_id=arc_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )

        # Create request in different region
        request_saudi = ServiceRequestFactory.create(
            title="Request in Saudi",
            requester_id=requester_user.id,
            business_unit_id=saudi_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )

        db_session.add(request_smh)
        db_session.add(request_arc)
        db_session.add(request_saudi)

        await db_session.commit()

        # Refresh user to load relationships
        await db_session.refresh(technician_user, ["region_assigns"])

        # Get unassigned requests
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=technician_user,
            page=1,
            per_page=20,
        )

        # Technician should see requests from Egypt region (SMH and ARC), but NOT Saudi
        request_ids = {str(r.id) for r in requests}
        assert str(request_smh.id) in request_ids, "Should see SMH request"
        assert str(request_arc.id) in request_ids, "Should see ARC request"
        assert (
            str(request_saudi.id) not in request_ids
        ), "Should NOT see Saudi request"

    @pytest.mark.asyncio
    async def test_technician_with_no_assignments_sees_no_requests(
        self,
        db_session: AsyncSession,
        technician_user: User,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """
        Test that a technician with no BU or Region assignments
        sees NO requests.
        """
        # Do NOT assign technician to any BU or Region

        # Create request in SMH
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_smh)

        await db_session.commit()

        # Refresh user to load relationships
        await db_session.refresh(technician_user)

        # Get unassigned requests
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=technician_user,
            page=1,
            per_page=20,
        )

        # Technician should see NO requests
        request_ids = {str(r.id) for r in requests}
        assert (
            str(request_smh.id) not in request_ids
        ), "Should NOT see any requests without assignments"
        assert total == 0 or str(request_smh.id) not in request_ids

    @pytest.mark.asyncio
    async def test_business_unit_filter_parameter_works_with_region_filtering(
        self,
        db_session: AsyncSession,
        technician_user: User,
        requester_user: User,
        smh_business_unit: BusinessUnit,
        arc_business_unit: BusinessUnit,
        sample_statuses: list[RequestStatus],
        sample_priorities: list[Priority],
    ):
        """
        Test that the optional business_unit_id parameter works correctly
        with region-based filtering (can narrow down to specific BU).
        """
        # Assign technician to SMH (which gives access to entire Egypt region)
        assignment = TechnicianBusinessUnit(
            technician_id=technician_user.id,
            business_unit_id=smh_business_unit.id,
            is_active=True,
            is_deleted=False,
        )
        db_session.add(assignment)

        # Create requests in both SMH and ARC
        request_smh = ServiceRequestFactory.create(
            title="Request in SMH",
            requester_id=requester_user.id,
            business_unit_id=smh_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        request_arc = ServiceRequestFactory.create(
            title="Request in ARC",
            requester_id=requester_user.id,
            business_unit_id=arc_business_unit.id,
            status_id=sample_statuses[0].id,
            priority_id=sample_priorities[0].id,
        )
        db_session.add(request_smh)
        db_session.add(request_arc)

        await db_session.commit()

        # Refresh user to load relationships
        await db_session.refresh(technician_user, ["business_unit_assigns"])

        # Get requests filtered by ARC business unit only
        requests, total = await ServiceRequestCRUD.find_unassigned_requests(
            db=db_session,
            user=technician_user,
            business_unit_id=arc_business_unit.id,  # Filter to ARC only
            page=1,
            per_page=20,
        )

        # Should see ONLY ARC request, not SMH
        request_ids = {str(r.id) for r in requests}
        assert (
            str(request_smh.id) not in request_ids
        ), "Should NOT see SMH request (filtered out)"
        assert str(request_arc.id) in request_ids, "Should see ARC request"
