"""
Client Version schemas for API validation and serialization.

Supports the Version Authority system with:
- CRUD operations for version registry
- Version policy resolution results

Version Rules:
- New versions are ALWAYS set as latest automatically
- Version must be valid semantic version (e.g., "1.0.0", "2.1.3-beta")
- New version must be greater than current latest
- Platform is always "desktop" (single platform)
- order_index is computed from semantic version (not user-provided)
"""

from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel


def _validate_installer_url(url: Optional[str]) -> Optional[str]:
    """Validate that installer_url is a valid HTTP/HTTPS URL."""
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("installer_url must be an HTTP or HTTPS URL")
        if not parsed.netloc:
            raise ValueError("installer_url must have a valid domain")
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Invalid URL format: {url}")
    return url


class ClientVersionBase(HTTPSchemaModel):
    """Base client version schema with common fields."""

    version_string: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Semantic version string (e.g., '1.0.0', '2.1.3-beta')",
    )
    # Note: platform, order_index, is_latest are server-managed
    is_enforced: bool = Field(
        default=False,
        description="Whether outdated versions should show enforced update status",
    )
    release_notes: Optional[str] = Field(
        default=None,
        description="Optional release notes or changelog",
    )
    released_at: Optional[datetime] = Field(
        default=None,
        description="When this version was released",
    )
    # Upgrade distribution metadata (desktop only)
    installer_url: Optional[str] = Field(
        default=None,
        max_length=500,
        description="URL to download the MSI installer for this version",
    )
    silent_install_args: Optional[str] = Field(
        default="/qn /norestart",
        max_length=100,
        description="Command-line arguments for silent MSI installation",
    )


class ClientVersionCreate(ClientVersionBase):
    """
    Schema for creating a new client version.

    Note:
    - version_string must be valid semantic version
    - New version must be greater than current latest
    - is_latest is ALWAYS set to True (auto-managed)
    - order_index is computed from semantic version
    - platform is always "desktop"
    - installer_url must be valid HTTP/HTTPS URL if provided
    """

    @field_validator("version_string")
    @classmethod
    def validate_version_format(cls, v: str) -> str:
        """Validate semantic version format."""
        from core.semver import SemanticVersion, InvalidVersionError

        try:
            SemanticVersion.parse(v)
        except InvalidVersionError as e:
            raise ValueError(str(e))
        return v

    @field_validator("installer_url")
    @classmethod
    def validate_installer_url_format(cls, v: Optional[str]) -> Optional[str]:
        """Validate installer URL is a valid HTTP/HTTPS URL."""
        return _validate_installer_url(v)


class ClientVersionUpdate(HTTPSchemaModel):
    """
    Schema for updating a client version.

    Note:
    - version_string changes are NOT allowed after creation
    - platform and order_index are server-managed
    - is_latest should use set_latest_version() method
    - installer_url must be valid HTTP/HTTPS URL if provided
    """

    is_enforced: Optional[bool] = Field(
        None,
        description="Whether outdated versions should show enforced status",
    )
    is_active: Optional[bool] = Field(
        None,
        description="Whether this version entry is active",
    )
    release_notes: Optional[str] = Field(
        None,
        description="Optional release notes or changelog",
    )
    released_at: Optional[datetime] = Field(
        None,
        description="When this version was released",
    )
    # Upgrade distribution metadata
    installer_url: Optional[str] = Field(
        None,
        max_length=500,
        description="URL to download the MSI installer for this version",
    )
    silent_install_args: Optional[str] = Field(
        None,
        max_length=100,
        description="Command-line arguments for silent MSI installation",
    )

    @field_validator("installer_url")
    @classmethod
    def validate_installer_url_format(cls, v: Optional[str]) -> Optional[str]:
        """Validate installer URL is a valid HTTP/HTTPS URL."""
        return _validate_installer_url(v)


class ClientVersionRead(HTTPSchemaModel):
    """Schema for reading client version data."""

    id: int
    version_string: str
    platform: str
    order_index: int
    is_latest: bool
    is_enforced: bool
    is_active: bool
    release_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    # Upgrade distribution metadata
    installer_url: Optional[str] = None
    installer_object_key: Optional[str] = None
    silent_install_args: Optional[str] = None
    # Audit fields
    created_at: datetime
    updated_at: datetime


class ClientVersionListItem(HTTPSchemaModel):
    """Schema for client version lists - includes all display fields."""

    id: int
    version_string: str
    platform: str
    order_index: int
    is_latest: bool
    is_enforced: bool
    is_active: bool
    release_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    # Upgrade distribution metadata
    installer_url: Optional[str] = None
    installer_object_key: Optional[str] = None
    silent_install_args: Optional[str] = None
    # Audit fields
    created_at: datetime
    updated_at: datetime


# =============================================================================
# VERSION POLICY RESOLUTION SCHEMAS
# =============================================================================


class VersionPolicyResult(HTTPSchemaModel):
    """
    Result of version policy resolution.

    This schema represents the output of the pure policy resolution function.
    It contains the version status, target version information, and upgrade
    distribution metadata for enforcement rejections.

    Status values:
    - "ok": Client is on latest or acceptable version
    - "outdated": Newer version available (soft notification)
    - "outdated_enforced": Update is strongly recommended (enforced)
    - "unknown": Version not in registry
    """

    version_status: str = Field(
        ...,
        description="Version status: 'ok', 'outdated', 'outdated_enforced', 'unknown'",
    )
    target_version_id: Optional[int] = Field(
        None,
        description="ID of the latest version (for reference)",
    )
    target_version_string: Optional[str] = Field(
        None,
        description="String of the latest version (for UI display)",
    )
    is_enforced: bool = Field(
        default=False,
        description="Whether update enforcement is active",
    )
    # Upgrade distribution metadata (included in enforcement rejections)
    installer_url: Optional[str] = Field(
        None,
        description="URL to download the MSI installer for the target version",
    )
    silent_install_args: Optional[str] = Field(
        None,
        description="Command-line arguments for silent MSI installation",
    )
