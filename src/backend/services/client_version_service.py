"""
Client Version Service - CRUD operations for version registry.

This service provides management operations for the client version registry.
It handles creating, updating, and querying version records.

Key Operations:
- CRUD for version entries
- Setting latest version (with atomicity guarantee)
- Querying versions by platform (desktop only)
- Installer file upload/download via MinIO

Version Rules (IMPORTANT):
- New versions are ALWAYS set as latest automatically
- New versions MUST be semantically greater than current latest
- Order index is computed from semantic version (not user-provided)
- Platform is always "desktop" (no multi-platform support)
"""

import logging
import os
from datetime import datetime
from typing import AsyncGenerator, List, Optional, Tuple

from fastapi import UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from core.semver import (
    SemanticVersion,
    InvalidVersionError,
    version_greater_than,
)
from models import ClientVersion
from schemas.version import ClientVersionCreate, ClientVersionUpdate
from services.minio_service import MinIOStorageService

logger = logging.getLogger(__name__)

# Allowed installer file extensions
ALLOWED_INSTALLER_EXTENSIONS = {".exe", ".msi"}
# Maximum file size in bytes (50 MB)
MAX_INSTALLER_SIZE = settings.minio.max_file_size_mb * 1024 * 1024


class ClientVersionService:
    """Service for managing client versions."""

    @staticmethod
    @safe_database_query("list_client_versions", default_return=[])
    @log_database_operation("client version listing", level="debug")
    async def list_versions(
        db: AsyncSession,
        platform: Optional[str] = None,
        active_only: bool = True,
    ) -> List[ClientVersion]:
        """
        List client versions with optional filtering.

        Args:
            db: Database session
            platform: Filter by platform (optional)
            active_only: Only return active versions (default: True)

        Returns:
            List of ClientVersion records, ordered by order_index descending
        """
        stmt = select(ClientVersion)

        if active_only:
            stmt = stmt.where(ClientVersion.is_active == True)

        if platform:
            stmt = stmt.where(ClientVersion.platform == platform)

        stmt = stmt.order_by(ClientVersion.order_index.desc())

        result = await db.execute(stmt)
        versions = result.scalars().all()

        logger.debug(
            f"Listed {len(versions)} versions "
            f"(platform={platform}, active_only={active_only})"
        )

        return list(versions)

    @staticmethod
    @safe_database_query("get_client_version")
    @log_database_operation("client version retrieval", level="debug")
    async def get_version(
        db: AsyncSession,
        version_id: int,
    ) -> Optional[ClientVersion]:
        """
        Get a client version by ID.

        Args:
            db: Database session
            version_id: Version ID

        Returns:
            ClientVersion or None if not found
        """
        stmt = select(ClientVersion).where(ClientVersion.id == version_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("get_client_version_by_string")
    async def get_version_by_string(
        db: AsyncSession,
        version_string: str,
        platform: str = "desktop",
    ) -> Optional[ClientVersion]:
        """
        Get a client version by version string and platform.

        Args:
            db: Database session
            version_string: Version string to look up
            platform: Platform to filter by

        Returns:
            ClientVersion or None if not found
        """
        stmt = (
            select(ClientVersion)
            .where(ClientVersion.version_string == version_string)
            .where(ClientVersion.platform == platform)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_client_version")
    @log_database_operation("client version creation", level="info")
    async def create_version(
        db: AsyncSession,
        version_data: ClientVersionCreate,
    ) -> ClientVersion:
        """
        Create a new client version entry.

        New versions are ALWAYS set as latest automatically and must be
        semantically greater than the current latest version.

        Args:
            db: Database session
            version_data: Version creation data

        Returns:
            Created ClientVersion

        Raises:
            ValueError: If version string is invalid, already exists, or is not greater than current latest
        """
        # Platform is always desktop
        platform = "desktop"

        # Validate semantic version format
        try:
            new_semver = SemanticVersion.parse(version_data.version_string)
        except InvalidVersionError as e:
            raise ValueError(str(e))

        # Check for duplicate version string
        existing = await ClientVersionService.get_version_by_string(
            db,
            version_data.version_string,
            platform,
        )

        if existing:
            raise ValueError(
                f"Version '{version_data.version_string}' already exists"
            )

        # Get current latest version
        current_latest = await ClientVersionService.get_latest_version(db, platform)

        # If there's a current latest, new version must be greater
        if current_latest:
            try:
                current_semver = SemanticVersion.parse(current_latest.version_string)
                if new_semver <= current_semver:
                    raise ValueError(
                        f"New version '{version_data.version_string}' must be greater than "
                        f"current latest '{current_latest.version_string}'. "
                        f"Downgrade or equal versions are not allowed."
                    )
            except InvalidVersionError:
                # Current latest has invalid version format (legacy data)
                # Allow the new version to proceed
                logger.warning(
                    f"Current latest version '{current_latest.version_string}' has "
                    f"invalid semantic version format. Allowing new version."
                )

        # Compute order_index from semantic version
        order_index = new_semver.to_order_index()

        # Unset any existing latest (new version is ALWAYS latest)
        await ClientVersionService._unset_latest_for_platform(db, platform)

        # Handle released_at timezone - convert to naive datetime if timezone-aware
        released_at = version_data.released_at
        if released_at is not None and released_at.tzinfo is not None:
            # Convert to naive datetime by removing timezone info
            released_at = released_at.replace(tzinfo=None)

        # Create the version - always desktop, always latest
        version = ClientVersion(
            version_string=version_data.version_string,
            platform=platform,
            order_index=order_index,
            is_latest=True,  # ALWAYS latest on create
            is_enforced=version_data.is_enforced if version_data.is_enforced is not None else False,
            is_active=True,
            release_notes=version_data.release_notes,
            released_at=released_at,
            # Upgrade distribution metadata (Phase 7.1)
            installer_url=version_data.installer_url,
            silent_install_args=version_data.silent_install_args,
        )
        db.add(version)
        await db.commit()
        await db.refresh(version)

        logger.info(
            f"Created client version: {version.version_string} "
            f"(order_index={version.order_index}, is_latest=True)"
        )

        return version

    @staticmethod
    @transactional_database_operation("update_client_version")
    @log_database_operation("client version update", level="info")
    async def update_version(
        db: AsyncSession,
        version_id: int,
        update_data: ClientVersionUpdate,
    ) -> Optional[ClientVersion]:
        """
        Update a client version.

        Args:
            db: Database session
            version_id: Version ID to update
            update_data: Fields to update

        Returns:
            Updated ClientVersion or None if not found
        """
        # Fetch the version
        version = await ClientVersionService.get_version(db, version_id)
        if not version:
            return None

        # Get update dict (exclude unset fields)
        update_dict = update_data.model_dump(exclude_unset=True)

        # If setting as latest, unset any existing latest for this platform
        if update_dict.get("is_latest") is True:
            platform = update_dict.get("platform", version.platform)
            await ClientVersionService._unset_latest_for_platform(db, platform)

        # Apply updates
        for field, value in update_dict.items():
            setattr(version, field, value)

        await db.commit()
        await db.refresh(version)

        logger.info(
            f"Updated client version {version_id}: {update_dict}"
        )

        return version

    @staticmethod
    @transactional_database_operation("set_latest_version")
    @log_database_operation("set latest version", level="info")
    async def set_latest_version(
        db: AsyncSession,
        version_id: int,
    ) -> Optional[ClientVersion]:
        """
        Set a version as the latest for its platform.

        This atomically:
        1. Unsets is_latest on all versions for the platform
        2. Sets is_latest on the specified version

        Args:
            db: Database session
            version_id: Version ID to set as latest

        Returns:
            Updated ClientVersion or None if not found
        """
        # Fetch the version
        version = await ClientVersionService.get_version(db, version_id)
        if not version:
            return None

        # Unset any existing latest for this platform
        await ClientVersionService._unset_latest_for_platform(db, version.platform)

        # Set this version as latest
        version.is_latest = True
        await db.commit()
        await db.refresh(version)

        logger.info(
            f"Set version '{version.version_string}' as latest "
            f"for platform '{version.platform}'"
        )

        return version

    @staticmethod
    @transactional_database_operation("delete_client_version")
    @log_database_operation("client version deletion", level="info")
    async def delete_version(
        db: AsyncSession,
        version_id: int,
        hard_delete: bool = False,
    ) -> bool:
        """
        Delete or deactivate a client version.

        Args:
            db: Database session
            version_id: Version ID to delete
            hard_delete: If True, permanently delete. If False, soft delete (set is_active=False)

        Returns:
            True if deleted/deactivated, False if not found
        """
        version = await ClientVersionService.get_version(db, version_id)
        if not version:
            return False

        if hard_delete:
            await db.delete(version)
            logger.info(f"Hard deleted client version {version_id}")
        else:
            version.is_active = False
            version.is_latest = False  # Can't be latest if inactive
            version.is_enforced = False  # Can't be enforced if inactive
            logger.info(f"Soft deleted (deactivated) client version {version_id}")

        await db.commit()
        return True

    @staticmethod
    @safe_database_query("get_latest_version")
    async def get_latest_version(
        db: AsyncSession,
        platform: str = "desktop",
    ) -> Optional[ClientVersion]:
        """
        Get the latest version for a platform.

        Args:
            db: Database session
            platform: Platform to get latest for

        Returns:
            ClientVersion marked as latest, or None if none set
        """
        stmt = (
            select(ClientVersion)
            .where(ClientVersion.platform == platform)
            .where(ClientVersion.is_active == True)
            .where(ClientVersion.is_latest == True)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def _unset_latest_for_platform(
        db: AsyncSession,
        platform: str,
    ) -> None:
        """
        Internal method to unset is_latest for all versions of a platform.

        Args:
            db: Database session
            platform: Platform to unset latest for
        """
        stmt = (
            update(ClientVersion)
            .where(ClientVersion.platform == platform)
            .where(ClientVersion.is_latest == True)
            .values(is_latest=False)
        )
        await db.execute(stmt)
        logger.debug(f"Unset is_latest for platform '{platform}'")

    # =========================================================================
    # INSTALLER FILE MANAGEMENT
    # =========================================================================

    @staticmethod
    def _validate_installer_file(
        filename: str,
        file_size: int,
    ) -> None:
        """
        Validate installer file before upload.

        Args:
            filename: Original filename
            file_size: File size in bytes

        Raises:
            ValueError: If file validation fails
        """
        # Validate extension
        ext = os.path.splitext(filename.lower())[1]
        if ext not in ALLOWED_INSTALLER_EXTENSIONS:
            raise ValueError(
                f"Invalid file type '{ext}'. Allowed: {', '.join(ALLOWED_INSTALLER_EXTENSIONS)}"
            )

        # Validate size
        if file_size > MAX_INSTALLER_SIZE:
            max_mb = settings.minio.max_file_size_mb
            raise ValueError(
                f"File size exceeds maximum of {max_mb}MB"
            )

    @staticmethod
    def _build_installer_object_key(version_id: int, filename: str) -> str:
        """
        Build MinIO object key for installer file.

        Format: client-installers/{version_id}/{filename}

        Args:
            version_id: Client version ID
            filename: Original filename

        Returns:
            Object key string
        """
        # Sanitize filename (keep only alphanumeric, dots, hyphens, underscores)
        safe_filename = "".join(
            c if c.isalnum() or c in ".-_" else "_"
            for c in filename
        )
        return f"client-installers/{version_id}/{safe_filename}"

    @staticmethod
    @transactional_database_operation("upload_installer")
    @log_database_operation("installer upload", level="info")
    async def upload_installer(
        db: AsyncSession,
        version_id: int,
        file: UploadFile,
        base_url: str,
    ) -> ClientVersion:
        """
        Upload installer file to MinIO and update version record.

        This method:
        1. Validates file extension (.exe, .msi) and size
        2. Uploads to MinIO: client-installers/{version_id}/{filename}
        3. Updates installer_object_key and installer_url

        Args:
            db: Database session
            version_id: Client version ID
            file: Uploaded file
            base_url: Base URL for generating download URL

        Returns:
            Updated ClientVersion

        Raises:
            ValueError: If version not found or file validation fails
        """
        # Fetch version
        version = await ClientVersionService.get_version(db, version_id)
        if not version:
            raise ValueError(f"Version {version_id} not found")

        # Get filename
        filename = file.filename or f"installer_{version_id}"

        # Read file content
        content = await file.read()
        file_size = len(content)

        # Validate file
        ClientVersionService._validate_installer_file(filename, file_size)

        # Build object key
        object_key = ClientVersionService._build_installer_object_key(
            version_id, filename
        )

        # Determine content type
        ext = os.path.splitext(filename.lower())[1]
        content_type = (
            "application/x-msdownload" if ext == ".exe"
            else "application/x-msi"
        )

        # Delete old installer if exists
        if version.installer_object_key:
            try:
                await MinIOStorageService.delete_file(version.installer_object_key)
                logger.info(
                    f"Deleted old installer: {version.installer_object_key}"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to delete old installer: {e}"
                )

        # Upload to MinIO
        await MinIOStorageService.upload_file(
            object_key=object_key,
            content=content,
            content_type=content_type,
            metadata={
                "version_id": str(version_id),
                "version_string": version.version_string,
                "original_filename": filename,
            },
        )

        # Generate download URL (backend proxy)
        download_url = f"{base_url.rstrip('/')}/api/v1/client-versions/{version_id}/installer/download"

        # Update version record
        version.installer_object_key = object_key
        version.installer_url = download_url

        await db.commit()
        await db.refresh(version)

        logger.info(
            f"Uploaded installer for version {version_id}: "
            f"{object_key} ({file_size} bytes)"
        )

        return version

    @staticmethod
    async def get_installer_info(
        db: AsyncSession,
        version_id: int,
    ) -> Optional[Tuple[str, str]]:
        """
        Get installer file info for download.

        Args:
            db: Database session
            version_id: Client version ID

        Returns:
            Tuple of (object_key, filename) or None if not found
        """
        version = await ClientVersionService.get_version(db, version_id)
        if not version or not version.installer_object_key:
            return None

        # Extract filename from object key
        filename = version.installer_object_key.split("/")[-1]
        return (version.installer_object_key, filename)

    @staticmethod
    async def download_installer(
        db: AsyncSession,
        version_id: int,
    ) -> Optional[Tuple[bytes, str, str]]:
        """
        Download installer file from MinIO.

        Args:
            db: Database session
            version_id: Client version ID

        Returns:
            Tuple of (content, filename, content_type) or None if not found
        """
        info = await ClientVersionService.get_installer_info(db, version_id)
        if not info:
            return None

        object_key, filename = info

        # Download from MinIO
        content = await MinIOStorageService.download_file(object_key)
        if content is None:
            return None

        # Determine content type
        ext = os.path.splitext(filename.lower())[1]
        content_type = (
            "application/x-msdownload" if ext == ".exe"
            else "application/x-msi"
        )

        return (content, filename, content_type)
