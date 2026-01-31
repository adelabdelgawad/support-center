"""
Device API endpoints for the Deployment Control Plane.

Manages device discovery, registration, and deployment operations
for the software deployment system.

Device Lifecycle States:
- discovered - Device found via discovery, not yet deployed
- install_pending - Deployment job created, waiting
- installing - Deployment in progress
- installed - Software successfully installed
- install_failed - Installation failed
- uninstalling - Uninstall in progress
- uninstalled - Software removed

Discovery Sources:
- network - Found via network scan
- session - Found via desktop session
- ad - Found via Active Directory
- manual - Manually added

Key Features:
- Multiple discovery methods (network, AD, session, manual)
- Online status tracking (last_seen_at threshold)
- Active session binding (desktop_session_id)
- Deployment job triggering
- Safe network scanning with strict limits

Endpoints:
Device Management:
- GET / - List devices with filtering
- GET /count - Get device count
- GET /{device_id} - Get a device by ID
- PUT /{device_id} - Update device

Discovery:
- POST /discover-ad - Trigger Active Directory discovery
- POST /sync-sessions - Sync from desktop sessions
- POST /manual - Manually add a device
- POST /network-scan - Scan network for devices
- POST /refresh-status - Refresh online status via ping

Deployment:
- POST /{device_id}/install - Trigger NetSupport installation

Authentication:
- All endpoints require admin role
- Inline credentials required for install triggers

Network Scan Safeguards:
- Maximum 1024 addresses per scan
- Non-credentialed TCP connect only
- No service enumeration
- No OS fingerprinting
- Requires explicit user action

Online Threshold:
Device is online if last_seen_at is within 15 minutes.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from db.database import get_session
from core.dependencies import require_admin
from fastapi import APIRouter, Depends, HTTPException
from db import User
from api.schemas.device import (
    ADDiscoveryRequest,
    DeviceListItem,
    DeviceRead,
    DeviceUpdate,
    DiscoveryResponse,
    InstallRequest,
    ManualAddRequest,
    NetworkScanRequest,
    SessionSyncRequest,
)
from api.schemas.deployment_job import DeploymentJobRead
from api.services.device_service import DeviceService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
logger = logging.getLogger(__name__)

# Online threshold: device is online if seen within the last 15 minutes
ONLINE_THRESHOLD_MINUTES = 15


@router.get("", response_model=List[DeviceListItem])
async def list_devices(
    lifecycle_state: Optional[str] = None,
    discovery_source: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    List discovered devices with optional filtering.

    Requires admin role.
    """
    devices = await DeviceService.list_devices(
        db=db,
        lifecycle_state=lifecycle_state,
        discovery_source=discovery_source,
        search=search,
        limit=limit,
        offset=offset,
    )

    # Compute online status based on last_seen_at
    now = datetime.utcnow()
    online_threshold = now - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)

    result = []
    for device in devices:
        # Device is online if last_seen_at is within the threshold
        is_online = (
            device.last_seen_at is not None
            and device.last_seen_at > online_threshold
        )

        item = DeviceListItem(
            id=device.id,
            hostname=device.hostname,
            ip_address=device.ip_address,
            mac_address=device.mac_address,
            lifecycle_state=device.lifecycle_state,
            discovery_source=device.discovery_source,
            ad_computer_dn=device.ad_computer_dn,
            last_seen_at=device.last_seen_at,
            has_active_session=device.desktop_session_id is not None,
            is_online=is_online,
        )
        result.append(item)

    return result


