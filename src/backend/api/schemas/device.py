"""
Device schemas for API validation and serialization.

Used by the Deployment Control Plane for device discovery and management.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel
from db.enums import DeviceDiscoverySource, DeviceLifecycleState


class DeviceBase(HTTPSchemaModel):
    """Base device schema with common fields."""

    hostname: str = Field(..., min_length=1, max_length=255)
    ip_address: Optional[str] = Field(None, max_length=45)
    mac_address: Optional[str] = Field(None, max_length=17)


class DeviceCreate(DeviceBase):
    """Schema for creating a device during discovery."""

    discovery_source: str = Field(..., description="Discovery source (ad, network_scan, desktop_session)")
    ad_computer_dn: Optional[str] = Field(None, max_length=500)
    desktop_session_id: Optional[UUID] = None

    @field_validator("discovery_source")
    @classmethod
    def validate_discovery_source(cls, v: str) -> str:
        """Validate discovery source is a valid enum value."""
        valid_sources = [s.value for s in DeviceDiscoverySource]
        if v not in valid_sources:
            raise ValueError(f"discovery_source must be one of: {valid_sources}")
        return v


class DeviceUpdate(HTTPSchemaModel):
    """Schema for updating a device."""

    lifecycle_state: Optional[str] = None
    ip_address: Optional[str] = Field(None, max_length=45)
    mac_address: Optional[str] = Field(None, max_length=17)
    last_seen_at: Optional[datetime] = None
    desktop_session_id: Optional[UUID] = None

    @field_validator("lifecycle_state")
    @classmethod
    def validate_lifecycle_state(cls, v: Optional[str]) -> Optional[str]:
        """Validate lifecycle state is a valid enum value."""
        if v is None:
            return v
        valid_states = [s.value for s in DeviceLifecycleState]
        if v not in valid_states:
            raise ValueError(f"lifecycle_state must be one of: {valid_states}")
        return v


class DeviceRead(DeviceBase):
    """Schema for reading device data."""

    id: UUID
    lifecycle_state: str
    discovery_source: str
    ad_computer_dn: Optional[str] = None
    desktop_session_id: Optional[UUID] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    has_active_session: bool = False


class DeviceListItem(HTTPSchemaModel):
    """Lightweight schema for device lists."""

    id: UUID
    hostname: str
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    lifecycle_state: str
    discovery_source: str
    ad_computer_dn: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    has_active_session: bool = False
    is_online: bool = False


class DeviceListResponse(HTTPSchemaModel):
    """Response schema for device list endpoint."""

    devices: list[DeviceListItem]
    total: int


# Discovery request schemas


class ADDiscoveryRequest(HTTPSchemaModel):
    """Request schema for AD discovery."""

    search_base: Optional[str] = Field(
        None,
        description="Override AD base DN for search",
    )
    filter_pattern: Optional[str] = Field(
        None,
        description="Custom LDAP filter pattern",
    )


class SubnetScanRequest(HTTPSchemaModel):
    """Request schema for subnet scan discovery."""

    subnet: str = Field(
        ...,
        description="CIDR notation (e.g., 192.168.1.0/24)",
    )
    ports: list[int] = Field(
        default=[445, 3389],
        description="Ports to scan for device identification",
    )


class SessionSyncRequest(HTTPSchemaModel):
    """Request schema for syncing devices from DesktopSessions."""

    active_only: bool = Field(
        default=True,
        description="Only sync devices with active sessions",
    )


class ManualAddRequest(HTTPSchemaModel):
    """Request schema for manually adding a device."""

    hostname: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Device hostname or computer name",
    )
    ip_address: Optional[str] = Field(
        None,
        max_length=45,
        description="Device IP address (optional)",
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional description (e.g., Finance laptop)",
    )

    @field_validator("hostname")
    @classmethod
    def validate_hostname(cls, v: str) -> str:
        """Validate hostname is a valid string."""
        v = v.strip()
        if not v:
            raise ValueError("hostname cannot be empty")
        return v


class NetworkScanRequest(HTTPSchemaModel):
    """Request schema for network scan discovery.

    Supports multiple scan types with strict validation.
    """

    scan_type: str = Field(
        ...,
        description="Scan type: 'single', 'range', or 'network'",
    )
    # For single IP scan
    ip_address: Optional[str] = Field(
        None,
        description="Single IP address to scan (for scan_type='single')",
    )
    # For IP range scan
    start_ip: Optional[str] = Field(
        None,
        description="Start IP address (for scan_type='range')",
    )
    end_ip: Optional[str] = Field(
        None,
        description="End IP address (for scan_type='range')",
    )
    # For CIDR network scan
    cidr: Optional[str] = Field(
        None,
        description="CIDR notation (for scan_type='network'). Maximum size is /24.",
    )

    @field_validator("scan_type")
    @classmethod
    def validate_scan_type(cls, v: str) -> str:
        """Validate scan type."""
        valid_types = ["single", "range", "network"]
        if v not in valid_types:
            raise ValueError(f"scan_type must be one of: {valid_types}")
        return v

    @staticmethod
    def _validate_ipv4(ip: str) -> bool:
        """Validate IPv4 address format."""
        if not ip or not ip.strip():
            return False
        parts = ip.strip().split(".")
        if len(parts) != 4:
            return False
        for part in parts:
            try:
                num = int(part)
                if num < 0 or num > 255 or part != str(num):
                    return False
            except ValueError:
                return False
        return True

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v: Optional[str]) -> Optional[str]:
        """Validate single IP address."""
        if v is None:
            return v
        v = v.strip()
        if not cls._validate_ipv4(v):
            raise ValueError("Invalid IP address format (e.g., 192.168.1.1)")
        return v

    @field_validator("start_ip")
    @classmethod
    def validate_start_ip(cls, v: Optional[str]) -> Optional[str]:
        """Validate start IP address."""
        if v is None:
            return v
        v = v.strip()
        if not cls._validate_ipv4(v):
            raise ValueError("Invalid start IP address format")
        return v

    @field_validator("end_ip")
    @classmethod
    def validate_end_ip(cls, v: Optional[str]) -> Optional[str]:
        """Validate end IP address."""
        if v is None:
            return v
        v = v.strip()
        if not cls._validate_ipv4(v):
            raise ValueError("Invalid end IP address format")
        return v

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, v: Optional[str]) -> Optional[str]:
        """Validate CIDR is properly formatted and within size limits."""
        if v is None:
            return v
        import ipaddress

        v = v.strip()
        try:
            network = ipaddress.ip_network(v, strict=False)
        except ValueError as e:
            raise ValueError(f"Invalid CIDR notation: {e}")

        # Enforce maximum /24 subnet size
        if network.prefixlen < 24:
            raise ValueError(
                f"Network too large: /{network.prefixlen}. "
                f"Maximum allowed size is /24 (256 addresses)."
            )

        return str(network)


class DiscoveryResponse(HTTPSchemaModel):
    """Response schema for discovery operations."""

    created_count: int = Field(
        ...,
        description="Number of new devices created",
    )
    updated_count: int = Field(
        ...,
        description="Number of existing devices updated",
    )
    total_count: int = Field(
        ...,
        description="Total devices processed",
    )
    devices: list[DeviceListItem] = Field(
        default_factory=list,
        description="List of created/updated devices",
    )
    # Network scan metadata (only populated for network scans)
    hosts_scanned: Optional[int] = Field(
        None,
        description="Total number of IP addresses scanned",
    )
    hosts_reachable: Optional[int] = Field(
        None,
        description="Number of hosts that responded to ping",
    )
    hosts_deployable: Optional[int] = Field(
        None,
        description="Number of hosts with deployment ports open (can receive installation)",
    )


class InstallCredentials(HTTPSchemaModel):
    """Inline credentials for deployment (per-task, not stored)."""

    username: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Username for remote access (e.g., DOMAIN\\admin or admin@domain.com)",
    )
    password: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Password for remote access",
    )
    credential_type: str = Field(
        default="domain_admin",
        description="Credential type: 'local_admin' or 'domain_admin'",
    )

    @field_validator("credential_type")
    @classmethod
    def validate_credential_type(cls, v: str) -> str:
        """Validate credential type."""
        valid_types = ["local_admin", "domain_admin"]
        if v not in valid_types:
            raise ValueError(f"credential_type must be one of: {valid_types}")
        return v


class InstallRequest(HTTPSchemaModel):
    """Request schema for triggering device installation."""

    credentials: InstallCredentials = Field(
        ...,
        description="Credentials for remote installation",
    )
    force: bool = Field(
        default=False,
        description="Force reinstall even if already installed",
    )
