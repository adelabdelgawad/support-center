"""
Version Policy Service - Pure stateless policy resolution.

This service provides the core Version Authority logic for Capability 1.
It is designed as a pure function with no side effects.

Design Principles:
- Pure function: same inputs always produce same outputs
- No database writes
- No side effects
- Deterministic ordering via order_index (no semantic version comparison)
- Stateless evaluation

Invariants (DO NOT BREAK):
- Policy evaluated on every fetch (not stored in session)
- Version strings are opaque (no semantic comparison)
- Server is always authoritative via order_index
- Visual only - no blocking, no commands, no updates
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import safe_database_query
from models import ClientVersion

logger = logging.getLogger(__name__)


class VersionStatus(str, Enum):
    """Version status as returned by policy resolution."""

    OK = "ok"  # Running latest or acceptable version
    OUTDATED = "outdated"  # Newer version available (soft notification)
    OUTDATED_ENFORCED = "outdated_enforced"  # Update strongly recommended
    UNKNOWN = "unknown"  # Version not in registry


@dataclass(frozen=True)
class VersionPolicyResult:
    """
    Result of version policy resolution - immutable.

    This dataclass is frozen to ensure immutability and thread safety.
    Includes upgrade distribution metadata for enforcement rejections.
    """

    version_status: VersionStatus
    target_version_id: Optional[int]
    target_version_string: Optional[str]
    is_enforced: bool
    # Upgrade distribution metadata (included when enforcement rejects)
    installer_url: Optional[str] = None
    silent_install_args: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        result = {
            "version_status": self.version_status.value,
            "target_version_id": self.target_version_id,
            "target_version_string": self.target_version_string,
            "is_enforced": self.is_enforced,
        }
        # Include installer metadata only if configured
        if self.installer_url:
            result["installer_url"] = self.installer_url
        if self.silent_install_args:
            result["silent_install_args"] = self.silent_install_args
        return result


class VersionPolicyService:
    """
    Pure stateless service for resolving version policy.

    This service implements the Version Authority policy resolution.
    All methods are static and pure (no side effects).

    Policy Rules:
    - Version not in registry -> UNKNOWN
    - Version == latest -> OK
    - Version < latest, not enforced -> OUTDATED
    - Version < latest, enforced -> OUTDATED_ENFORCED
    """

    @staticmethod
    def resolve_version_policy(
        client_version_string: str,
        platform: str,
        version_registry: List[ClientVersion],
    ) -> VersionPolicyResult:
        """
        Resolve version policy for a client.

        This is a PURE FUNCTION with no side effects.

        Args:
            client_version_string: Version string reported by client (from session.app_version)
            platform: Platform identifier ('desktop', 'web', 'mobile')
            version_registry: List of active ClientVersion records
                             (pre-filtered by platform and is_active=True)

        Returns:
            VersionPolicyResult with status and target version info

        Resolution Rules (in order):
        1. If version not in registry -> UNKNOWN
        2. If version == latest -> OK
        3. If version < latest and latest.is_enforced -> OUTDATED_ENFORCED
        4. If version < latest and not enforced -> OUTDATED
        """
        # Filter registry to platform and active (defensive - should already be filtered)
        platform_versions = [
            v for v in version_registry if v.platform == platform and v.is_active
        ]

        if not platform_versions:
            # No versions registered for platform - cannot evaluate
            logger.debug(
                f"No versions registered for platform '{platform}', "
                f"client version '{client_version_string}' -> UNKNOWN"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.UNKNOWN,
                target_version_id=None,
                target_version_string=None,
                is_enforced=False,
            )

        # Find the client's version in registry (exact string match)
        client_version = next(
            (v for v in platform_versions if v.version_string == client_version_string),
            None,
        )

        if client_version is None:
            # Unknown version - not in registry
            logger.debug(
                f"Version '{client_version_string}' not found in registry "
                f"for platform '{platform}' -> UNKNOWN"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.UNKNOWN,
                target_version_id=None,
                target_version_string=None,
                is_enforced=False,
            )

        # Find the latest version for this platform
        latest_version = next(
            (v for v in platform_versions if v.is_latest),
            None,
        )

        if latest_version is None:
            # No latest designated - treat all registered versions as OK
            logger.debug(
                f"No latest version designated for platform '{platform}', "
                f"treating '{client_version_string}' as OK"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.OK,
                target_version_id=client_version.id,
                target_version_string=client_version.version_string,
                is_enforced=False,
            )

        # Check if client is on latest
        if client_version.version_string == latest_version.version_string:
            logger.debug(
                f"Client on latest version '{client_version_string}' -> OK"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.OK,
                target_version_id=latest_version.id,
                target_version_string=latest_version.version_string,
                is_enforced=False,
            )

        # Compare order_index to determine if client is behind
        # Higher order_index = newer version
        if client_version.order_index >= latest_version.order_index:
            # Client version has higher or equal order_index
            # This is an edge case (registry inconsistency) - treat as OK to be safe
            logger.warning(
                f"Client version '{client_version_string}' (order_index={client_version.order_index}) "
                f"has >= order_index than latest '{latest_version.version_string}' "
                f"(order_index={latest_version.order_index}) -> treating as OK"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.OK,
                target_version_id=latest_version.id,
                target_version_string=latest_version.version_string,
                is_enforced=False,
            )

        # Client is on older version (order_index < latest.order_index)
        # Check if enforcement is enabled on the LATEST version
        if latest_version.is_enforced:
            logger.debug(
                f"Client on outdated version '{client_version_string}' "
                f"(order_index={client_version.order_index}), "
                f"latest='{latest_version.version_string}' (enforced) -> OUTDATED_ENFORCED"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.OUTDATED_ENFORCED,
                target_version_id=latest_version.id,
                target_version_string=latest_version.version_string,
                is_enforced=True,
                # Include installer metadata for enforced updates
                installer_url=getattr(latest_version, "installer_url", None),
                silent_install_args=getattr(latest_version, "silent_install_args", None),
            )
        else:
            logger.debug(
                f"Client on outdated version '{client_version_string}' "
                f"(order_index={client_version.order_index}), "
                f"latest='{latest_version.version_string}' (not enforced) -> OUTDATED"
            )
            return VersionPolicyResult(
                version_status=VersionStatus.OUTDATED,
                target_version_id=latest_version.id,
                target_version_string=latest_version.version_string,
                is_enforced=False,
                # Include installer metadata for soft updates (informational)
                installer_url=getattr(latest_version, "installer_url", None),
                silent_install_args=getattr(latest_version, "silent_install_args", None),
            )

    @staticmethod
    @safe_database_query("get_version_registry", default_return=[])
    async def get_version_registry(
        db: AsyncSession,
        platform: str = "desktop",
    ) -> List[ClientVersion]:
        """
        Fetch active versions for a platform from the database.

        This method is separate from the pure resolution function
        to maintain separation of concerns.

        Args:
            db: Database session
            platform: Platform to filter by (default: 'desktop')

        Returns:
            List of active ClientVersion records for the platform,
            sorted by order_index descending (newest first)
        """
        stmt = (
            select(ClientVersion)
            .where(ClientVersion.platform == platform)
            .where(ClientVersion.is_active == True)
            .order_by(ClientVersion.order_index.desc())
        )

        result = await db.execute(stmt)
        versions = result.scalars().all()

        logger.debug(
            f"Fetched {len(versions)} active versions for platform '{platform}'"
        )

        return list(versions)

    @staticmethod
    async def resolve_for_session(
        db: AsyncSession,
        client_version_string: str,
        platform: str = "desktop",
    ) -> VersionPolicyResult:
        """
        Convenience method to resolve policy for a session.

        Fetches the version registry and calls the pure resolution function.

        Args:
            db: Database session
            client_version_string: Version string from client
            platform: Platform identifier

        Returns:
            VersionPolicyResult
        """
        # Fetch version registry
        version_registry = await VersionPolicyService.get_version_registry(
            db, platform
        )

        # Resolve policy using pure function
        return VersionPolicyService.resolve_version_policy(
            client_version_string=client_version_string,
            platform=platform,
            version_registry=version_registry,
        )
