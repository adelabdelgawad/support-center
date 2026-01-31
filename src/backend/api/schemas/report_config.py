"""Report Configuration schemas for API requests/responses."""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel


class ReportType(str, Enum):
    """Available report types."""
    EXECUTIVE = "executive"
    AGENT_PERFORMANCE = "agent_performance"
    SLA_COMPLIANCE = "sla_compliance"
    VOLUME = "volume"
    CATEGORY_ANALYSIS = "category_analysis"
    BUSINESS_UNIT = "business_unit"
    CUSTOM = "custom"


class UserInfo(HTTPSchemaModel):
    """Minimal user info for nested responses."""
    id: UUID
    username: str
    full_name: Optional[str] = None


class ReportConfigBase(HTTPSchemaModel):
    """Base report config schema with common fields."""
    name: str = Field(..., min_length=2, max_length=100, description="Report name")
    description: Optional[str] = Field(None, max_length=500, description="Report description")
    report_type: str = Field(..., description="Report type: executive, agent_performance, sla_compliance, volume, custom")
    filters: Dict[str, Any] = Field(default_factory=dict, description="Report filters")
    display_config: Dict[str, Any] = Field(default_factory=dict, description="Display configuration")

    @field_validator("report_type")
    @classmethod
    def validate_report_type(cls, v: str) -> str:
        valid_types = [rt.value for rt in ReportType]
        if v not in valid_types:
            raise ValueError(f"report_type must be one of: {', '.join(valid_types)}")
        return v


class ReportConfigCreate(ReportConfigBase):
    """Schema for creating a new report config."""
    schedule_cron: Optional[str] = Field(None, max_length=100, description="Cron expression for scheduling")
    recipients: Optional[List[str]] = Field(None, description="Email addresses for scheduled delivery")
    is_public: bool = Field(False, description="Whether report is visible to others")


class ReportConfigUpdate(HTTPSchemaModel):
    """Schema for updating a report config."""
    name: Optional[str] = Field(None, min_length=2, max_length=100, description="Report name")
    description: Optional[str] = Field(None, max_length=500, description="Report description")
    report_type: Optional[str] = Field(None, description="Report type")
    filters: Optional[Dict[str, Any]] = Field(None, description="Report filters")
    display_config: Optional[Dict[str, Any]] = Field(None, description="Display configuration")
    schedule_cron: Optional[str] = Field(None, max_length=100, description="Cron expression for scheduling")
    recipients: Optional[List[str]] = Field(None, description="Email addresses for scheduled delivery")
    is_public: Optional[bool] = Field(None, description="Whether report is visible to others")
    is_active: Optional[bool] = Field(None, description="Whether this config is active")

    @field_validator("report_type")
    @classmethod
    def validate_report_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        valid_types = [rt.value for rt in ReportType]
        if v not in valid_types:
            raise ValueError(f"report_type must be one of: {', '.join(valid_types)}")
        return v


class ReportConfigRead(ReportConfigBase):
    """Schema for reading a report config."""
    id: int
    schedule_cron: Optional[str] = None
    recipients: Optional[List[str]] = None
    last_run_at: Optional[datetime] = None
    created_by_id: UUID
    is_public: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Nested info
    created_by: Optional[UserInfo] = None


class ReportConfigList(HTTPSchemaModel):
    """Paginated list of report configs."""
    items: List[ReportConfigRead]
    total: int
    page: int
    per_page: int
    pages: int
