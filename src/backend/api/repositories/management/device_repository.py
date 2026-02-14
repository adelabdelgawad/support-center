"""
Device repository for managing Device model.

This repository handles all database operations for devices.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import Device, DesktopSession
from db.enums import DeviceDiscoverySource
from api.repositories.base_repository import BaseRepository


class DeviceRepository(BaseRepository[Device]):
    """Repository for Device operations."""

    model = Device

    @classmethod
    async def list_devices(
        cls,
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

    @classmethod
    async def count_devices(
        cls,
        db: AsyncSession,
        lifecycle_state: Optional[str] = None,
        discovery_source: Optional[str] = None,
    ) -> int:
        """
        Count devices with optional filtering.

        Args:
            db: Database session
            lifecycle_state: Filter by lifecycle state
            discovery_source: Filter by discovery source

        Returns:
            Count of devices
        """
        stmt = select(func.count(Device.id))

        if lifecycle_state:
            stmt = stmt.where(Device.lifecycle_state == lifecycle_state)

        if discovery_source:
            stmt = stmt.where(Device.discovery_source == discovery_source)

        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def find_by_id(cls, db: AsyncSession, device_id: UUID) -> Optional[Device]:
        """
        Get a device by ID with desktop session loaded.

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

    @classmethod
    async def find_by_hostname(
        cls, db: AsyncSession, hostname: str
    ) -> Optional[Device]:
        """
        Find a device by hostname.

        Args:
            db: Database session
            hostname: Device hostname

        Returns:
            Device or None
        """
        stmt = select(Device).where(Device.hostname == hostname)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_ip_or_hostname(
        cls, db: AsyncSession, ip: str, hostname: str
    ) -> Optional[Device]:
        """
        Find a device by IP or hostname.

        Args:
            db: Database session
            ip: IP address
            hostname: Hostname

        Returns:
            Device or None
        """
        stmt = select(Device).where(
            (Device.hostname == hostname) | (Device.ip_address == ip)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_all_with_ip(cls, db: AsyncSession) -> List[Device]:
        """
        Get all devices with IP addresses.

        Args:
            db: Database session

        Returns:
            List of devices with IP addresses
        """
        stmt = select(Device).where(Device.ip_address.isnot(None))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def update_lifecycle_state(
        cls, db: AsyncSession, device_id: UUID, new_state: str
    ) -> Optional[Device]:
        """
        Update device lifecycle state.

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

        device.lifecycle_state = new_state
        device.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(device)

        return device

    @classmethod
    async def update_last_seen(
        cls, db: AsyncSession, device_id: UUID, last_seen: datetime
    ) -> Optional[Device]:
        """
        Update device last_seen timestamp.

        Args:
            db: Database session
            device_id: Device UUID
            last_seen: Last seen timestamp

        Returns:
            Updated device or None
        """
        stmt = select(Device).where(Device.id == device_id)
        result = await db.execute(stmt)
        device = result.scalar_one_or_none()

        if not device:
            return None

        device.last_seen_at = last_seen
        device.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(device)

        return device

    @classmethod
    async def sync_from_desktop_sessions(
        cls,
        db: AsyncSession,
        active_only: bool = True,
        created_by: Optional[UUID] = None,
    ) -> tuple:
        """
        Import/update devices from DesktopSession records.

        Args:
            db: Database session
            active_only: Only sync active sessions
            created_by: User who triggered the sync

        Returns:
            Tuple of (devices list, created_count, updated_count)
        """
        stmt = select(DesktopSession)
        if active_only:
            stmt = stmt.where(DesktopSession.is_active)

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        devices = []
        created_count = 0
        updated_count = 0

        for session in sessions:
            if not session.computer_name:
                continue

            existing_stmt = select(Device).where(
                Device.hostname == session.computer_name
            )
            existing_result = await db.execute(existing_stmt)
            existing_device = existing_result.scalar_one_or_none()

            if existing_device:
                existing_device.ip_address = session.ip_address
                existing_device.desktop_session_id = session.id
                existing_device.last_seen_at = session.last_heartbeat
                existing_device.updated_at = datetime.utcnow()
                devices.append(existing_device)
                updated_count += 1
            else:
                device = Device(
                    hostname=session.computer_name,
                    ip_address=session.ip_address,
                    discovery_source=DeviceDiscoverySource.DESKTOP_SESSION.value,
                    lifecycle_state="discovered",
                    desktop_session_id=session.id,
                    last_seen_at=session.last_heartbeat,
                    created_by=created_by,
                )
                db.add(device)
                devices.append(device)
                created_count += 1

        await db.commit()

        for device in devices:
            await db.refresh(device)

        return devices, created_count, updated_count