@router.get("/count")
async def count_devices(
    lifecycle_state: Optional[str] = None,
    discovery_source: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Get device count with optional filtering."""
    count = await DeviceService.count_devices(
        db=db,
        lifecycle_state=lifecycle_state,
        discovery_source=discovery_source,
    )
    return {"count": count}


@router.get("/{device_id}", response_model=DeviceRead)
async def get_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Get a device by ID.

    Requires admin role.
    """
    device = await DeviceService.get_device(db=db, device_id=device_id)

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    return DeviceRead(
        id=device.id,
        hostname=device.hostname,
        ip_address=device.ip_address,
        mac_address=device.mac_address,
        lifecycle_state=device.lifecycle_state,
        discovery_source=device.discovery_source,
        ad_computer_dn=device.ad_computer_dn,
        desktop_session_id=device.desktop_session_id,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        created_by=device.created_by,
        has_active_session=device.desktop_session_id is not None,
    )


@router.put("/{device_id}", response_model=DeviceRead)
async def update_device(
    device_id: UUID,
    update_data: DeviceUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Update a device.

    Requires admin role.
    """
    device = await DeviceService.update_device(
        db=db,
        device_id=device_id,
        update_data=update_data,
    )

    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    return DeviceRead(
        id=device.id,
        hostname=device.hostname,
        ip_address=device.ip_address,
        mac_address=device.mac_address,
        lifecycle_state=device.lifecycle_state,
        discovery_source=device.discovery_source,
        ad_computer_dn=device.ad_computer_dn,
        desktop_session_id=device.desktop_session_id,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        created_by=device.created_by,
        has_active_session=device.desktop_session_id is not None,
    )


@router.post("/discover-ad", response_model=List[DeviceListItem])
async def discover_from_ad(
    request: ADDiscoveryRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Trigger Active Directory device discovery.

    Queries AD for computer objects and creates/updates device records.
    Requires admin role.
    """
    # TODO: Implement AD discovery using active_directory service
    # For now, return empty list as placeholder
    logger.info(
        f"AD discovery triggered by {current_user.username} "
        f"(base: {request.search_base}, filter: {request.filter_pattern})"
    )
    return []


@router.post("/sync-sessions", response_model=DiscoveryResponse)
async def sync_from_sessions(
    request: SessionSyncRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Sync devices from DesktopSession records.

    Creates device records from existing Tauri app sessions.
    All discovered devices are set to 'discovered' lifecycle state.
    Does NOT trigger deployment jobs.

    Requires admin role.
    """
    result = await DeviceService.sync_from_sessions(
        db=db,
        active_only=request.active_only,
        created_by=current_user.id,
    )

    logger.info(
        f"Session sync by {current_user.username}: "
        f"created={result.created_count}, updated={result.updated_count}"
    )

    devices_list = [
        DeviceListItem(
            id=device.id,
            hostname=device.hostname,
            ip_address=device.ip_address,
            mac_address=device.mac_address,
            lifecycle_state=device.lifecycle_state,
            discovery_source=device.discovery_source,
            ad_computer_dn=device.ad_computer_dn,
            last_seen_at=device.last_seen_at,
            has_active_session=device.desktop_session_id is not None,
        )
        for device in result.devices
    ]

    return DiscoveryResponse(
        created_count=result.created_count,
        updated_count=result.updated_count,
        total_count=result.total_count,
        devices=devices_list,
    )


@router.post("/manual", response_model=DeviceRead)
async def add_device_manual(
    request: ManualAddRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Manually add a device.

    Creates a device in 'discovered' state.
    Does NOT test reachability.
    Does NOT trigger deployment.

    Requires admin role.
    """
    device, is_new = await DeviceService.add_device_manual(
        db=db,
        request=request,
        created_by=current_user.id,
    )

    action = "created" if is_new else "updated"
    logger.info(
        f"Manual device {action} by {current_user.username}: "
        f"hostname={device.hostname}, ip={device.ip_address}"
    )

    return DeviceRead(
        id=device.id,
        hostname=device.hostname,
        ip_address=device.ip_address,
        mac_address=device.mac_address,
        lifecycle_state=device.lifecycle_state,
        discovery_source=device.discovery_source,
        ad_computer_dn=device.ad_computer_dn,
        desktop_session_id=device.desktop_session_id,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        created_by=device.created_by,
        has_active_session=device.desktop_session_id is not None,
    )


@router.post("/network-scan", response_model=DiscoveryResponse)
async def scan_network(
    request: NetworkScanRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Scan for devices using various scan types.

    Scan Types:
    - single: Scan a single IP address
    - range: Scan an IP range (start_ip to end_ip)
    - network: Scan a CIDR network range

    STRICT SAFEGUARDS:
    - Maximum 1024 addresses per scan
    - Non-credentialed TCP connect only
    - No service enumeration
    - No OS fingerprinting
    - All discovered devices set to 'discovered' state
    - Does NOT trigger deployment

    Requires admin role and explicit user action.
    """
    scan_desc = {
        "single": f"single IP {request.ip_address}",
        "range": f"range {request.start_ip} - {request.end_ip}",
        "network": f"network {request.cidr}",
    }.get(request.scan_type, request.scan_type)

    logger.warning(
        f"Network scan initiated by {current_user.username}: {scan_desc}"
    )

    try:
        result = await DeviceService.scan_network(
            db=db,
            request=request,
            created_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(
        f"Network scan completed by {current_user.username}: "
        f"{scan_desc}, scanned={result.hosts_scanned}, "
        f"reachable={result.hosts_reachable}, deployable={result.hosts_deployable}, "
        f"created={result.created_count}, updated={result.updated_count}"
    )

    devices_list = [
        DeviceListItem(
            id=device.id,
            hostname=device.hostname,
            ip_address=device.ip_address,
            mac_address=device.mac_address,
            lifecycle_state=device.lifecycle_state,
            discovery_source=device.discovery_source,
            ad_computer_dn=device.ad_computer_dn,
            last_seen_at=device.last_seen_at,
            has_active_session=device.desktop_session_id is not None,
        )
        for device in result.devices
    ]

    return DiscoveryResponse(
        created_count=result.created_count,
        updated_count=result.updated_count,
        total_count=result.total_count,
        devices=devices_list,
        # Include scan metadata for network scans
        hosts_scanned=result.hosts_scanned,
        hosts_reachable=result.hosts_reachable,
        hosts_deployable=result.hosts_deployable,
    )


@router.post("/refresh-status", response_model=DiscoveryResponse)
async def refresh_device_status(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Refresh online status of all devices by pinging them.

    Updates lastSeenAt for devices that respond to ping.
    Requires admin role.
    """
    result = await DeviceService.refresh_all_device_status(db=db)

    logger.info(
        f"Device status refresh by {current_user.username}: "
        f"pinged={result.hosts_scanned}, online={result.hosts_reachable}, "
        f"updated={result.updated_count}"
    )

    devices_list = [
        DeviceListItem(
            id=device.id,
            hostname=device.hostname,
            ip_address=device.ip_address,
            mac_address=device.mac_address,
            lifecycle_state=device.lifecycle_state,
            discovery_source=device.discovery_source,
            ad_computer_dn=device.ad_computer_dn,
            last_seen_at=device.last_seen_at,
            has_active_session=device.desktop_session_id is not None,
        )
        for device in result.devices
    ]

    return DiscoveryResponse(
        created_count=result.created_count,
        updated_count=result.updated_count,
        total_count=result.total_count,
        devices=devices_list,
        hosts_scanned=result.hosts_scanned,
        hosts_reachable=result.hosts_reachable,
        hosts_deployable=0,
    )


@router.post("/{device_id}/install", response_model=DeploymentJobRead)
async def trigger_install(
    device_id: UUID,
    request: InstallRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Trigger NetSupport installation on a device.

    Creates a deployment job and sets device state to install_pending.
    Requires admin role and inline credentials for remote access.
    """
    try:
        job = await DeviceService.trigger_install(
            db=db,
            device_id=device_id,
            created_by=current_user.id,
            username=request.credentials.username,
            password=request.credentials.password,
            credential_type=request.credentials.credential_type,
            force=request.force,
        )

        return DeploymentJobRead(
            id=job.id,
            job_type=job.job_type,
            status=job.status,
            payload=job.payload,
            created_by=job.created_by,
            created_at=job.created_at,
            claimed_by=job.claimed_by,
            claimed_at=job.claimed_at,
            completed_at=job.completed_at,
            result=job.result,
            error_message=job.error_message,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
