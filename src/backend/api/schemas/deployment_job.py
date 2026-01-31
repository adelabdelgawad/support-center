"""
DeploymentJob schemas for API validation and serialization.

Used by the Deployment Control Plane for managing deployment jobs.
Jobs are immutable after creation - payload cannot be modified.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel
from db.enums import DeploymentJobStatus


class DeploymentJobBase(HTTPSchemaModel):
    """Base deployment job schema."""

    job_type: str = Field(..., max_length=100, description="Job type (e.g., 'netsupport_install')")


class DeploymentJobCreate(DeploymentJobBase):
    """Schema for creating a deployment job."""

    payload: dict = Field(
        ...,
        description="Immutable execution plan (targets, installer info, constraints)",
    )


class DeploymentJobRead(DeploymentJobBase):
    """Schema for reading deployment job data."""

    id: UUID
    status: str
    payload: dict
    created_by: Optional[UUID] = None
    created_at: datetime
    claimed_by: Optional[str] = None
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[dict] = None
    error_message: Optional[str] = None


class DeploymentJobListItem(HTTPSchemaModel):
    """Lightweight schema for job lists."""

    id: UUID
    job_type: str
    status: str
    payload: dict
    created_at: datetime
    claimed_by: Optional[str] = None
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class DeploymentJobListResponse(HTTPSchemaModel):
    """Response schema for deployment job list endpoint."""

    jobs: list[DeploymentJobListItem]
    total: int


# Worker API schemas


class DeploymentJobClaim(HTTPSchemaModel):
    """Schema for worker to claim a job."""

    worker_id: str = Field(..., max_length=255, description="Unique worker identifier")


class PerTargetResult(HTTPSchemaModel):
    """Result for a single target in a deployment job."""

    device_id: UUID
    result: str = Field(..., description="'success' or 'failure'")
    exit_code: Optional[int] = None
    error_message: Optional[str] = None


class DeploymentJobResult(HTTPSchemaModel):
    """Schema for worker to report job completion."""

    status: str = Field(..., description="'done' or 'failed'")
    per_target: list[PerTargetResult] = Field(
        default_factory=list,
        description="Per-target results",
    )
    error_message: Optional[str] = Field(
        None,
        description="Overall error message if job failed",
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        """Validate status is a valid completion status."""
        valid_statuses = [DeploymentJobStatus.DONE.value, DeploymentJobStatus.FAILED.value]
        if v not in valid_statuses:
            raise ValueError(f"status must be one of: {valid_statuses}")
        return v


# Payload schema for NetSupport installation


class InstallerInfo(HTTPSchemaModel):
    """Installer information for deployment."""

    url: str = Field(..., description="Signed installer URL")
    silent_args: str = Field(
        default="/qn /norestart",
        description="Silent installation arguments",
    )


class TargetDevice(HTTPSchemaModel):
    """Target device for deployment."""

    device_id: UUID
    hostname: str
    ip: Optional[str] = None


class DeploymentConstraints(HTTPSchemaModel):
    """Constraints for deployment execution."""

    timeout_minutes: int = Field(default=15, ge=1, le=120)
    max_parallel: int = Field(default=1, ge=1, le=10)


class NetSupportInstallPayload(HTTPSchemaModel):
    """Payload schema for NetSupport installation job."""

    targets: list[TargetDevice]
    installer: InstallerInfo
    credential_ref: Optional[UUID] = None
    constraints: DeploymentConstraints = Field(default_factory=DeploymentConstraints)
