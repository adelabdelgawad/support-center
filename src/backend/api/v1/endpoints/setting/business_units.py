"""
Business Unit API endpoints.

Provides endpoints for managing business units, including IP-based network detection
for automatic business unit identification based on client IP addresses.

**Architecture Note:**
Refactored to inline DB queries - service and CRUD layers removed.
Previous service layer used raw SQL with IP-to-CIDR logic which has been
simplified into helper functions within this module.

**Key Features:**
- CRUD operations for business units
- IP-based business unit detection (CIDR matching)
- Working hours management per business unit
- Bulk status updates
- Region-based filtering
- Active/inactive status tracking
"""
import ipaddress
import logging
from datetime import datetime
from typing import List, Optional, Tuple

from db.database import get_session
from core.dependencies import get_current_user, require_admin
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from db import BusinessUnit, User
from api.schemas.business_unit import (
    BusinessUnitCreate,
    BusinessUnitListResponse,
    BulkBusinessUnitStatusUpdate,
    BusinessUnitRead,
    BusinessUnitUpdate,
)
from sqlalchemy import case, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter()


async def list_business_units(
    db: AsyncSession,
    name: Optional[str] = None,
    is_active: Optional[bool] = None,
    region_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 50,
) -> Tuple[List[BusinessUnit], int, int, int]:
    """
    List business units with filtering and pagination.

    Returns:
        Tuple of (list of business units, total, active_count, inactive_count)
    """
    # Build main query
    stmt = select(BusinessUnit).where(not BusinessUnit.is_deleted)

    # Build total count query - ALWAYS get total counts from database (no filters)
    total_count_stmt = select(
        func.count(BusinessUnit.id).label("total"),
        func.count(case((BusinessUnit.is_active.is_(True), 1))).label("active_count"),
        func.count(case((BusinessUnit.is_active.is_(False), 1))).label("inactive_count"),
    ).where(not BusinessUnit.is_deleted)

    # Get total counts (unfiltered)
    total_count_result = await db.execute(total_count_stmt)
    total_counts = total_count_result.one()
    total = total_counts.total or 0
    active_count = total_counts.active_count or 0
    inactive_count = total_counts.inactive_count or 0

    # Apply filters to main query only
    if name:
        name_filter = BusinessUnit.name.ilike(f"%{name}%")
        stmt = stmt.where(name_filter)

    if is_active is not None:
        stmt = stmt.where(BusinessUnit.is_active == is_active)

    if region_id is not None:
        stmt = stmt.where(BusinessUnit.business_unit_region_id == region_id)

    # Apply pagination
    stmt = (
        stmt.order_by(BusinessUnit.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    # Execute query
    result = await db.execute(stmt)
    business_units = result.scalars().all()

    return business_units, total, active_count, inactive_count


async def get_business_unit(
    db: AsyncSession,
    business_unit_id: int,
) -> Optional[BusinessUnit]:
    """Get a business unit by ID."""
    stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_business_unit_by_ip(
    db: AsyncSession,
    ip_address: str,
) -> Optional[BusinessUnit]:
    """
    Find a business unit by matching IP address to network CIDR.

    Args:
        db: Database session
        ip_address: IP address to match

    Returns:
        Matching business unit or None
    """
    if not ip_address:
        return None

    try:
        ip_obj = ipaddress.ip_address(ip_address)
    except ValueError:
        logger.warning(f"Invalid IP address format: {ip_address}")
        return None

    # Get all business units with network defined and not deleted
    stmt = select(BusinessUnit).where(
        (BusinessUnit.network.isnot(None)) & (not BusinessUnit.is_deleted)
    )
    result = await db.execute(stmt)
    business_units = result.scalars().all()

    # Match IP to network
    for bu in business_units:
        try:
            network = ipaddress.ip_network(bu.network, strict=False)
            if ip_obj in network:
                return bu
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid network CIDR for business unit {bu.id}: {bu.network} - {e}")
            continue

    return None


@router.post("", response_model=BusinessUnitRead, status_code=201)
async def create_business_unit(
    business_unit_data: BusinessUnitCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new business unit (admin only).

    Args:
        business_unit_data: Business unit creation data
            - name: Business unit name (must be unique)
            - description: Optional description
            - network: Optional network CIDR (e.g., 10.23.0.0/16)
            - business_unit_region_id: Region ID (optional)
            - is_active: Active status (default: true)
            - working_hours: JSON working hours configuration (optional)
        db: Database session
        current_user: Authenticated admin user

    Returns:
        BusinessUnitRead: Created business unit

    Raises:
        HTTPException 500: Database error occurred

    **Permissions:** Admin only
    """
    try:
        business_unit = BusinessUnit(
            **business_unit_data.model_dump(),
            created_by=current_user.id
        )
        db.add(business_unit)
        await db.commit()
        await db.refresh(business_unit)
        return business_unit
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("", response_model=BusinessUnitListResponse)
async def list_business_units_endpoint(
    name: Optional[str] = Query(None, description="Filter by name (partial match)"),
    is_active: Optional[str] = Query(None, description="Filter by active status (true/false)"),
    region_id: Optional[int] = Query(None, description="Filter by region ID"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List business units with filtering and pagination.

    Returns business units with total counts (active/inactive) across all BUs,
    not just filtered results. This allows UI to display accurate counts while
    showing filtered data.

    Args:
        name: Optional partial name match filter
        is_active: Optional boolean status filter (string "true"/"false")
        region_id: Optional region filter
        page: Page number (1-indexed)
        per_page: Items per page (max 100)
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitListResponse: Paginated list with counts
            - business_units: List of business units
            - total: Total count across all BUs
            - active_count: Count of active BUs
            - inactive_count: Count of inactive BUs

    Raises:
        HTTPException 500: Database error occurred

    **Permissions:** Authenticated users
    """
    try:
        # Convert is_active string to boolean
        is_active_bool = None
        if is_active is not None:
            is_active_bool = is_active.lower() == "true"

        business_units, total, active_count, inactive_count = await list_business_units(
            db=db,
            name=name,
            is_active=is_active_bool,
            region_id=region_id,
            page=page,
            per_page=per_page,
        )

        return BusinessUnitListResponse(
            business_units=business_units,
            total=total,
            active_count=active_count,
            inactive_count=inactive_count,
        )
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/counts")
async def get_business_unit_counts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """
    Get business unit count statistics.

    Returns total, active, and inactive counts across all business units.
    Useful for dashboard widgets and summary displays.

    Args:
        current_user: Authenticated user
        db: Database session

    Returns:
        Dict with keys:
            - total: Total business units
            - active_count: Active business units
            - inactive_count: Inactive business units

    Raises:
        HTTPException 500: Database error occurred

    **Permissions:** Authenticated users
    """
    try:
        _, total, active_count, inactive_count = await list_business_units(
            db=db, page=1, per_page=1
        )

        return {
            "total": total,
            "active_count": active_count,
            "inactive_count": inactive_count,
        }
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/{business_unit_id}", response_model=BusinessUnitRead)
async def get_business_unit_endpoint(
    business_unit_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a business unit by ID.

    Args:
        business_unit_id: Business unit ID
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitRead: Business unit details

    Raises:
        HTTPException 404: Business unit not found
        HTTPException 500: Database error occurred

    **Permissions:** Authenticated users
    """
    try:
        business_unit = await get_business_unit(db=db, business_unit_id=business_unit_id)

        if not business_unit:
            raise HTTPException(status_code=404, detail="Business unit not found")

        return business_unit
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.put("/{business_unit_id}", response_model=BusinessUnitRead)
async def update_business_unit(
    business_unit_id: int,
    update_data: BusinessUnitUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Update a business unit (admin only).

    All fields are optional. Only provided fields will be updated.

    Args:
        business_unit_id: Business unit ID
        update_data: Fields to update
            - name: Optional new name
            - description: Optional new description
            - network: Optional new network CIDR
            - business_unit_region_id: Optional new region ID
            - is_active: Optional active status
            - working_hours: Optional working hours configuration
        db: Database session
        current_user: Authenticated admin user

    Returns:
        BusinessUnitRead: Updated business unit

    Raises:
        HTTPException 404: Business unit not found
        HTTPException 500: Database error occurred

    **Permissions:** Admin only
    """
    try:
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            raise HTTPException(status_code=404, detail="Business unit not found")

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(business_unit, field, value)

        business_unit.updated_at = datetime.utcnow()
        business_unit.updated_by = current_user.id

        await db.commit()
        await db.refresh(business_unit)

        return business_unit
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.put("/{business_unit_id}/status", response_model=BusinessUnitRead)
async def toggle_business_unit_status(
    business_unit_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Toggle business unit active/inactive status.

    Quickly enables/disables a business unit without full update.

    Args:
        business_unit_id: Business unit ID
        db: Database session
        current_user: Authenticated admin user

    Returns:
        BusinessUnitRead: Updated business unit

    Raises:
        HTTPException 404: Business unit not found
        HTTPException 500: Database error occurred

    **Permissions:** Admin only
    """
    try:
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            raise HTTPException(status_code=404, detail="Business unit not found")

        business_unit.is_active = not business_unit.is_active
        business_unit.updated_at = datetime.utcnow()
        business_unit.updated_by = current_user.id

        await db.commit()
        await db.refresh(business_unit)

        return business_unit
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.patch("/{business_unit_id}/working-hours", response_model=BusinessUnitRead)
async def update_business_unit_working_hours(
    business_unit_id: int,
    update_data: BusinessUnitUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Update working hours for a business unit.

    Specialized endpoint for updating only the working_hours configuration.
    Working hours should be a JSON object defining business hours for each day.

    Args:
        business_unit_id: Business unit ID
        update_data: Update data containing working_hours field
        db: Database session
        current_user: Authenticated admin user

    Returns:
        BusinessUnitRead: Updated business unit

    Raises:
        HTTPException 404: Business unit not found
        HTTPException 500: Database error occurred

    **Permissions:** Admin only
    """
    try:
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            raise HTTPException(status_code=404, detail="Business unit not found")

        business_unit.working_hours = update_data.working_hours
        business_unit.updated_at = datetime.utcnow()
        business_unit.updated_by = current_user.id

        await db.commit()
        await db.refresh(business_unit)

        return business_unit
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/bulk-status", response_model=List[BusinessUnitRead])
async def bulk_update_business_units_status(
    update_data: BulkBusinessUnitStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Bulk update business units active/inactive status.

    Efficiently updates multiple business units to the same status in a single
    transaction. Useful for enabling/disabling multiple BUs at once.

    Args:
        update_data: Bulk update data
            - business_unit_ids: List of BU IDs to update
            - is_active: Target status (true/false)
        db: Database session
        current_user: Authenticated admin user

    Returns:
        List[BusinessUnitRead]: Updated business units

    Raises:
        HTTPException 400: No business unit IDs provided
        HTTPException 500: Database error occurred

    **Permissions:** Admin only
    """
    try:
        if not update_data.business_unit_ids:
            raise HTTPException(status_code=400, detail="No business unit IDs provided")

        stmt = select(BusinessUnit).where(BusinessUnit.id.in_(update_data.business_unit_ids))
        result = await db.execute(stmt)
        business_units = result.scalars().all()

        for bu in business_units:
            bu.is_active = update_data.is_active
            bu.updated_at = datetime.utcnow()
            bu.updated_by = current_user.id

        await db.commit()

        return list(business_units)
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.delete("/{business_unit_id}", status_code=204)
async def delete_business_unit(
    business_unit_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete a business unit (soft delete).

    Marks the business unit as deleted without removing it from the database.
    This maintains referential integrity with related records.

    Args:
        business_unit_id: Business unit ID
        db: Database session
        current_user: Authenticated admin user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Business unit not found
        HTTPException 500: Database error occurred

    **Permissions:** Admin only
    """
    try:
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            raise HTTPException(status_code=404, detail="Business unit not found")

        business_unit.is_deleted = True
        business_unit.updated_at = datetime.utcnow()

        await db.commit()

        return Response(status_code=204)
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
