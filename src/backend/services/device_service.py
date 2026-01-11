"""
Device service for the Deployment Control Plane.

Handles device discovery, lifecycle management, and installation triggers.
"""
import asyncio
import ipaddress
import logging
import socket
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import Device, DeploymentJob, DesktopSession
from models.model_enum import (
    DeviceDiscoverySource,
    DeviceLifecycleState,
    DeploymentJobStatus,
)
from schemas.device import DeviceCreate, DeviceUpdate, ManualAddRequest, NetworkScanRequest

logger = logging.getLogger(__name__)


@dataclass
class ScannedHost:
    """Information about a scanned host."""

    ip: str
    hostname: Optional[str] = None
    is_reachable: bool = False
    can_receive_install: bool = False


@dataclass
class DiscoveryResult:
    """Result of a discovery operation."""

    created_count: int
    updated_count: int
    devices: List[Device]
    # Additional scan metadata (for network scans)
    hosts_scanned: int = 0
    hosts_reachable: int = 0
    hosts_deployable: int = 0

    @property
    def total_count(self) -> int:
        return self.created_count + self.updated_count


class DeviceService:
    """Service for managing discovered devices."""

    @staticmethod
    @safe_database_query("list_devices", default_return=[])
    @log_database_operation("device listing", level="debug")
    async def list_devices(
        db: AsyncSession,
        lifecycle_state: Optional[str] = None,
        discovery_source: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Device]:
        """
        List discovered devices with optional filtering.

        Args:
            db: Database session
            lifecycle_state: Filter by lifecycle state
            discovery_source: Filter by discovery source
            search: Search by hostname or IP
            limit: Maximum results to return
            offset: Skip first N results

        Returns:
            List of devices
        """
        stmt = select(Device).order_by(Device.hostname.asc())

        if lifecycle_state:
            stmt = stmt.where(Device.lifecycle_state == lifecycle_state)

        if discovery_source:
            stmt = stmt.where(Device.discovery_source == discovery_source)

        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                (Device.hostname.ilike(search_pattern))
                | (Device.ip_address.ilike(search_pattern))
            )

        stmt = stmt.offset(offset).limit(limit)
        result = await db.execute(stmt)
        devices = result.scalars().all()

        return list(devices)

    @staticmethod
    @safe_database_query("count_devices", default_return=0)
    async def count_devices(
        db: AsyncSession,
        lifecycle_state: Optional[str] = None,
        discovery_source: Optional[str] = None,
    ) -> int:
        """Count devices with optional filtering."""
        from sqlalchemy import func

        stmt = select(func.count(Device.id))

        if lifecycle_state:
            stmt = stmt.where(Device.lifecycle_state == lifecycle_state)

        if discovery_source:
            stmt = stmt.where(Device.discovery_source == discovery_source)

        result = await db.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    @safe_database_query("get_device")
    @log_database_operation("device retrieval", level="debug")
    async def get_device(db: AsyncSession, device_id: UUID) -> Optional[Device]:
        """
        Get a device by ID.

        Args:
            db: Database session
            device_id: Device UUID

        Returns:
            Device or None
        """
        stmt = (
            select(Device)
            .where(Device.id == device_id)
            .options(selectinload(Device.desktop_session))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_device")
    @log_database_operation("device creation", level="debug")
    async def create_device(
        db: AsyncSession,
        device_data: DeviceCreate,
        created_by: Optional[UUID] = None,
    ) -> Device:
        """
        Create a new device record.

        Args:
            db: Database session
            device_data: Device creation data
            created_by: User who discovered this device

        Returns:
            Created device
        """
        device = Device(
            **device_data.model_dump(),
            created_by=created_by,
        )
        db.add(device)
        await db.commit()
        await db.refresh(device)

        logger.info(f"Device created: {device.hostname} (source: {device.discovery_source})")
        return device

    @staticmethod
    @transactional_database_operation("update_device")
    @log_database_operation("device update", level="debug")
    async def update_device(
        db: AsyncSession,
        device_id: UUID,
        update_data: DeviceUpdate,
    ) -> Optional[Device]:
        """
        Update a device.

        Args:
            db: Database session
            device_id: Device UUID
            update_data: Update data

        Returns:
            Updated device or None
        """
        stmt = select(Device).where(Device.id == device_id)
        result = await db.execute(stmt)
        device = result.scalar_one_or_none()

        if not device:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(device, field, value)

        await db.commit()
        await db.refresh(device)

        return device

    @staticmethod
    @transactional_database_operation("update_device_lifecycle")
    async def update_device_lifecycle(
        db: AsyncSession,
        device_id: UUID,
        new_state: str,
    ) -> Optional[Device]:
        """
        Update device lifecycle state with validation.

        Args:
            db: Database session
            device_id: Device UUID
            new_state: New lifecycle state

        Returns:
            Updated device or None
        """
        stmt = select(Device).where(Device.id == device_id)
        result = await db.execute(stmt)
        device = result.scalar_one_or_none()

        if not device:
            return None

        old_state = device.lifecycle_state
        device.lifecycle_state = new_state
        device.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(device)

        logger.info(f"Device {device.hostname} lifecycle: {old_state} -> {new_state}")
        return device

    @staticmethod
    @transactional_database_operation("sync_from_sessions")
    @log_database_operation("device sync from sessions", level="info")
    async def sync_from_sessions(
        db: AsyncSession,
        active_only: bool = True,
        created_by: Optional[UUID] = None,
    ) -> DiscoveryResult:
        """
        Import/update devices from DesktopSession records.

        Sets lifecycle_state = discovered for all synced devices.
        Does NOT trigger deployment jobs.

        Args:
            db: Database session
            active_only: Only sync active sessions
            created_by: User who triggered the sync

        Returns:
            DiscoveryResult with counts and device list
        """
        # Get desktop sessions
        stmt = select(DesktopSession)
        if active_only:
            stmt = stmt.where(DesktopSession.is_active == True)

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        devices = []
        created_count = 0
        updated_count = 0

        for session in sessions:
            if not session.computer_name:
                continue

            # Check if device already exists (by hostname)
            existing_stmt = select(Device).where(
                Device.hostname == session.computer_name
            )
            existing_result = await db.execute(existing_stmt)
            existing_device = existing_result.scalar_one_or_none()

            if existing_device:
                # Update existing device with session info
                existing_device.ip_address = session.ip_address
                existing_device.desktop_session_id = session.id
                existing_device.last_seen_at = session.last_heartbeat
                existing_device.updated_at = datetime.utcnow()
                devices.append(existing_device)
                updated_count += 1
            else:
                # Create new device in discovered state
                device = Device(
                    hostname=session.computer_name,
                    ip_address=session.ip_address,
                    discovery_source=DeviceDiscoverySource.DESKTOP_SESSION.value,
                    lifecycle_state=DeviceLifecycleState.DISCOVERED.value,
                    desktop_session_id=session.id,
                    last_seen_at=session.last_heartbeat,
                    created_by=created_by,
                )
                db.add(device)
                devices.append(device)
                created_count += 1

        await db.commit()

        # Refresh all devices
        for device in devices:
            await db.refresh(device)

        logger.info(
            f"Synced {len(devices)} devices from desktop sessions "
            f"(created: {created_count}, updated: {updated_count})"
        )
        return DiscoveryResult(
            created_count=created_count,
            updated_count=updated_count,
            devices=devices,
        )

    @staticmethod
    @transactional_database_operation("trigger_install")
    @log_database_operation("device installation trigger", level="info")
    async def trigger_install(
        db: AsyncSession,
        device_id: UUID,
        created_by: UUID,
        username: str,
        password: str,
        credential_type: str = "domain_admin",
        force: bool = False,
    ) -> DeploymentJob:
        """
        Create a deployment job to install NetSupport on a device.

        Args:
            db: Database session
            device_id: Device to install on
            created_by: User triggering the installation
            username: Username for remote access (e.g., DOMAIN\\admin)
            password: Password for remote access
            credential_type: 'local_admin' or 'domain_admin'
            force: Force reinstall even if already installed

        Returns:
            Created deployment job

        Raises:
            ValueError: If device not found or not in valid state
        """
        from core.config import settings

        # Get device
        stmt = select(Device).where(Device.id == device_id)
        result = await db.execute(stmt)
        device = result.scalar_one_or_none()

        if not device:
            raise ValueError(f"Device not found: {device_id}")

        # Validate device state
        valid_states = [
            DeviceLifecycleState.DISCOVERED.value,
            DeviceLifecycleState.INSTALLED_UNENROLLED.value,
        ]
        if not force and device.lifecycle_state not in valid_states:
            raise ValueError(
                f"Cannot install on device in state '{device.lifecycle_state}'. "
                f"Must be one of: {valid_states}"
            )

        # Build job payload matching agent-deployment's expected format
        # See: agent-deployment/src/api/types.rs - JobPayload struct
        payload = {
            # SMB path to installer MSI
            "installerPath": settings.deployment.installer_smb_path,
            # Inline credentials (per-task, not stored in vault)
            "vaultRef": "__inline__",  # Special marker for inline credentials
            "inlineCredentials": {
                "username": username,
                "password": password,  # Worker will use this directly
                "type": credential_type,
            },
            # MSI arguments
            "installArgs": settings.deployment.installer_args,
            # Enrollment token (if configured)
            "enrollToken": settings.deployment.enroll_token or None,
            # Target machines
            "targets": [
                {
                    "hostname": device.hostname,
                    "machineId": str(device.id),
                }
            ],
            # Force restart flag
            "forceRestart": False,
        }

        # Create deployment job
        job = DeploymentJob(
            job_type="msi_install",  # Match agent-deployment JobType enum
            status=DeploymentJobStatus.QUEUED.value,
            payload=payload,
            created_by=created_by,
        )
        db.add(job)

        # Update device state
        device.lifecycle_state = DeviceLifecycleState.INSTALL_PENDING.value

        await db.commit()
        await db.refresh(job)
        await db.refresh(device)

        logger.info(
            f"Created installation job {job.id} for device {device.hostname}"
        )
        return job

    @staticmethod
    @transactional_database_operation("add_device_manual")
    @log_database_operation("manual device addition", level="info")
    async def add_device_manual(
        db: AsyncSession,
        request: ManualAddRequest,
        created_by: UUID,
    ) -> Tuple[Device, bool]:
        """
        Manually add a device to the discovered state.

        Does NOT test reachability.
        Does NOT trigger deployment.

        Args:
            db: Database session
            request: Manual add request with hostname and optional IP
            created_by: User who added the device

        Returns:
            Tuple of (device, is_new) where is_new indicates if device was created
        """
        # Check if device already exists (by hostname)
        existing_stmt = select(Device).where(Device.hostname == request.hostname)
        existing_result = await db.execute(existing_stmt)
        existing_device = existing_result.scalar_one_or_none()

        if existing_device:
            # Update existing device
            if request.ip_address:
                existing_device.ip_address = request.ip_address
            existing_device.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing_device)

            logger.info(f"Updated existing device: {existing_device.hostname}")
            return (existing_device, False)

        # Create new device in discovered state
        device = Device(
            hostname=request.hostname,
            ip_address=request.ip_address,
            discovery_source=DeviceDiscoverySource.MANUAL.value,
            lifecycle_state=DeviceLifecycleState.DISCOVERED.value,
            created_by=created_by,
            last_seen_at=datetime.utcnow(),
        )
        db.add(device)
        await db.commit()
        await db.refresh(device)

        logger.info(f"Manually added device: {device.hostname}")
        return (device, True)

    @staticmethod
    async def _ping_host(ip: str, timeout: float = 1.0) -> bool:
        """
        Check if a host is reachable via ICMP ping.

        Fast, non-intrusive check for host discovery.

        Args:
            ip: IP address to ping
            timeout: Ping timeout in seconds

        Returns:
            True if host responds to ping, False otherwise
        """
        # Build ping command based on platform
        if sys.platform == "win32":
            # Windows: -n count, -w timeout in milliseconds
            cmd = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), ip]
        else:
            # Linux/macOS: -c count, -W timeout in seconds
            cmd = ["ping", "-c", "1", "-W", str(int(timeout)), ip]

        try:
            loop = asyncio.get_event_loop()
            # Run ping in executor to avoid blocking
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: subprocess.run(
                        cmd,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    ).returncode
                ),
                timeout=timeout + 0.5,  # Extra margin for process overhead
            )
            return result == 0
        except (asyncio.TimeoutError, OSError, subprocess.SubprocessError):
            return False

    @staticmethod
    async def _check_deployment_ports(ip: str, timeout: float = 0.5) -> bool:
        """
        Check if a host has deployment ports open (can receive installation).

        Non-credentialed TCP connect check on ports needed for remote installation:
        - Port 445 (SMB): Required for remote file copy
        - Port 135 (RPC): Required for WMI/remote service control

        Args:
            ip: IP address to check
            timeout: Connection timeout in seconds

        Returns:
            True if host can receive remote installation, False otherwise
        """
        # Ports required for remote NetSupport installation
        # SMB (445) is essential for file copy
        # RPC (135) is needed for remote service control
        required_ports = [445]  # SMB is minimum requirement

        async def try_port(port: int) -> bool:
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, port),
                    timeout=timeout,
                )
                writer.close()
                await writer.wait_closed()
                return True
            except (OSError, asyncio.TimeoutError):
                return False

        # Check required ports - all must be open for deployment
        results = await asyncio.gather(*[try_port(p) for p in required_ports])
        return all(results)  # All required ports must be accessible

    @staticmethod
    async def _resolve_hostname(ip: str, timeout: float = 2.0) -> Optional[str]:
        """
        Attempt to resolve hostname from IP via reverse DNS.

        Best effort with timeout - returns None if resolution fails or times out.

        Args:
            ip: IP address to resolve
            timeout: Maximum time to wait for DNS resolution

        Returns:
            Hostname or None
        """
        try:
            loop = asyncio.get_event_loop()
            # Use wait_for to add timeout to DNS resolution
            hostname, _, _ = await asyncio.wait_for(
                loop.run_in_executor(None, socket.gethostbyaddr, ip),
                timeout=timeout,
            )
            # Extract just the hostname (without domain)
            return hostname.split(".")[0].upper()
        except (socket.herror, socket.gaierror, OSError, asyncio.TimeoutError):
            return None

    @staticmethod
    def _get_hosts_from_scan_request(request: NetworkScanRequest) -> List[str]:
        """
        Extract list of IP addresses to scan based on scan type.

        Args:
            request: NetworkScanRequest with scan_type and parameters

        Returns:
            List of IP address strings to scan

        Raises:
            ValueError: If required parameters are missing
        """
        if request.scan_type == "single":
            if not request.ip_address:
                raise ValueError("ip_address is required for single IP scan")
            return [request.ip_address]

        elif request.scan_type == "range":
            if not request.start_ip or not request.end_ip:
                raise ValueError("start_ip and end_ip are required for range scan")

            start = ipaddress.IPv4Address(request.start_ip)
            end = ipaddress.IPv4Address(request.end_ip)

            if start > end:
                raise ValueError("start_ip must be less than or equal to end_ip")

            # Limit range to 1024 addresses
            range_size = int(end) - int(start) + 1
            if range_size > 1024:
                raise ValueError(
                    f"IP range too large ({range_size} addresses). "
                    f"Maximum allowed is 1024 addresses."
                )

            return [str(ipaddress.IPv4Address(ip)) for ip in range(int(start), int(end) + 1)]

        elif request.scan_type == "network":
            if not request.cidr:
                raise ValueError("cidr is required for network scan")

            network = ipaddress.ip_network(request.cidr, strict=False)
            hosts = list(network.hosts())

            # Limit CIDR scan to 1024 addresses
            if len(hosts) > 1024:
                raise ValueError(
                    f"CIDR network too large ({len(hosts)} addresses). "
                    f"Maximum allowed is 1024 addresses."
                )

            return [str(ip) for ip in hosts]

        else:
            raise ValueError(f"Invalid scan_type: {request.scan_type}")

    @staticmethod
    @transactional_database_operation("scan_network")
    @log_database_operation("network scan discovery", level="info")
    async def scan_network(
        db: AsyncSession,
        request: NetworkScanRequest,
        created_by: UUID,
        max_concurrent: int = 100,
    ) -> DiscoveryResult:
        """
        Scan for devices based on scan request using multi-method discovery.

        APPROACH:
        1. ICMP ping sweep + TCP fallback to find reachable hosts
           - First tries ICMP ping (fast)
           - If ping fails, tries TCP connect to port 445 (SMB)
           - This catches hosts that block ICMP but have services running
        2. Port check on reachable hosts to determine deployment readiness
        3. DNS resolution for hostnames

        STRICT SAFEGUARDS:
        - Maximum 1024 addresses per scan
        - Non-credentialed ICMP ping and TCP connect only
        - No service enumeration
        - No OS fingerprinting
        - All discovered devices set to 'discovered' state
        - Does NOT trigger deployment

        Args:
            db: Database session
            request: NetworkScanRequest with scan_type and parameters
            created_by: User who triggered the scan
            max_concurrent: Maximum concurrent ping/connection attempts

        Returns:
            DiscoveryResult with counts, device list, and scan metadata
        """
        # Get list of hosts to scan
        hosts = DeviceService._get_hosts_from_scan_request(request)
        total_hosts = len(hosts)

        scan_desc = {
            "single": f"single IP {request.ip_address}",
            "range": f"range {request.start_ip} - {request.end_ip}",
            "network": f"network {request.cidr}",
        }.get(request.scan_type, request.scan_type)

        logger.info(
            f"Starting {request.scan_type} scan of {scan_desc} "
            f"({total_hosts} hosts) by user {created_by}"
        )

        # Phase 1: Discover reachable hosts via ICMP ping + TCP fallback
        logger.info("Phase 1: Discovering reachable hosts (ping + TCP fallback)...")
        semaphore = asyncio.Semaphore(max_concurrent)
        # Track reachable hosts and whether they were discovered via TCP (ports already known open)
        reachable_hosts: List[Tuple[str, bool]] = []  # (ip, ports_already_checked)

        async def check_host_reachable(ip_str: str):
            """Check if host is reachable via ICMP ping or TCP port 445."""
            async with semaphore:
                # First try ICMP ping (fast)
                if await DeviceService._ping_host(ip_str, timeout=1.0):
                    reachable_hosts.append((ip_str, False))  # Need port check in Phase 2
                    return

                # If ping fails, try TCP connect to port 445 (SMB)
                # This catches hosts that block ICMP but have services running
                if await DeviceService._check_deployment_ports(ip_str, timeout=0.5):
                    reachable_hosts.append((ip_str, True))  # Ports already known open
                    logger.debug(f"Host {ip_str} discovered via TCP fallback (ICMP blocked)")

        # Run all reachability checks concurrently
        await asyncio.gather(*[check_host_reachable(ip) for ip in hosts])
        logger.info(f"Phase 1 complete: {len(reachable_hosts)} hosts are reachable")

        # Phase 2: Check deployment ports on reachable hosts (skip if already checked)
        logger.info("Phase 2: Checking deployment ports and resolving hostnames...")
        scanned_hosts: List[ScannedHost] = []

        async def check_host_details(ip_str: str, ports_already_open: bool) -> ScannedHost:
            async with semaphore:
                # Skip port check if already verified in Phase 1
                can_deploy = ports_already_open or await DeviceService._check_deployment_ports(ip_str, timeout=0.5)
                hostname = await DeviceService._resolve_hostname(ip_str, timeout=2.0)
                if not hostname:
                    hostname = f"UNKNOWN-{ip_str.replace('.', '-')}"
                return ScannedHost(
                    ip=ip_str,
                    hostname=hostname,
                    is_reachable=True,
                    can_receive_install=can_deploy,
                )

        # Check all reachable hosts concurrently
        scanned_hosts = await asyncio.gather(
            *[check_host_details(ip, ports_open) for ip, ports_open in reachable_hosts]
        )

        deployable_count = sum(1 for h in scanned_hosts if h.can_receive_install)
        logger.info(
            f"Phase 2 complete: {deployable_count}/{len(scanned_hosts)} hosts "
            f"have deployment ports open"
        )

        # Phase 3: Create/update device records
        logger.info("Phase 3: Saving device records...")
        devices = []
        created_count = 0
        updated_count = 0

        for host in scanned_hosts:
            # Check if device already exists (by hostname or IP)
            existing_stmt = select(Device).where(
                (Device.hostname == host.hostname) | (Device.ip_address == host.ip)
            )
            existing_result = await db.execute(existing_stmt)
            existing_device = existing_result.scalar_one_or_none()

            if existing_device:
                # Update existing device
                existing_device.ip_address = host.ip
                if host.hostname and not host.hostname.startswith("UNKNOWN-"):
                    existing_device.hostname = host.hostname
                existing_device.last_seen_at = datetime.utcnow()
                existing_device.updated_at = datetime.utcnow()
                devices.append(existing_device)
                updated_count += 1
            else:
                # Create new device in discovered state
                device = Device(
                    hostname=host.hostname,
                    ip_address=host.ip,
                    discovery_source=DeviceDiscoverySource.NETWORK_SCAN.value,
                    lifecycle_state=DeviceLifecycleState.DISCOVERED.value,
                    last_seen_at=datetime.utcnow(),
                    created_by=created_by,
                )
                db.add(device)
                devices.append(device)
                created_count += 1

        await db.commit()

        # Refresh all devices
        for device in devices:
            await db.refresh(device)

        logger.info(
            f"Network scan completed: {len(devices)} devices "
            f"(created: {created_count}, updated: {updated_count})"
        )
        return DiscoveryResult(
            created_count=created_count,
            updated_count=updated_count,
            devices=devices,
            hosts_scanned=total_hosts,
            hosts_reachable=len(reachable_hosts),
            hosts_deployable=deployable_count,
        )

    @staticmethod
    @transactional_database_operation("refresh_all_device_status")
    @log_database_operation("device status refresh", level="info")
    async def refresh_all_device_status(
        db: AsyncSession,
        max_concurrent: int = 50,
    ) -> DiscoveryResult:
        """
        Ping all devices with IP addresses and update their lastSeenAt.

        This refreshes the online/offline status of all devices by pinging them.

        Args:
            db: Database session
            max_concurrent: Maximum concurrent ping operations

        Returns:
            DiscoveryResult with updated devices and counts
        """
        # Get all devices with IP addresses
        stmt = select(Device).where(Device.ip_address.isnot(None))
        result = await db.execute(stmt)
        all_devices = list(result.scalars().all())

        if not all_devices:
            return DiscoveryResult(
                created_count=0,
                updated_count=0,
                devices=[],
                hosts_scanned=0,
                hosts_reachable=0,
            )

        total_devices = len(all_devices)
        logger.info(f"Starting status refresh for {total_devices} devices")

        # Create semaphore for concurrency limiting
        semaphore = asyncio.Semaphore(max_concurrent)

        async def ping_device(device: Device) -> tuple[Device, bool]:
            """Ping a device and return (device, is_reachable)."""
            async with semaphore:
                if not device.ip_address:
                    return device, False
                is_reachable = await DeviceService._ping_host(device.ip_address, timeout=1.0)
                return device, is_reachable

        # Ping all devices concurrently
        results = await asyncio.gather(*[ping_device(d) for d in all_devices])

        # Update lastSeenAt for reachable devices
        updated_count = 0
        reachable_count = 0
        updated_devices = []
        now = datetime.utcnow()

        for device, is_reachable in results:
            if is_reachable:
                reachable_count += 1
                device.last_seen_at = now
                db.add(device)  # Explicitly add to session for change tracking
                updated_count += 1
            updated_devices.append(device)

        # Flush changes to database before commit
        await db.flush()
        await db.commit()

        # Refresh all devices to get updated data
        for device in updated_devices:
            await db.refresh(device)

        logger.info(
            f"Status refresh completed: {total_devices} pinged, "
            f"{reachable_count} online, {updated_count} updated"
        )

        return DiscoveryResult(
            created_count=0,
            updated_count=updated_count,
            devices=updated_devices,
            hosts_scanned=total_devices,
            hosts_reachable=reachable_count,
        )
