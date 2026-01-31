"""SLA Configuration schemas for API requests/responses."""

from datetime import datetime
from typing import Optional, List

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class PriorityInfo(HTTPSchemaModel):
    """Minimal priority info for nested responses."""
    id: int
    name: str


class CategoryInfo(HTTPSchemaModel):
    """Minimal category info for nested responses."""
    id: int
    name: str
    name_en: Optional[str] = None
    name_ar: Optional[str] = None


class BusinessUnitInfo(HTTPSchemaModel):
    """Minimal business unit info for nested responses."""
    id: int
    name: str


class SLAConfigBase(HTTPSchemaModel):
    """Base SLA config schema with common fields."""
    priority_id: int = Field(..., description="Priority level this SLA applies to")
    category_id: Optional[int] = Field(None, description="Optional category override")
    business_unit_id: Optional[int] = Field(None, description="Optional business unit override")
    first_response_minutes: int = Field(..., ge=0, description="Target first response time in minutes")
    resolution_hours: int = Field(..., ge=0, description="Target resolution time in hours")
    business_hours_only: bool = Field(True, description="Calculate SLA during business hours only")


class SLAConfigCreate(SLAConfigBase):
    """Schema for creating a new SLA config."""
    pass


class SLAConfigUpdate(HTTPSchemaModel):
    """Schema for updating an SLA config."""
    priority_id: Optional[int] = Field(None, description="Priority level this SLA applies to")
    category_id: Optional[int] = Field(None, description="Optional category override")
    business_unit_id: Optional[int] = Field(None, description="Optional business unit override")
    first_response_minutes: Optional[int] = Field(None, ge=0, description="Target first response time in minutes")
    resolution_hours: Optional[int] = Field(None, ge=0, description="Target resolution time in hours")
    business_hours_only: Optional[bool] = Field(None, description="Calculate SLA during business hours only")
    is_active: Optional[bool] = Field(None, description="Whether this SLA config is active")


class SLAConfigRead(SLAConfigBase):
    """Schema for reading an SLA config."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Nested info
    priority: Optional[PriorityInfo] = None
    category: Optional[CategoryInfo] = None
    business_unit: Optional[BusinessUnitInfo] = None


class SLAConfigList(HTTPSchemaModel):
    """Paginated list of SLA configs."""
    items: List[SLAConfigRead]
    total: int
    page: int
    per_page: int
    pages: int
