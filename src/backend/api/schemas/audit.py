"""
Audit schemas for tracking user actions and system changes.

Provides comprehensive audit trail with old/new value tracking,
correlation IDs, and user context.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class AuditCreate(HTTPSchemaModel):
    """Schema for creating an audit log entry."""

    user_id: Optional[UUID] = Field(None, description="User who performed the action")
    action: str = Field(..., max_length=100, description="Action performed (CREATE, UPDATE, DELETE, etc.)")
    resource_type: str = Field(..., max_length=100, description="Type of resource affected (User, ServiceRequest, etc.)")
    resource_id: Optional[str] = Field(None, max_length=255, description="ID of the affected resource")
    old_values: Optional[Dict[str, Any]] = Field(None, description="Previous values before change (JSON)")
    new_values: Optional[Dict[str, Any]] = Field(None, description="New values after change (JSON)")
    ip_address: Optional[str] = Field(None, max_length=45, description="Client IP address")
    endpoint: Optional[str] = Field(None, max_length=255, description="API endpoint called")
    correlation_id: Optional[str] = Field(None, max_length=36, description="Request correlation ID for tracing")
    user_agent: Optional[str] = Field(None, max_length=500, description="Client user agent string")
    changes_summary: Optional[str] = Field(None, max_length=1000, description="Human-readable summary of changes")


class AuditRead(HTTPSchemaModel):
    """Schema for reading an audit log entry."""

    id: int
    user_id: Optional[UUID]
    action: str
    resource_type: str
    resource_id: Optional[str]
    old_values: Optional[Dict[str, Any]]
    new_values: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    endpoint: Optional[str]
    correlation_id: Optional[str]
    user_agent: Optional[str]
    changes_summary: Optional[str]
    created_at: datetime

    # Related data
    username: Optional[str] = Field(None, description="Username of the user who performed the action")
    user_full_name: Optional[str] = Field(None, description="Full name of the user")


class AuditFilter(HTTPSchemaModel):
    """Schema for filtering audit logs."""

    user_id: Optional[UUID] = Field(None, description="Filter by user ID")
    action: Optional[str] = Field(None, description="Filter by action type")
    resource_type: Optional[str] = Field(None, description="Filter by resource type")
    resource_id: Optional[str] = Field(None, description="Filter by resource ID")
    correlation_id: Optional[str] = Field(None, description="Filter by correlation ID")
    start_date: Optional[datetime] = Field(None, description="Filter by start date")
    end_date: Optional[datetime] = Field(None, description="Filter by end date")
    page: int = Field(1, ge=1, description="Page number")
    per_page: int = Field(20, ge=1, le=100, description="Items per page")
