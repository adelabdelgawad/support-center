"""
Refactored Database Models - Agent to Technician Rename + Enum to FK Migration

Major Changes:
1. Renamed all "agent" references to "technician" throughout
2. Replaced enum fields with foreign key relationships to lookup tables
3. Removed deprecated fields and tables
4. Added 10 new lookup/reference tables
5. Removed RequestMetrics, ServiceRequestUser, BusinessUnitRole, BusinessUnitUserAssign
"""

import ipaddress
import re
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.dialects.postgresql import UUID as PostgreSQL_UUID
from sqlalchemy.types import CHAR, TypeDecorator
from sqlmodel import Field, Relationship, SQLModel

from api.schemas.page import PageRoleDetailedResponse, PageWithRolesName


def cairo_now():
    """
    Get current time in UTC (timezone-naive) for database storage.
    
    Stores datetime in UTC without timezone info. The application layer should:
    1. Store all times in UTC (this function)
    2. Convert to user's timezone when displaying (frontend/API layer)
    3. Convert from user's timezone to UTC when receiving input
    
    This ensures consistent storage while allowing proper timezone conversion for all users.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TableModel(SQLModel):
    """Base table model with common functionality."""

    pass


class UUIDField(TypeDecorator):
    """Platform-independent UUID type."""

    impl = CHAR(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, UUID):
                return str(value)
            else:
                return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, UUID):
                return UUID(value)
            return value


# ============================================================================
# NEW LOOKUP/REFERENCE TABLES
# ============================================================================


class Role(TableModel, table=True):
    """Role model for user permissions and access control."""

    __tablename__ = "roles"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    name: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Role name",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Role description in English",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this role",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this role",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this role is active",
    )

    # Relationships
    page_permissions: List["PageRole"] = Relationship(
        back_populates="role",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    user_roles: List["UserRole"] = Relationship(
        back_populates="role",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Role.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Role.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_role_name", "name", unique=True),
        Index("ix_role_is_active", "is_active"),
        Index("ix_role_is_deleted", "is_deleted"),
        Index("ix_role_created_at", "created_at"),
    )

    async def get_pages(self, include_inactive: bool = True) -> List["Page"]:
        pages: List["Page"] = []
        for perm in self.page_permissions:
            if perm.page:
                if not include_inactive and not perm.is_active:
                    continue
                if not include_inactive and not perm.page.is_active:
                    continue
                pages.append(perm.page)
        return pages

    async def get_users(self, include_inactive: bool = True) -> List["User"]:
        users: List["User"] = []
        for ur in self.user_roles:
            if ur.user:
                if not include_inactive and not ur.user.is_active:
                    continue
                users.append(ur.user)
        return users


class Page(TableModel, table=True):
    """Page model for application pages and navigation."""

    __tablename__ = "pages"

    id: Optional[int] = Field(default=None, primary_key=True)
    path: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="URL path for the page",
    )
    title: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Page title in English",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Page description in English",
    )
    icon: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Icon identifier for the page",
    )
    parent_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("pages.id"), nullable=True),
        description="Parent page ID for hierarchical navigation",
    )

    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this page",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this page",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this page is active",
    )

    # Relationships
    page_permissions: List["PageRole"] = Relationship(
        back_populates="page",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    children: List["Page"] = Relationship(
        back_populates="parent",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Page.parent_id",
        },
    )
    parent: Optional["Page"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "remote_side": "Page.id",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Page.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Page.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_page_path", "path"),
        Index("ix_page_parent_id", "parent_id"),
        Index("ix_page_is_active", "is_active"),
        Index("ix_page_is_deleted", "is_deleted"),
        Index("ix_page_created_at", "created_at"),
    )

    async def get_role_names(self) -> PageWithRolesName:
        return PageWithRolesName(
            id=self.id or 0,
            path=self.path,
            title=self.title,
            description=self.description,
            icon=self.icon,
            is_active=self.is_active if self.is_active is not None else True,
            parent_id=self.parent_id,
            role_names=[
                perm.role.name
                for perm in self.page_permissions
                if perm.role and perm.role.name is not None
            ],
            total_roles=len(self.page_permissions),
        )

    async def get_roles(self, include_inactive: bool = True) -> List["Role"]:
        roles: List["Role"] = []
        for perm in self.page_permissions:
            if perm.role:
                if not include_inactive and not perm.is_active:
                    continue
                if not include_inactive and not perm.role.is_active:
                    continue
                roles.append(perm.role)
        return roles


class PageRole(TableModel, table=True):
    """Page-Role junction table for page access permissions."""

    __tablename__ = "page_roles"

    id: Optional[int] = Field(default=None, primary_key=True)
    role_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("roles.id"),
            nullable=False,
        ),
        description="Role ID",
    )
    page_id: int = Field(
        sa_column=Column(Integer, ForeignKey("pages.id"), nullable=False),
        description="Page ID",
    )

    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this page permission",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this page permission",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this page permission is active",
    )

    # Relationships
    role: "Role" = Relationship(
        back_populates="page_permissions",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "PageRole.role_id",
        },
    )
    page: "Page" = Relationship(
        back_populates="page_permissions",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "PageRole.page_id",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "PageRole.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "PageRole.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_page_role_role_id", "role_id"),
        Index("ix_page_role_page_id", "page_id"),
        Index("ix_page_role_unique", "role_id", "page_id", unique=True),
        Index("ix_page_role_is_active", "is_active"),
        Index("ix_page_role_is_deleted", "is_deleted"),
    )

    async def detailed_record(self) -> PageRoleDetailedResponse:
        return PageRoleDetailedResponse(
            id=self.id or 0,
            role_id=self.role_id,
            page_id=self.page_id,
            is_active=self.is_active if self.is_active is not None else True,
            role_name=self.role.name if self.role else None,
            page_title=self.page.title if self.page else None,
        )


class UserRole(TableModel, table=True):
    """User-Role junction table for many-to-many relationship."""

    __tablename__ = "user_roles"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="User UUID",
    )
    role_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("roles.id"),
            nullable=False,
        ),
        description="Role ID",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this assignment",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this assignment",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this assignment is active",
    )

    # Relationships
    user: "User" = Relationship(
        back_populates="user_roles",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserRole.user_id",
        },
    )
    role: "Role" = Relationship(
        back_populates="user_roles",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserRole.role_id",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserRole.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserRole.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_user_roles_user_id", "user_id"),
        Index("ix_user_roles_role_id", "role_id"),
        Index("ix_user_roles_unique", "user_id", "role_id", unique=True),
        Index("ix_user_roles_is_active", "is_active"),
        Index("ix_user_roles_is_deleted", "is_deleted"),
    )


# NOTE: AssignType table REMOVED - replaced with AssignType enum in db.enums
# See: from db.enums import AssignType


class RequestAssignee(TableModel, table=True):
    """Request assignee table - tracks who is assigned to service requests.

    Renamed from UserRequestAssign/request_user_assigns for clarity.
    """

    __tablename__ = "request_assignees"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request ID",
    )
    assignee_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="Assignee user UUID (technician or CC recipient)",
    )
    assigned_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who made this assignment",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Assignment creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="assignees",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestAssignee.request_id",
        },
    )
    assignee: "User" = Relationship(
        back_populates="request_assigns",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestAssignee.assignee_id",
        },
    )
    assigner: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestAssignee.assigned_by",
        }
    )

    __table_args__ = (
        Index("ix_request_assignees_request_id", "request_id"),
        Index("ix_request_assignees_assignee_id", "assignee_id"),
        Index(
            "ix_request_assignees_unique",
            "request_id",
            "assignee_id",
            unique=True,
        ),
        Index("ix_request_assignees_is_deleted", "is_deleted"),
        # Composite index for assignment checks (already covered by unique index above)
        # The unique index "ix_request_assignees_unique" already provides optimal performance
        # for queries on (request_id, assignee_id) combinations
    )


# Backward compatibility alias
UserRequestAssign = RequestAssignee


class TechnicianRegion(TableModel, table=True):
    """Technician-Region assignment table.

    Renamed from RegionUserAssign/region_user_assigns for clarity.
    Assigns technicians to geographic regions.
    """

    __tablename__ = "technician_regions"

    id: Optional[int] = Field(default=None, primary_key=True)
    technician_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="Technician user UUID",
    )
    region_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("business_unit_regions.id"), nullable=False
        ),
        description="Business unit region ID",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Assignment creation timestamp",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this assignment",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this assignment is active",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )

    # Relationships
    technician: "User" = Relationship(
        back_populates="region_assigns",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianRegion.technician_id",
        },
    )
    region: "BusinessUnitRegion" = Relationship(
        back_populates="user_assigns",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianRegion.region_id",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianRegion.created_by",
        }
    )

    __table_args__ = (
        Index("ix_technician_regions_technician_id", "technician_id"),
        Index("ix_technician_regions_region_id", "region_id"),
        Index(
            "ix_technician_regions_unique",
            "technician_id",
            "region_id",
            unique=True,
        ),
        Index("ix_technician_regions_is_active", "is_active"),
        Index("ix_technician_regions_is_deleted", "is_deleted"),
    )


class TechnicianBusinessUnit(TableModel, table=True):
    """Technician-BusinessUnit assignment table.

    Renamed from BusinessUnitUserAssign/business_unit_user_assigns for clarity.
    Assigns technicians to business units.
    """

    __tablename__ = "technician_business_units"

    id: Optional[int] = Field(default=None, primary_key=True)
    technician_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="Technician user UUID",
    )
    business_unit_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("business_units.id"), nullable=False
        ),
        description="Business unit ID",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Assignment creation timestamp",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this assignment",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this assignment",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this assignment is active",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )

    # Relationships
    technician: "User" = Relationship(
        back_populates="business_unit_assigns",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianBusinessUnit.technician_id",
        },
    )
    business_unit: "BusinessUnit" = Relationship(
        back_populates="technician_assigns",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianBusinessUnit.business_unit_id",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianBusinessUnit.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianBusinessUnit.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_technician_business_units_technician_id", "technician_id"),
        Index("ix_technician_business_units_business_unit_id", "business_unit_id"),
        Index(
            "ix_technician_business_units_unique",
            "technician_id",
            "business_unit_id",
            unique=True,
        ),
        Index("ix_technician_business_units_is_active", "is_active"),
        Index("ix_technician_business_units_is_deleted", "is_deleted"),
    )

    # Backward compatibility property for user_id
    @property
    def user_id(self) -> UUID:
        """Alias for technician_id for backward compatibility."""
        return self.technician_id

    @user_id.setter
    def user_id(self, value: UUID) -> None:
        """Setter for user_id that sets technician_id."""
        self.technician_id = value


# Backward compatibility alias
BusinessUnitUserAssign = TechnicianBusinessUnit


class RequestResolution(TableModel, table=True):
    """Request resolution table - how requests were resolved.

    Renamed from Resolution/resolutions for clarity.
    """

    __tablename__ = "request_resolutions"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request ID",
    )
    description: str = Field(
        min_length=10,
        sa_column=Column(Text, nullable=False),
        description="Resolution description",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Resolution creation timestamp",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="request_resolutions",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestResolution.request_id",
        },
    )

    __table_args__ = (
        Index("ix_request_resolutions_request_id", "request_id"),
        Index("ix_request_resolutions_created_at", "created_at"),
    )


class OrganizationalUnit(TableModel, table=True):
    """Organizational Unit model for Active Directory OU management."""

    __tablename__ = "organizational_units"

    id: int = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
        description="Auto-incrementing primary key",
    )
    ou_name: str = Field(
        min_length=1,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="OU short name (e.g., 'SMH', 'EHQ')",
    )
    ou_dn: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Full distinguished name (e.g., 'OU=SMH,DC=example,DC=com')",
    )
    is_enabled: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
        description="Whether this OU should be included in AD sync",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Optional description of the OU",
    )
    user_count: Optional[int] = Field(
        default=0,
        sa_column=Column(Integer, nullable=True, server_default="0"),
        description="Last synced user count from this OU",
    )
    last_synced_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last time this OU was successfully synced",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Record creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    __table_args__ = (
        Index("ix_organizational_units_ou_name", "ou_name", unique=True),
        Index("ix_organizational_units_is_enabled", "is_enabled"),
        Index("ix_organizational_units_last_synced_at", "last_synced_at"),
    )


class DomainUser(TableModel, table=True):
    """Domain user model for Active Directory user synchronization."""

    __tablename__ = "domain_users"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
        description="UUID primary key",
    )
    username: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="sAMAccountName from AD",
    )
    email: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Email address from AD",
    )
    display_name: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Full display name from AD (displayName attribute)",
    )
    direct_manager_name: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Manager's full name from AD",
    )
    phone: Optional[str] = Field(
        default=None,
        max_length=50,
        sa_column=Column(String(50), nullable=True),
        description="Phone number from AD (telephoneNumber or mobile)",
    )
    office: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Office location from AD (physicalDeliveryOfficeName)",
    )
    title: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Job title from AD",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Sync timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last sync timestamp",
    )

    __table_args__ = (
        Index("ix_domain_users_username", "username", unique=True),
        Index("ix_domain_users_email", "email"),
        Index("ix_domain_users_display_name", "display_name"),
        Index("ix_domain_users_created_at", "created_at"),
    )


# ============================================================================
# UPDATED EXISTING TABLES
# ============================================================================


class User(TableModel, table=True):
    """User model with UUID as primary key."""

    __tablename__ = "users"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
        description="UUID primary key for user identification",
    )

    username: str = Field(
        min_length=3,
        max_length=50,
        sa_column=Column(String(50), unique=True, nullable=False),
        description="Unique username for authentication",
    )
    email: str = Field(
        min_length=5,
        max_length=255,
        sa_column=Column(String(255), unique=True, nullable=False),
        description="User email address",
    )
    password_hash: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Hashed password for authentication",
    )
    full_name: Optional[str] = Field(
        default=None, max_length=100, description="User's full name"
    )

    is_technician: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether user is a technician",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether user account is active",
    )
    is_online: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether user is currently online",
    )
    is_super_admin: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether user has super admin privileges",
    )
    phone_number: Optional[str] = Field(
        default=None, max_length=20, description="User's phone number"
    )
    title: Optional[str] = Field(
        default=None, max_length=100, description="User's job title"
    )
    office: Optional[str] = Field(
        default=None, max_length=100, description="User's office location"
    )
    manager_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User's manager (self-referential foreign key)",
    )
    direct_manager_name: Optional[str] = Field(
        default=None, max_length=100, description="Direct manager's full name from AD"
    )
    is_domain: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether user is from domain",
    )
    is_blocked: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether user account is blocked",
    )
    block_message: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Custom message explaining why user is blocked",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether user has been soft deleted",
    )

    # User Preferences
    language: Optional[str] = Field(
        default="ar",
        max_length=10,
        description="User's preferred language (en or ar)",
    )
    theme: Optional[str] = Field(
        default="system",
        max_length=10,
        description="User's preferred theme (light, dark, or system)",
    )
    notifications_enabled: Optional[bool] = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=True),
        description="Whether desktop notifications are enabled",
    )
    sound_enabled: Optional[bool] = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=True),
        description="Whether notification sounds are enabled",
    )
    sound_volume: Optional[float] = Field(
        default=0.5,
        description="Notification sound volume (0.0 to 1.0)",
    )

    # Business Unit Region - for filtering service requests by region
    business_unit_region_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("business_unit_regions.id"), nullable=True
        ),
        description="Business unit region for request filtering",
    )

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Account creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    last_seen: Optional[datetime] = Field(
        default=None, description="Last activity timestamp"
    )

    # Relationships
    created_requests: List["ServiceRequest"] = Relationship(
        back_populates="requester",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.requester_id",
        },
    )
    chat_messages: List["ChatMessage"] = Relationship(
        back_populates="sender", sa_relationship_kwargs={"lazy": "selectin"}
    )
    desktop_sessions: List["DesktopSession"] = Relationship(
        back_populates="user", sa_relationship_kwargs={"lazy": "selectin"}
    )
    web_sessions: List["WebSession"] = Relationship(
        back_populates="user", sa_relationship_kwargs={"lazy": "selectin"}
    )
    refresh_sessions: List["RefreshSession"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    uploaded_screenshots: List["Screenshot"] = Relationship(
        back_populates="uploader",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Screenshot.uploaded_by",
        },
    )
    uploaded_chat_files: List["ChatFile"] = Relationship(
        back_populates="uploader",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatFile.uploaded_by",
        },
    )

    # NEW: UserRole relationship
    user_roles: List["UserRole"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserRole.user_id",
        },
    )

    # NEW: RequestAssignee relationship
    request_assigns: List["RequestAssignee"] = Relationship(
        back_populates="assignee",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestAssignee.assignee_id",
        },
    )

    # NEW: TechnicianRegion relationship
    region_assigns: List["TechnicianRegion"] = Relationship(
        back_populates="technician",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianRegion.technician_id",
        },
    )

    # NEW: TechnicianBusinessUnit relationship
    business_unit_assigns: List["TechnicianBusinessUnit"] = Relationship(
        back_populates="technician",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianBusinessUnit.technician_id",
        },
    )

    # Business Unit Region relationship
    business_unit_region: Optional["BusinessUnitRegion"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "User.business_unit_region_id",
        }
    )

    # Manager relationships (self-referential)
    manager: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "remote_side": "User.id",
            "foreign_keys": "User.manager_id",
        }
    )
    direct_reports: List["User"] = Relationship(
        back_populates="manager",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "User.manager_id",
        },
    )

    # Custom view relationship (ONE view per user)
    custom_view: Optional["UserCustomView"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserCustomView.user_id",
            "uselist": False,  # ONE view per user
        },
    )

    # Audit log relationship
    audit_logs: List["Audit"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Audit.user_id",
        },
    )

    __table_args__ = (
        Index("ix_users_username", "username", unique=True),
        Index("ix_users_email", "email", unique=True),
        Index("ix_users_created_at", "created_at"),
        Index("ix_users_is_super_admin", "is_super_admin"),
        Index("ix_users_is_domain", "is_domain"),
        Index("ix_users_active_super_admin", "is_active", "is_super_admin"),
        Index("ix_users_manager_id", "manager_id"),
        Index("ix_users_is_technician", "is_technician"),
        Index("ix_users_active_technician", "is_active", "is_technician"),
    )

    async def get_pages(self, include_inactive: bool = True) -> List["Page"]:
        seen_ids = set()
        pages: List["Page"] = []
        for ur in self.user_roles:
            role = ur.role
            if not role:
                continue
            if not include_inactive and not role.is_active:
                continue
            for perm in role.page_permissions:
                page = perm.page
                if not page:
                    continue
                if not include_inactive and (
                    not perm.is_active or not page.is_active
                ):
                    continue
                if page.id not in seen_ids:
                    seen_ids.add(page.id)
                    pages.append(page)
        return pages


# ============================================================================
# AUTHENTICATION TOKENS AND SESSIONS
# ============================================================================


class AuthToken(TableModel, table=True):
    """Access tokens for authentication"""
    __tablename__ = "auth_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    token_id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PGUUID(as_uuid=True), unique=True, nullable=False)
    )
    user_id: UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    )
    session_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), nullable=True)
    )  # Session ID (references refresh_sessions table)
    token_hash: str = Field(max_length=255, unique=True)
    token_type: str = Field(default="access", max_length=20)
    device_info: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: Optional[datetime] = None
    is_revoked: bool = Field(default=False)

    # Indexes for performance
    __table_args__ = (
        Index("idx_auth_tokens_token_id", "token_id"),
        Index("idx_auth_tokens_user_id", "user_id"),
        Index("idx_auth_tokens_session_id", "session_id"),
        Index("idx_auth_tokens_token_hash", "token_hash"),
        Index("idx_auth_tokens_expires_at", "expires_at"),
        Index("idx_auth_tokens_active", "user_id", "is_revoked", "expires_at"),
    )


class RefreshSession(TableModel, table=True):
    """
    Stateful session tracking with refresh token support.

    This model enables modern authentication with short-lived access tokens
    and long-lived refresh tokens, providing better security than single
    long-lived tokens.

    Features:
    - Atomic token rotation with SELECT FOR UPDATE
    - Device fingerprinting for security
    - Session limit enforcement
    - Individual session revocation
    - Metadata storage for locale and other preferences
    """
    __tablename__ = "refresh_sessions"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
        description="Session UUID",
    )

    # User reference (UUID primary key)
    user_id: UUID = Field(
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        description="User UUID (primary key reference)",
    )

    # Refresh token tracking
    refresh_token_id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), unique=True, nullable=False),
        description="JTI of current refresh token (rotates on refresh)",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(DateTime, nullable=False),
        description="Session creation timestamp",
    )
    last_seen_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(DateTime, nullable=False),
        description="Last activity timestamp",
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime, nullable=False),
        description="Session expiration timestamp",
    )

    # Security and tracking
    revoked: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
        description="Whether session has been revoked",
    )
    device_info: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="User agent or device information",
    )
    ip_address: Optional[str] = Field(
        default=None,
        max_length=45,
        sa_column=Column(String(45), nullable=True),
        description="Client IP address (IPv4 or IPv6)",
    )
    fingerprint: Optional[str] = Field(
        default=None,
        max_length=64,
        sa_column=Column(String(64), nullable=True),
        description="Hashed device fingerprint",
    )
    session_metadata: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Additional session metadata (locale, preferences, etc.)",
    )

    # Relationships
    user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RefreshSession.user_id",
        }
    )

    # Indexes for performance
    __table_args__ = (
        Index("ix_refresh_sessions_user_id", "user_id"),
        Index("ix_refresh_sessions_refresh_token_id", "refresh_token_id", unique=True),
        Index("ix_refresh_sessions_revoked", "revoked"),
        Index("ix_refresh_sessions_expires_at", "expires_at"),
        Index("ix_refresh_sessions_active", "user_id", "revoked", "expires_at"),
    )


# ============================================================================
# DESKTOP AND WEB SESSIONS (Complete separation - no generic user_sessions)
# ============================================================================


class DesktopSession(TableModel, table=True):
    """
    Desktop/Tauri application sessions.

    Desktop sessions are created by the Tauri requester app and have specific
    requirements like app_version tracking and computer identification.
    Separate from web sessions for better type safety and performance.
    """

    __tablename__ = "desktop_sessions"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )

    # Core session fields
    user_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="User UUID who owns this session",
    )
    ip_address: str = Field(
        min_length=7,
        max_length=45,
        sa_column=Column(String(45), nullable=False),
        description="Client IP address (IPv4 or IPv6)",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether session is currently active",
    )

    # Authentication tracking
    authenticated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When user was authenticated",
    )
    auth_method: str = Field(
        default="sso",
        max_length=50,
        sa_column=Column(String(50), nullable=False, server_default="sso"),
        description="Authentication method used (sso, ad)",
    )
    last_auth_refresh: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last time authentication was refreshed",
    )
    device_fingerprint: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Unique device fingerprint for tracking",
    )

    # Desktop-specific REQUIRED fields
    app_version: str = Field(
        ...,
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Tauri application version (REQUIRED for desktop)",
    )

    # Desktop-specific optional fields
    computer_name: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Computer/hostname of the desktop client",
    )
    os_info: Optional[str] = Field(
        default=None,
        max_length=100,
        sa_column=Column(String(100), nullable=True),
        description="Operating system information (e.g., 'Windows 11')",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Session creation timestamp",
    )
    last_heartbeat: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Last heartbeat timestamp for tracking activity",
    )

    # Relationships
    user: "User" = Relationship(
        back_populates="desktop_sessions",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "DesktopSession.user_id",
        },
    )

    # Pydantic V2 Validators
    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v):
        """Validate IP address follows proper IPv4 or IPv6 format."""
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            raise ValueError(
                f"Invalid IP address format: {v}. Must be valid IPv4 or IPv6 address."
            )

    @field_validator("last_heartbeat")
    @classmethod
    def validate_last_heartbeat(cls, v, info):
        """Validate last_heartbeat is always >= created_at."""
        if info.data.get("created_at") and v < info.data["created_at"]:
            raise ValueError(
                f"last_heartbeat ({v}) must be greater than or equal to created_at ({info.data['created_at']})"
            )
        return v

    # Performance indexes
    __table_args__ = (
        Index("ix_desktop_sessions_user_id", "user_id"),
        Index("ix_desktop_sessions_is_active", "is_active"),
        Index("ix_desktop_sessions_user_active", "user_id", "is_active"),
        Index("ix_desktop_sessions_last_heartbeat", "last_heartbeat"),
        Index("ix_desktop_sessions_device_fingerprint", "device_fingerprint"),
        Index("ix_desktop_sessions_app_version", "app_version"),
    )


class WebSession(TableModel, table=True):
    """
    Web application sessions (Next.js it-app).

    Web sessions are created by IT agents/supervisors accessing the web portal.
    Uses httpOnly cookies for authentication and has web-specific tracking.
    Separate from desktop sessions for better type safety and performance.
    """

    __tablename__ = "web_sessions"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )

    # Core session fields
    user_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="User UUID who owns this session",
    )
    ip_address: str = Field(
        min_length=7,
        max_length=45,
        sa_column=Column(String(45), nullable=False),
        description="Client IP address (IPv4 or IPv6)",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether session is currently active",
    )

    # Authentication tracking
    authenticated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When user was authenticated",
    )
    auth_method: str = Field(
        default="passwordless",
        max_length=50,
        sa_column=Column(String(50), nullable=False, server_default="passwordless"),
        description="Authentication method used (passwordless, ad, admin)",
    )
    last_auth_refresh: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last time authentication was refreshed",
    )
    device_fingerprint: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Unique device fingerprint for tracking",
    )

    # Web-specific fields
    browser: Optional[str] = Field(
        default=None,
        max_length=100,
        sa_column=Column(String(100), nullable=True),
        description="Browser information (e.g., 'Chrome 120')",
    )
    user_agent: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Full user agent string",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Session creation timestamp",
    )
    last_heartbeat: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Last heartbeat timestamp for tracking activity",
    )

    # Relationships
    user: "User" = Relationship(
        back_populates="web_sessions",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "WebSession.user_id",
        },
    )

    # Pydantic V2 Validators
    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v):
        """Validate IP address follows proper IPv4 or IPv6 format."""
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            raise ValueError(
                f"Invalid IP address format: {v}. Must be valid IPv4 or IPv6 address."
            )

    @field_validator("last_heartbeat")
    @classmethod
    def validate_last_heartbeat(cls, v, info):
        """Validate last_heartbeat is always >= created_at."""
        if info.data.get("created_at") and v < info.data["created_at"]:
            raise ValueError(
                f"last_heartbeat ({v}) must be greater than or equal to created_at ({info.data['created_at']})"
            )
        return v

    # Performance indexes
    __table_args__ = (
        Index("ix_web_sessions_user_id", "user_id"),
        Index("ix_web_sessions_is_active", "is_active"),
        Index("ix_web_sessions_user_active", "user_id", "is_active"),
        Index("ix_web_sessions_last_heartbeat", "last_heartbeat"),
        Index("ix_web_sessions_device_fingerprint", "device_fingerprint"),
    )


class RequestStatus(TableModel, table=True):
    """Request Status - ADDED: description and color fields."""

    __tablename__ = "request_statuses"

    id: Optional[int] = Field(
        default=None,
        primary_key=True,
        description="Integer identifier for the status",
    )
    name: str = Field(
        min_length=2,
        max_length=50,
        sa_column=Column(String(50), nullable=False, unique=True),
        description="Status name identifier (internal)",
    )
    # ADDED: bilingual display names
    name_en: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Display name in English",
    )
    name_ar: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Display name in Arabic",
    )
    # ADDED: description field
    description: Optional[str] = Field(
        default=None, max_length=500, description="Status description"
    )
    # ADDED: color field
    color: Optional[str] = Field(
        default=None,
        max_length=50,
        sa_column=Column(String(50), nullable=True),
        description="Status color (e.g., 'yellow', 'blue', 'green')",
    )

    # Audit fields
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Status creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this status",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this status",
    )
    readonly: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether this status is readonly",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this status is currently active/available",
    )
    count_as_solved: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether requests with this status count as solved/completed",
    )
    visible_on_requester_page: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether requests with this status are visible on the requester's tickets page",
    )

    # Relationships
    created_by_user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestStatus.created_by",
        }
    )
    updated_by_user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestStatus.updated_by",
        }
    )
    requests: List["ServiceRequest"] = Relationship(
        back_populates="status", sa_relationship_kwargs={"lazy": "selectin"}
    )

    # Indexes
    __table_args__ = (
        Index("ix_request_statuses_name", "name", unique=True),
        Index("ix_request_statuses_is_active", "is_active"),
        Index("ix_request_statuses_readonly", "readonly"),
        Index("ix_request_statuses_created_at", "created_at"),
        Index("ix_request_statuses_count_as_solved", "count_as_solved"),
        Index("ix_request_statuses_visible_on_requester_page", "visible_on_requester_page"),
    )


class ServiceRequest(TableModel, table=True):
    """Service Request - UPDATED: Removed deprecated fields, renamed agent to technician."""

    __tablename__ = "service_requests"

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            primary_key=True,
            nullable=False
        ),
        description="Unique UUID identifier for the service request",
    )

    # User relationships
    requester_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="User UUID who created the request"
    )

    # Business Unit - automatically assigned based on IP address
    business_unit_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("business_units.id"), nullable=True
        ),
        description="Business unit (auto-assigned from IP or manually set)",
    )

    # Tag - for categorizing requests
    tag_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("tags.id"), nullable=True
        ),
        description="Tag for categorizing request",
    )

    # Status relationship
    status_id: int = Field(
        default=1,
        sa_column=Column(
            Integer, ForeignKey("request_statuses.id"), nullable=False
        ),
        description="Current status ID (defaults to Open)",
    )

    # Priority relationship
    priority_id: int = Field(
        default=3,  # Default to "Medium" priority
        sa_column=Column(Integer, ForeignKey("priorities.id"), nullable=False),
        description="Priority level",
    )

    # Request Type relationship
    request_type_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("request_types.id"), nullable=True),
        description="Request type ID",
    )

    # Subcategory
    subcategory_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("subcategories.id"), nullable=True
        ),
        description="Subcategory (mandatory if request_id != 1)",
    )

    title: str = Field(
        min_length=5,
        max_length=200,
        description="Brief summary of the request",
    )
    description: Optional[str] = Field(
        default=None,
        min_length=10,
        sa_column=Column(Text, nullable=True),
        description="Detailed description (requester provides only title; technician adds this)",
    )
    resolution: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Resolution description (mandatory for status_id 6 or 8)",
    )

    # REMOVED: is_escalated, escalation_reason, estimated_hours, actual_hours

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Request creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    assigned_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When assigned",
    )
    first_response_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="First response time",
    )
    resolved_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When resolved",
    )
    closed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When closed",
    )
    due_date: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
        description="Calculated due date based on priority SLA",
    )
    ip_address: Optional[str] = Field(
        default=None, max_length=45, description="Client IP address"
    )

    # WhatsApp out-of-shift escalation tracking
    first_requester_message_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="Timestamp of first requester (non-system) message (set once, never overwritten)",
    )
    whatsapp_last_sent_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="Last time WhatsApp batch was sent for this request",
    )

    # SLA tracking fields
    sla_first_response_due: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="When first response SLA expires",
    )
    sla_first_response_breached: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether first response SLA was breached",
    )
    sla_resolution_breached: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether resolution SLA was breached",
    )
    reopen_count: int = Field(
        default=0,
        sa_column=Column(Integer, default=0, nullable=False),
        description="Number of times this request was reopened",
    )

    # Sub-task hierarchy (self-referential)
    parent_task_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=True
        ),
        description="Parent task ID for sub-tasks (NULL for top-level requests)"
    )

    # Assignment tracking (for sub-tasks and requests)
    assigned_to_section_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("service_sections.id", ondelete="SET NULL"), nullable=True),
        description="Assigned service section"
    )
    assigned_to_technician_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        description="Assigned technician"
    )

    # Task management
    order: Optional[int] = Field(default=None, description="Order within parent task")
    is_blocked: bool = Field(default=False, description="Whether task is blocked")
    blocked_reason: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Reason for blocking"
    )

    # Time tracking
    estimated_hours: Optional[float] = Field(default=None, description="Estimated hours to complete")
    actual_hours: Optional[float] = Field(default=None, description="Actual hours spent")

    # Additional timestamps
    completed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="When task was completed"
    )

    # Soft delete and status
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether request/task is active"
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag"
    )

    # Audit fields
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        description="User who created this request/task"
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        description="User who last updated this request/task"
    )

    # Relationships
    requester: "User" = Relationship(
        back_populates="created_requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.requester_id",
        },
    )
    business_unit: Optional["BusinessUnit"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.business_unit_id",
        }
    )
    tag: Optional["Tag"] = Relationship(
        back_populates="requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.tag_id",
        },
    )
    status: "RequestStatus" = Relationship(
        back_populates="requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.status_id",
        },
    )
    priority: "Priority" = Relationship(
        back_populates="requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.priority_id",
        },
    )
    subcategory: Optional["Subcategory"] = Relationship(
        back_populates="requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.subcategory_id",
        },
    )
    request_type: Optional["RequestType"] = Relationship(
        back_populates="requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.request_type_id",
        },
    )
    chat_messages: List["ChatMessage"] = Relationship(
        back_populates="request", sa_relationship_kwargs={"lazy": "selectin"}
    )
    screenshots: List["Screenshot"] = Relationship(
        back_populates="request", sa_relationship_kwargs={"lazy": "selectin"}
    )
    chat_files: List["ChatFile"] = Relationship(
        back_populates="request", sa_relationship_kwargs={"lazy": "selectin"}
    )
    notes: List["RequestNote"] = Relationship(
        back_populates="request", sa_relationship_kwargs={"lazy": "selectin"}
    )
    # REMOVED: request_users relationship
    # NEW: assignees relationship (renamed from request_user_assigns for clarity)
    assignees: List["RequestAssignee"] = Relationship(
        back_populates="request",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestAssignee.request_id",
        }
    )
    # NEW: request_resolutions relationship
    request_resolutions: List["RequestResolution"] = Relationship(
        back_populates="request", sa_relationship_kwargs={"lazy": "selectin"}
    )

    # Self-referential hierarchy relationships
    parent_task: Optional["ServiceRequest"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "remote_side": "ServiceRequest.id",
            "foreign_keys": "ServiceRequest.parent_task_id"
        }
    )
    child_tasks: List["ServiceRequest"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.parent_task_id",
            "overlaps": "parent_task"
        }
    )

    # Assignment relationships
    assigned_section: Optional["ServiceSection"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.assigned_to_section_id"
        }
    )
    assigned_technician: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.assigned_to_technician_id"
        }
    )

    # Audit relationships
    created_by_user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.created_by"
        }
    )
    updated_by_user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.updated_by"
        }
    )

    # Screenshot links (for sharing parent screenshots with sub-tasks)
    linked_screenshots: List["RequestScreenshotLink"] = Relationship(
        back_populates="request",
        sa_relationship_kwargs={"lazy": "selectin"}
    )

    # ALL INDEXES DEFINED HERE
    __table_args__ = (
        Index("ix_requests_requester_id", "requester_id"),
        Index("ix_requests_business_unit_id", "business_unit_id"),
        Index("ix_requests_tag_id", "tag_id"),
        Index("ix_requests_status_id", "status_id"),
        Index("ix_requests_priority_id", "priority_id"),
        Index("ix_requests_subcategory_id", "subcategory_id"),
        Index("ix_requests_request_type_id", "request_type_id"),
        Index("ix_requests_created_at", "created_at"),
        Index("ix_requests_status_requester", "status_id", "requester_id"),
        Index("ix_requests_status_priority", "status_id", "priority_id"),
        Index("ix_requests_status_created", "status_id", "created_at"),
        Index(
            "ix_requests_business_unit_status", "business_unit_id", "status_id"
        ),
        # Composite index for technician views filtering
        Index("ix_requests_status_bu_created", "status_id", "business_unit_id", "created_at"),
        # Composite index for requester views
        Index("ix_requests_requester_status_created", "requester_id", "status_id", "created_at"),
        # Sub-task hierarchy indexes
        Index("ix_requests_parent_task_id", "parent_task_id"),
        Index("ix_requests_parent_status", "parent_task_id", "status_id"),
        Index("ix_requests_parent_order", "parent_task_id", "order"),
        # Assignment indexes
        Index("ix_requests_assigned_section", "assigned_to_section_id"),
        Index("ix_requests_assigned_technician", "assigned_to_technician_id"),
        # Status and audit indexes
        Index("ix_requests_is_deleted", "is_deleted"),
        Index("ix_requests_is_active", "is_active"),
        Index("ix_requests_created_by", "created_by"),
        Index("ix_requests_completed_at", "completed_at"),
        # WhatsApp out-of-shift escalation indexes
        Index("ix_requests_first_requester_message_at", "first_requester_message_at"),
        Index("ix_requests_whatsapp_last_sent_at", "whatsapp_last_sent_at"),
        # Composite index for WhatsApp eligibility queries
        Index("ix_requests_bu_assignee_first_msg", "business_unit_id", "assigned_to_technician_id", "first_requester_message_at"),
    )


class ChatMessage(TableModel, table=True):
    """Chat Message - ID is UUID."""

    __tablename__ = "chat_messages"

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
        description="Message UUID",
    )

    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request this message belongs to",
    )
    sender_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True
        ),
        description="User UUID who sent the message (optional)"
    )
    content: str = Field(
        min_length=1,
        max_length=10000,
        sa_column=Column(Text, nullable=False),
        description="Message content",
    )
    is_read: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="[DEPRECATED] Use read_states relationship for per-user tracking",
    )
    is_screenshot: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether message contains a screenshot",
    )
    screenshot_file_name: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Screenshot filename (stored in MinIO)",
    )
    # File attachment fields (for non-image files like PDF, DOC, etc.)
    file_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("chat_files.id", ondelete="SET NULL"), nullable=True),
        description="Reference to ChatFile for non-image attachments",
    )
    file_name: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Original filename of attached file",
    )
    file_size: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, nullable=True),
        description="File size in bytes",
    )
    file_mime_type: Optional[str] = Field(
        default=None,
        max_length=100,
        sa_column=Column(String(100), nullable=True),
        description="MIME type of attached file",
    )

    # NEW: Sequence number for guaranteed ordering and gap detection
    sequence_number: int = Field(
        sa_column=Column(Integer, nullable=False),
        description="Monotonic sequence number within request for ordering and gap detection",
    )

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Message creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    read_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="[DEPRECATED] Use read_states relationship for per-user tracking",
    )
    ip_address: Optional[str] = Field(
        default=None,
        max_length=45,
        sa_column=Column(String(45), nullable=True),
        description="Sender IP address (IPv4 or IPv6)",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="chat_messages",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatMessage.request_id",
        },
    )
    sender: Optional["User"] = Relationship(
        back_populates="chat_messages",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatMessage.sender_id",
        },
    )
    # File attachment relationship (for non-image files)
    file: Optional["ChatFile"] = Relationship(
        back_populates="message",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatMessage.file_id",
        },
    )
    # ALL INDEXES DEFINED HERE
    __table_args__ = (
        Index("ix_messages_request_id", "request_id"),
        Index("ix_messages_sender_id", "sender_id"),
        Index("ix_messages_created_at", "created_at"),
        Index("ix_messages_request_created", "request_id", "created_at"),
        Index("ix_messages_request_sender", "request_id", "sender_id"),
        Index("ix_messages_request_unread", "request_id", "is_read"),
        # Unique sequence per request (for gap detection and ordering)
        Index(
            "ix_chat_message_request_sequence",
            "request_id",
            "sequence_number",
            unique=True,
        ),
        # Index for last message queries (DESC order for recent messages)
        Index("ix_messages_request_created_desc", "request_id", text("created_at DESC")),
    )


class ChatReadState(TableModel, table=True):
    """Per-user, per-chat read state tracking.

    Renamed from ChatReadMonitor/chat_read_monitors for clarity.

    Tracks unread counts and last read timestamps for each user in each chat (service request).
    Used for:
    - Per-chat unread badges in the chat list
    - Global unread counter across all chats
    - Presence tracking (is user currently viewing the chat)
    """

    __tablename__ = "chat_read_states"

    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request (chat) being monitored",
    )

    user_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="User whose read state is tracked",
    )

    last_read_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Timestamp of the last read message in this chat",
    )

    last_read_message_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("chat_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="ID of the last read message",
    )

    unread_count: int = Field(
        default=0,
        ge=0,
        description="Number of unread messages for this user in this chat",
    )

    is_viewing: bool = Field(
        default=False,
        description="Whether user is currently viewing this chat (WebSocket connected)",
    )

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(DateTime, nullable=False, default=cairo_now),
        description="When this monitor record was created",
    )

    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(
            DateTime, nullable=False, default=cairo_now, onupdate=cairo_now
        ),
        description="When this record was last updated",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatReadState.request_id",
        }
    )

    user: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatReadState.user_id",
        }
    )

    last_read_message: Optional["ChatMessage"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatReadState.last_read_message_id",
        }
    )

    __table_args__ = (
        # Unique constraint: one record per user per chat
        UniqueConstraint("request_id", "user_id", name="uq_chat_read_state_request_user"),
        # Index for efficient lookups by user (for global unread count)
        Index("ix_chat_read_states_user", "user_id"),
        # Index for efficient lookups by request (for participant list)
        Index("ix_chat_read_states_request", "request_id"),
        # Index for finding users currently viewing a chat
        Index("ix_chat_read_states_viewing", "request_id", "is_viewing"),
    )


class Screenshot(TableModel, table=True):
    """Screenshot model - stores screenshot images uploaded by users."""

    __tablename__ = "screenshots"

    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False
        ),
        description="Service request this screenshot belongs to",
    )
    uploaded_by: UUID = Field(
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        description="User who uploaded this screenshot"
    )
    filename: str = Field(
        min_length=1,
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="Screenshot filename",
    )
    file_hash: Optional[str] = Field(
        default=None, max_length=64, description="File hash for integrity verification"
    )
    file_size: int = Field(ge=0, description="File size in bytes")
    mime_type: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False, server_default="image/png"),
        description="MIME type (image/png, image/jpeg, etc.)",
    )
    minio_object_key: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="MinIO object key (path in bucket)",
    )
    minio_thumbnail_key: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="MinIO thumbnail object key",
    )
    bucket_name: Optional[str] = Field(
        default="servicecatalog-screenshots",
        max_length=100,
        sa_column=Column(String(100), nullable=True),
        description="MinIO bucket name",
    )
    celery_task_id: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Celery task ID for async upload",
    )
    upload_status: str = Field(
        default="pending",
        max_length=20,
        sa_column=Column(
            String(20), nullable=False, server_default=text("'pending'")
        ),
        description="Upload status: 'pending', 'completed', 'failed'",
    )
    temp_local_path: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Temporary local file path (before MinIO upload)",
    )
    is_corrupted: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, server_default=text("false")
        ),
        description="File corruption flag (set when hash validation fails)",
    )

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Upload timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Update timestamp",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="screenshots",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Screenshot.request_id",
        },
    )
    uploader: "User" = Relationship(
        back_populates="uploaded_screenshots",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Screenshot.uploaded_by",
        },
    )

    # Screenshot links (for sharing with sub-tasks)
    linked_to_requests: List["RequestScreenshotLink"] = Relationship(
        back_populates="screenshot",
        sa_relationship_kwargs={"lazy": "selectin"}
    )

    # ALL INDEXES DEFINED HERE
    __table_args__ = (
        Index("ix_screenshots_request_id", "request_id"),
        Index("ix_screenshots_uploader_id", "uploaded_by"),
        Index("ix_screenshots_created_at", "created_at"),
        Index("ix_screenshots_uploader_created", "uploaded_by", "created_at"),
        Index("ix_screenshots_celery_task_id", "celery_task_id"),
        Index("ix_screenshots_upload_status", "upload_status"),
    )


class ChatFile(TableModel, table=True):
    """Chat file attachment model - stores non-image files sent in chat.

    Similar to Screenshot but for non-image files (PDF, DOC, ZIP, etc.).
    Uses MinIO storage with Celery for async uploads.
    """

    __tablename__ = "chat_files"

    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request this file belongs to",
    )
    uploaded_by: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="User who uploaded this file",
    )
    original_filename: str = Field(
        min_length=1,
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="Original filename from upload",
    )
    stored_filename: str = Field(
        min_length=1,
        max_length=255,
        sa_column=Column(String(255), nullable=False, unique=True),
        description="Unique stored filename (UUID-based)",
    )
    file_size: int = Field(
        ge=0,
        sa_column=Column(Integer, nullable=False),
        description="File size in bytes",
    )
    mime_type: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="MIME type of the file",
    )
    file_hash: Optional[str] = Field(
        default=None,
        max_length=64,
        sa_column=Column(String(64), nullable=True),
        description="SHA256 hash for integrity verification",
    )
    minio_object_key: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="MinIO object key (path in bucket)",
    )
    bucket_name: str = Field(
        default="servicecatalog-files",
        max_length=100,
        sa_column=Column(String(100), nullable=False, server_default=text("'servicecatalog-files'")),
        description="MinIO bucket name",
    )
    upload_status: str = Field(
        default="pending",
        max_length=20,
        sa_column=Column(String(20), nullable=False, server_default=text("'pending'")),
        description="Upload status: 'pending', 'completed', 'failed'",
    )
    temp_local_path: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Temporary local file path (before MinIO upload)",
    )
    celery_task_id: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Celery task ID for async upload",
    )
    is_corrupted: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default=text("false")),
        description="File corruption flag (set when hash validation fails)",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Upload timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Update timestamp",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="chat_files",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatFile.request_id",
        },
    )
    uploader: "User" = Relationship(
        back_populates="uploaded_chat_files",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ChatFile.uploaded_by",
        },
    )
    message: Optional["ChatMessage"] = Relationship(
        back_populates="file",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "uselist": False,
        },
    )

    __table_args__ = (
        Index("ix_chat_files_request_id", "request_id"),
        Index("ix_chat_files_uploaded_by", "uploaded_by"),
        Index("ix_chat_files_stored_filename", "stored_filename"),
        Index("ix_chat_files_upload_status", "upload_status"),
        Index("ix_chat_files_created_at", "created_at"),
    )


class RequestScreenshotLink(TableModel, table=True):
    """Junction table for sharing screenshots between parent tasks and sub-tasks.

    Allows technicians to associate parent task screenshots with sub-tasks
    without duplicating files in MinIO.
    """

    __tablename__ = "request_screenshot_links"

    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="Sub-task or request ID where screenshot is linked"
    )

    screenshot_id: int = Field(
        sa_column=Column(Integer, ForeignKey("screenshots.id", ondelete="CASCADE"), nullable=False),
        description="Screenshot ID being linked"
    )

    linked_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True
        ),
        description="Technician who linked the screenshot"
    )

    linked_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="When screenshot was linked"
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="linked_screenshots",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestScreenshotLink.request_id"
        }
    )

    screenshot: "Screenshot" = Relationship(
        back_populates="linked_to_requests",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestScreenshotLink.screenshot_id"
        }
    )

    linker: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestScreenshotLink.linked_by"
        }
    )

    __table_args__ = (
        Index("ix_screenshot_links_request_id", "request_id"),
        Index("ix_screenshot_links_screenshot_id", "screenshot_id"),
        Index("ix_screenshot_links_linked_by", "linked_by"),
        # Unique constraint to prevent duplicate links
        UniqueConstraint("request_id", "screenshot_id", name="uq_request_screenshot_link"),
    )


class Priority(TableModel, table=True):
    """Priority model for service requests."""

    __tablename__ = "priorities"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(
        min_length=2,
        max_length=50,
        sa_column=Column(String(50), nullable=False, unique=True),
        description="Priority name (Critical, High, Medium, Low, Lowest)",
    )
    response_time_minutes: int = Field(
        ge=0, description="Expected response time in minutes"
    )
    resolution_time_hours: int = Field(
        ge=0, description="Expected resolution time in hours"
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this priority is active",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Priority creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    requests: List["ServiceRequest"] = Relationship(
        back_populates="priority", sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_priorities_name", "name", unique=True),
        Index("ix_priorities_is_active", "is_active"),
    )


class RequestType(TableModel, table=True):
    """Request Type model for categorizing service requests with bilingual support."""

    __tablename__ = "request_types"

    id: Optional[int] = Field(default=None, primary_key=True)
    name_en: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Request type name in English",
    )
    name_ar: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Request type name in Arabic",
    )
    brief_en: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Brief hint in English (shown as placeholder in request form)",
    )
    brief_ar: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Brief hint in Arabic (shown as placeholder in request form)",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this request type is active",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Request type creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    requests: List["ServiceRequest"] = Relationship(
        back_populates="request_type", sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_request_types_name_en", "name_en"),
        Index("ix_request_types_name_ar", "name_ar"),
        Index("ix_request_types_is_active", "is_active"),
    )


class ServiceSection(TableModel, table=True):
    """Service Section model for categorizing services."""

    __tablename__ = "service_sections"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Section name (internal identifier)",
    )
    shown_name_en: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Display name in English",
    )
    shown_name_ar: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Display name in Arabic",
    )
    description: Optional[str] = Field(
        default=None, max_length=500, description="Section description"
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this section is active",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )
    is_shown: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this section should be shown in new request form",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Section creation timestamp",
    )

    # Relationships
    categories: List["Category"] = Relationship(
        back_populates="section", sa_relationship_kwargs={"lazy": "selectin"}
    )
    technician_assignments: List["TechnicianSection"] = Relationship(
        back_populates="section", sa_relationship_kwargs={"lazy": "selectin"}
    )
    # Requests/sub-tasks assigned to this section
    assigned_requests: List["ServiceRequest"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ServiceRequest.assigned_to_section_id",
            "overlaps": "assigned_section"
        }
    )

    __table_args__ = (
        Index("ix_service_sections_name", "name", unique=True),
        Index("ix_service_sections_is_active", "is_active"),
        Index("ix_service_sections_is_deleted", "is_deleted"),
        Index("ix_service_sections_is_shown", "is_shown"),
    )


class Category(TableModel, table=True):
    """Category model for service requests."""

    __tablename__ = "categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Category name (internal identifier)",
    )
    name_en: str = Field(
        ...,
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Category name in English",
    )
    name_ar: str = Field(
        ...,
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Category name in Arabic",
    )
    description: Optional[str] = Field(
        default=None, max_length=500, description="Category description"
    )
    section_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("service_sections.id"), nullable=True
        ),
        description="Service section this category belongs to",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this category is active",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Category creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    section: Optional["ServiceSection"] = Relationship(
        back_populates="categories",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    subcategories: List["Subcategory"] = Relationship(
        back_populates="category", sa_relationship_kwargs={"lazy": "selectin"}
    )
    tags: List["Tag"] = Relationship(
        back_populates="category", sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_categories_name", "name", unique=True),
        Index("ix_categories_is_active", "is_active"),
        Index("ix_categories_section_id", "section_id"),
    )


class Subcategory(TableModel, table=True):
    """Subcategory model for service requests."""

    __tablename__ = "subcategories"

    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(
        sa_column=Column(Integer, ForeignKey("categories.id"), nullable=False),
        description="Parent category",
    )
    name: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Subcategory name (internal identifier)",
    )
    name_en: str = Field(
        ...,
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Subcategory name in English",
    )
    name_ar: str = Field(
        ...,
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Subcategory name in Arabic",
    )
    description: Optional[str] = Field(
        default=None, max_length=500, description="Subcategory description"
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this subcategory is active",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Subcategory creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    category: "Category" = Relationship(
        back_populates="subcategories",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "Subcategory.category_id",
        },
    )
    requests: List["ServiceRequest"] = Relationship(
        back_populates="subcategory",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    __table_args__ = (
        Index("ix_subcategories_category_id", "category_id"),
        Index("ix_subcategories_name", "name"),
        Index("ix_subcategories_is_active", "is_active"),
        Index(
            "ix_subcategories_category_name",
            "category_id",
            "name",
            unique=True,
        ),
    )


class Tag(TableModel, table=True):
    """Tag model for service requests with bilingual support."""

    __tablename__ = "tags"

    id: Optional[int] = Field(default=None, primary_key=True)
    name_en: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Tag name in English",
    )
    name_ar: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Tag name in Arabic",
    )
    category_id: int = Field(
        sa_column=Column(Integer, ForeignKey("categories.id"), nullable=False),
        description="Parent category",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this tag is active",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True
        ),
        description="User UUID who created the tag",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True
        ),
        description="User UUID who last updated the tag",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Tag creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    category: "Category" = Relationship(
        back_populates="tags", sa_relationship_kwargs={"lazy": "selectin"}
    )
    requests: List["ServiceRequest"] = Relationship(
        back_populates="tag", sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_tags_category_id", "category_id"),
        Index("ix_tags_is_active", "is_active"),
        Index("ix_tags_is_deleted", "is_deleted"),
    )


class RequestNote(TableModel, table=True):
    """Request note table - for tracking, hints, or general comments.

    Renamed from ServiceRequestNote/service_request_notes for brevity.
    """

    __tablename__ = "request_notes"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request ID",
    )
    created_by: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False
        ),
        description="User UUID who created the note",
    )
    note: str = Field(
        min_length=1,
        max_length=2000,
        sa_column=Column(Text, nullable=False),
        description="Note content",
    )
    is_system_generated: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether this note was auto-generated",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Note creation timestamp",
    )

    # Relationships
    request: "ServiceRequest" = Relationship(
        back_populates="notes",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestNote.request_id",
        },
    )
    creator: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RequestNote.created_by",
        }
    )

    __table_args__ = (
        Index("ix_request_notes_request_id", "request_id"),
        Index("ix_request_notes_created_by", "created_by"),
        Index("ix_request_notes_created_at", "created_at"),
        Index(
            "ix_request_notes_request_created",
            "request_id",
            "created_at",
        ),
    )


class BusinessUnitRegion(TableModel, table=True):
    """Business Unit Region model."""

    __tablename__ = "business_unit_regions"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Region name",
    )
    description: Optional[str] = Field(
        default=None, max_length=500, description="Region description"
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Region creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this region",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this region",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this region is active",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )

    # Relationships
    business_units: List["BusinessUnit"] = Relationship(
        back_populates="region", sa_relationship_kwargs={"lazy": "selectin"}
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "BusinessUnitRegion.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "BusinessUnitRegion.updated_by",
        }
    )
    # NEW: TechnicianRegion relationship (renamed from RegionUserAssign)
    user_assigns: List["TechnicianRegion"] = Relationship(
        back_populates="region", sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_business_unit_regions_name", "name", unique=True),
        Index("ix_business_unit_regions_created_by", "created_by"),
        Index("ix_business_unit_regions_created_at", "created_at"),
        Index("ix_business_unit_regions_is_active", "is_active"),
        Index("ix_business_unit_regions_is_deleted", "is_deleted"),
    )


class BusinessUnit(TableModel, table=True):
    """Business Unit model."""

    __tablename__ = "business_units"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Business unit name",
    )
    description: Optional[str] = Field(
        default=None, max_length=500, description="Business unit description"
    )
    network: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Network CIDR (e.g., 10.23.0.0/16)",
    )
    business_unit_region_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("business_unit_regions.id"), nullable=True
        ),
        description="Business unit region (optional)",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Business unit creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this business unit",
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this business unit",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this business unit is active",
    )
    is_deleted: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Soft delete flag",
    )

    # Out-of-shift escalation fields
    working_hours: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Working hours schedule (JSON)",
    )
    whatsapp_group_name: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="WhatsApp group name for out-of-shift escalation",
    )
    whatsapp_group_id: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="WhatsApp group ID for Zapier integration",
    )
    whatsapp_outshift_interval_minutes: int = Field(
        default=30,
        ge=5,
        sa_column=Column(Integer, default=30, nullable=False),
        description="Interval in minutes for periodic out-of-shift WhatsApp sends (minimum 5)",
    )

    # Relationships
    region: "BusinessUnitRegion" = Relationship(
        back_populates="business_units",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "BusinessUnit.business_unit_region_id",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "BusinessUnit.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "BusinessUnit.updated_by",
        }
    )
    # NEW: TechnicianBusinessUnit relationship (alias: BusinessUnitUserAssign)
    technician_assigns: List["TechnicianBusinessUnit"] = Relationship(
        back_populates="business_unit",
        sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_business_units_name", "name", unique=True),
        Index("ix_business_units_region_id", "business_unit_region_id"),
        Index("ix_business_units_created_by", "created_by"),
        Index("ix_business_units_created_at", "created_at"),
        Index("ix_business_units_is_active", "is_active"),
        Index("ix_business_units_is_deleted", "is_deleted"),
    )


class WhatsAppBatch(TableModel, table=True):
    """WhatsApp message batch - idempotency guard for sent messages."""

    __tablename__ = "whatsapp_batches"

    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service request this batch belongs to",
    )

    business_unit_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("business_units.id", ondelete="SET NULL"), nullable=True
        ),
        description="Business unit at time of send",
    )

    # Message range covered by this batch (idempotency key)
    # Nullable to support "request_created" batch type with no messages
    first_message_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("chat_messages.id", ondelete="CASCADE"),
            nullable=True,
        ),
        description="First message ID in batch (inclusive), NULL for request_created batches",
    )

    last_message_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("chat_messages.id", ondelete="CASCADE"),
            nullable=True,
        ),
        description="Last message ID in batch (inclusive), NULL for request_created batches",
    )

    message_count: int = Field(
        sa_column=Column(Integer, nullable=False),
        description="Number of messages in this batch",
    )

    batch_type: str = Field(
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Batch type: 'first_debounced', 'subsequent_debounced', or 'request_created'",
    )

    # Delivery tracking
    sent_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="When batch was sent",
    )

    delivery_status: str = Field(
        default="pending",
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Status: pending, sent, failed",
    )

    payload_snapshot: dict = Field(
        sa_column=Column(JSON, nullable=False),
        description="Snapshot of batch payload (JSON)",
    )

    error_message: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Error message if delivery failed",
    )

    # Relationships
    request: "ServiceRequest" = Relationship()
    business_unit: Optional["BusinessUnit"] = Relationship()

    __table_args__ = (
        # CRITICAL: Unique constraint prevents duplicate batches for same message range
        # Note: This works for batches with messages (first_message_id, last_message_id not NULL)
        UniqueConstraint(
            "request_id", "first_message_id", "last_message_id",
            name="uq_whatsapp_batch_message_range",
        ),
        # Note: Additional partial unique constraint for request_created batches
        # is created manually in migration (SQLModel doesn't support WHERE clause)
        Index("ix_whatsapp_batches_request_id", "request_id"),
        Index("ix_whatsapp_batches_business_unit_id", "business_unit_id"),
        Index("ix_whatsapp_batches_sent_at", "sent_at"),
        Index("ix_whatsapp_batches_batch_type", "batch_type"),
    )


class TechnicianSection(TableModel, table=True):
    """Technician Section - Assigns technicians to service sections."""

    __tablename__ = "technician_sections"

    id: Optional[int] = Field(default=None, primary_key=True)

    technician_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        description="Technician user ID",
    )
    section_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("service_sections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Service section ID",
    )

    # Audit fields
    assigned_by: UUID = Field(
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id")),
        description="User who made the assignment"
    )
    assigned_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(
            DateTime,
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(
            DateTime,
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(
            DateTime,
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
            onupdate=cairo_now,
        ),
    )

    # Relationships
    technician: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianSection.technician_id",
        }
    )
    section: "ServiceSection" = Relationship(
        back_populates="technician_assignments",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianSection.section_id",
        },
    )
    assigner: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianSection.assigned_by",
        }
    )

    __table_args__ = (
        UniqueConstraint(
            "technician_id", "section_id", name="uq_technician_section"
        ),
        Index("ix_technician_sections_technician_id", "technician_id"),
        Index("ix_technician_sections_section_id", "section_id"),
        Index("ix_technician_sections_assigned_at", "assigned_at"),
    )


class SystemMessage(TableModel, table=True):
    """System messages for auto-generated bilingual chat notifications."""

    __tablename__ = "system_messages"

    id: Optional[int] = Field(default=None, primary_key=True)

    message_type: str = Field(
        min_length=2,
        max_length=50,
        sa_column=Column(String(50), nullable=False, unique=True),
        description="Message type identifier (e.g., 'new_request', 'ticket_assigned', 'request_solved')"
    )

    template_en: str = Field(
        min_length=2,
        max_length=500,
        sa_column=Column(String(500), nullable=False),
        description="English template with {placeholders}"
    )

    template_ar: str = Field(
        min_length=2,
        max_length=500,
        sa_column=Column(String(500), nullable=False),
        description="Arabic template with {placeholders}"
    )

    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this template is active"
    )

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Template creation timestamp"
    )

    # Relationships
    system_events: List["SystemEvent"] = Relationship(
        back_populates="system_message",
        sa_relationship_kwargs={"lazy": "selectin"}
    )

    __table_args__ = (
        Index("ix_system_messages_message_type", "message_type", unique=True),
        Index("ix_system_messages_is_active", "is_active"),
    )


class SystemEvent(TableModel, table=True):
    """System events configuration for automated chat message triggers."""

    __tablename__ = "system_events"

    id: Optional[int] = Field(default=None, primary_key=True)

    event_key: str = Field(
        min_length=2,
        max_length=50,
        sa_column=Column(String(50), nullable=False, unique=True),
        description="Unique event identifier (e.g., 'new_request', 'ticket_assigned')"
    )

    event_name_en: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Event display name in English"
    )

    event_name_ar: str = Field(
        min_length=2,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Event display name in Arabic"
    )

    description_en: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Event description in English (what triggers it)"
    )

    description_ar: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Event description in Arabic (what triggers it)"
    )

    system_message_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("system_messages.id"), nullable=True),
        description="Linked system message template (nullable for events without message)"
    )

    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this event trigger is enabled"
    )

    trigger_timing: str = Field(
        default="immediate",
        max_length=20,
        sa_column=Column(String(20), nullable=False, server_default="immediate"),
        description="Trigger timing: 'immediate' or 'delayed' (for future extensibility)"
    )

    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Event creation timestamp"
    )

    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp"
    )

    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who created this event"
    )

    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who last updated this event"
    )

    # Relationships
    system_message: Optional["SystemMessage"] = Relationship(
        back_populates="system_events",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "SystemEvent.system_message_id",
        }
    )

    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "SystemEvent.created_by",
        }
    )

    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "SystemEvent.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_system_events_event_key", "event_key", unique=True),
        Index("ix_system_events_is_active", "is_active"),
        Index("ix_system_events_system_message_id", "system_message_id"),
        Index("ix_system_events_trigger_timing", "trigger_timing"),
        Index("ix_system_events_created_at", "created_at"),
    )


class UserCustomView(TableModel, table=True):
    """
    User view configuration - ONE view per user controlling visible tabs.

    This model stores which predefined view tabs are visible for each user.
    Each user can have only ONE custom view configuration.
    """

    __tablename__ = "user_custom_views"

    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,  # ONE view per user
        ),
        description="User who owns this view configuration",
    )

    # Tab visibility configuration - list of visible tab IDs
    visible_tabs: list[str] = Field(
        default=[
            "unassigned",
            "all_unsolved",
            "my_unsolved",
            "recently_updated",
            "recently_solved",
        ],
        sa_column=Column(
            JSON,
            nullable=False,
            default=[
                "unassigned",
                "all_unsolved",
                "my_unsolved",
                "recently_updated",
                "recently_solved",
            ],
        ),
        description="List of visible tab IDs (e.g., ['unassigned', 'my_unsolved'])",
    )

    # Optional: Default tab to show when loading
    default_tab: str = Field(
        default="unassigned",
        max_length=50,
        description="Default tab to display when user opens the tickets page",
    )

    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this view configuration is active",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Creation timestamp",
    )

    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    user: Optional["User"] = Relationship(
        back_populates="custom_view",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "UserCustomView.user_id",
            "uselist": False,  # ONE view per user
        },
    )

    __table_args__ = (
        # user_id is already unique in the column definition
        Index("ix_user_custom_views_is_active", "is_active"),
    )


# ============================================================================
# REPORTING AND ANALYTICS TABLES
# ============================================================================


class SLAConfig(TableModel, table=True):
    """SLA Configuration - Defines SLA targets per priority and optionally per category.

    Allows overriding default priority SLA times for specific categories or business units.
    """

    __tablename__ = "sla_configs"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Optional overrides - if not set, uses default priority SLA times
    priority_id: int = Field(
        sa_column=Column(Integer, ForeignKey("priorities.id"), nullable=False),
        description="Priority level this SLA applies to",
    )
    category_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("categories.id"), nullable=True),
        description="Optional category override (if null, applies to all categories)",
    )
    business_unit_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("business_units.id"), nullable=True),
        description="Optional business unit override (if null, applies to all)",
    )

    # SLA targets
    first_response_minutes: int = Field(
        ge=0, description="Target first response time in minutes"
    )
    resolution_hours: int = Field(
        ge=0, description="Target resolution time in hours"
    )

    # Configuration
    business_hours_only: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Calculate SLA during business hours only (9 AM - 5 PM)",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this SLA config is active",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Config creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    priority: "Priority" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "SLAConfig.priority_id",
        }
    )
    category: Optional["Category"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "SLAConfig.category_id",
        }
    )
    business_unit: Optional["BusinessUnit"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "SLAConfig.business_unit_id",
        }
    )

    __table_args__ = (
        Index("ix_sla_configs_priority_id", "priority_id"),
        Index("ix_sla_configs_category_id", "category_id"),
        Index("ix_sla_configs_business_unit_id", "business_unit_id"),
        Index("ix_sla_configs_is_active", "is_active"),
        # Unique constraint for combination
        UniqueConstraint(
            "priority_id", "category_id", "business_unit_id",
            name="uq_sla_config_priority_category_bu"
        ),
    )


class TechnicianMetricsSnapshot(TableModel, table=True):
    """Technician Metrics Snapshot - Daily performance metrics for technicians.

    Captures daily performance data for historical analysis and trending.
    Generated by a scheduled task at the end of each day.
    """

    __tablename__ = "technician_metrics_snapshots"

    id: Optional[int] = Field(default=None, primary_key=True)

    technician_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Technician user ID",
    )
    snapshot_date: datetime = Field(
        sa_column=Column(DateTime, nullable=False),
        description="Date of the snapshot (start of day)",
    )

    # Ticket counts
    tickets_assigned: int = Field(
        default=0, ge=0, description="Tickets assigned during this period"
    )
    tickets_resolved: int = Field(
        default=0, ge=0, description="Tickets resolved during this period"
    )
    tickets_reopened: int = Field(
        default=0, ge=0, description="Tickets reopened during this period"
    )
    tickets_closed: int = Field(
        default=0, ge=0, description="Tickets closed during this period"
    )

    # Current workload (snapshot at end of day)
    open_ticket_count: int = Field(
        default=0, ge=0, description="Open tickets at end of period"
    )

    # Response times (in minutes)
    avg_first_response_minutes: Optional[float] = Field(
        default=None, ge=0, description="Average first response time in minutes"
    )
    min_first_response_minutes: Optional[float] = Field(
        default=None, ge=0, description="Minimum first response time in minutes"
    )
    max_first_response_minutes: Optional[float] = Field(
        default=None, ge=0, description="Maximum first response time in minutes"
    )

    # Resolution times (in minutes)
    avg_resolution_minutes: Optional[float] = Field(
        default=None, ge=0, description="Average resolution time in minutes"
    )
    min_resolution_minutes: Optional[float] = Field(
        default=None, ge=0, description="Minimum resolution time in minutes"
    )
    max_resolution_minutes: Optional[float] = Field(
        default=None, ge=0, description="Maximum resolution time in minutes"
    )

    # SLA metrics
    sla_first_response_met: int = Field(
        default=0, ge=0, description="Tickets where first response SLA was met"
    )
    sla_first_response_breached: int = Field(
        default=0, ge=0, description="Tickets where first response SLA was breached"
    )
    sla_resolution_met: int = Field(
        default=0, ge=0, description="Tickets where resolution SLA was met"
    )
    sla_resolution_breached: int = Field(
        default=0, ge=0, description="Tickets where resolution SLA was breached"
    )

    # Calculated rates (stored for convenience)
    sla_compliance_rate: Optional[float] = Field(
        default=None, ge=0, le=100, description="Overall SLA compliance percentage"
    )
    resolution_rate: Optional[float] = Field(
        default=None, ge=0, le=100, description="Resolution rate percentage"
    )

    # Timestamp
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Snapshot creation timestamp",
    )

    # Relationships
    technician: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "TechnicianMetricsSnapshot.technician_id",
        }
    )

    __table_args__ = (
        Index("ix_tech_metrics_technician_id", "technician_id"),
        Index("ix_tech_metrics_snapshot_date", "snapshot_date"),
        Index("ix_tech_metrics_tech_date", "technician_id", "snapshot_date"),
        # One snapshot per technician per day
        UniqueConstraint(
            "technician_id", "snapshot_date",
            name="uq_technician_metrics_snapshot_date"
        ),
    )


class ReportConfig(TableModel, table=True):
    """Report Configuration - Saved and scheduled report configurations.

    Allows users to save report configurations and schedule automatic generation.
    """

    __tablename__ = "report_configs"

    id: Optional[int] = Field(default=None, primary_key=True)

    name: str = Field(
        min_length=2,
        max_length=100,
        description="Report name",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Report description",
    )

    # Report type
    report_type: str = Field(
        min_length=2,
        max_length=50,
        description="Report type: executive, agent_performance, sla_compliance, volume, custom",
    )

    # Filter configuration (JSON)
    filters: dict = Field(
        default={},
        sa_column=Column(JSON, nullable=False, default={}),
        description="Report filters (date_range, business_unit_ids, agent_ids, etc.)",
    )

    # Display configuration (JSON)
    display_config: dict = Field(
        default={},
        sa_column=Column(JSON, nullable=False, default={}),
        description="Display configuration (columns, charts, grouping, etc.)",
    )

    # Scheduling
    schedule_cron: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Cron expression for scheduled reports (e.g., '0 9 * * 1' for Mondays 9 AM)",
    )
    recipients: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Email addresses for scheduled report delivery",
    )
    last_run_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last time this report was generated",
    )

    # Ownership
    created_by_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="User who created this report config",
    )

    # Sharing
    is_public: bool = Field(
        default=False,
        sa_column=Column(Boolean, default=False, nullable=False),
        description="Whether this report is visible to other users",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, default=True, nullable=False),
        description="Whether this report config is active",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Config creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    # Relationships
    created_by: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ReportConfig.created_by_id",
        }
    )

    __table_args__ = (
        Index("ix_report_configs_created_by_id", "created_by_id"),
        Index("ix_report_configs_report_type", "report_type"),
        Index("ix_report_configs_is_public", "is_public"),
        Index("ix_report_configs_is_active", "is_active"),
        Index("ix_report_configs_schedule", "schedule_cron"),
    )


# ============================================================================
# REMOTE ACCESS MODELS
# ============================================================================


class RemoteAccessSession(TableModel, table=True):
    """Remote access session with durable state tracking.

    This table provides:
    - Session ID mapping (for reconnection)
    - Authorization (agent <-> requester <-> request)
    - Durable session state (status, control mode)
    - Audit trail (start/end timestamps, end reason)

    WebRTC signaling remains ephemeral (SignalR only).
    Session lifecycle is durable (FastAPI + DB).
    """

    __tablename__ = "remote_access_sessions"

    # Session identity
    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
        description="Session UUID for reconnection",
    )
    request_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=True,
        ),
        description="Associated service request ID (optional for direct sessions)",
    )
    agent_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id"),
            nullable=False,
        ),
        description="Agent/technician who initiated session",
    )
    requester_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id"),
            nullable=False,
        ),
        description="Requester whose screen is being shared",
    )

    # Durable session state
    status: str = Field(
        default="active",
        sa_column=Column(String(20), nullable=False, server_default="active"),
        description="Session status: active, ended",
    )
    control_enabled: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
        description="Whether remote control is enabled (view vs control mode)",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Session creation timestamp",
    )
    ended_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Session end timestamp",
    )
    end_reason: Optional[str] = Field(
        default=None,
        sa_column=Column(String(50), nullable=True),
        description="Why session ended: agent_disconnected, requester_disconnected, timeout, manual, replaced_by_new_request",
    )
    last_heartbeat: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last heartbeat timestamp from client (for orphan detection)",
    )

    # Relationships (for eager loading user/request context)
    request: "ServiceRequest" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RemoteAccessSession.request_id",
        }
    )
    agent: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RemoteAccessSession.agent_id",
        }
    )
    requester: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RemoteAccessSession.requester_id",
        }
    )

    __table_args__ = (
        Index("ix_remote_sessions_request_id", "request_id"),
        Index("ix_remote_sessions_agent_id", "agent_id"),
        Index("ix_remote_sessions_requester_id", "requester_id"),
        Index("ix_remote_sessions_created_at", "created_at"),
        Index("ix_remote_sessions_status", "status"),
    )


# ============================================================================
# NOTIFICATION EVENTS (Durable Notification Tracking)
# ============================================================================


class NotificationEvent(TableModel, table=True):
    """
    Durable notification event storage for recovery after client reconnection.

    This table ensures notifications are not lost when clients are offline:
    - Stores all user-affecting notifications (subscriptions, messages, system events)
    - Tracks delivery status for recovery on reconnect
    - Enables HTTP-based recovery endpoint

    Contract:
    - Notifications are persisted BEFORE SignalR broadcast
    - Clients can fetch pending notifications via HTTP on reconnect
    - Once delivered (via HTTP or SignalR), delivered_at is set
    """

    __tablename__ = "notification_events"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
        description="Event UUID for deduplication",
    )
    user_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Target user for this notification",
    )
    event_type: str = Field(
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Event type: subscription_added, subscription_removed, new_message, system, ticket_update",
    )
    request_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=True,
        ),
        description="Related service request (if applicable)",
    )
    payload: dict = Field(
        default={},
        sa_column=Column(JSON, nullable=False, default={}),
        description="Event-specific payload data",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="When this notification was created",
    )
    delivered_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When this notification was delivered (NULL = pending)",
    )

    # Relationships
    user: "User" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "NotificationEvent.user_id",
        }
    )
    request: "ServiceRequest" = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "NotificationEvent.request_id",
        }
    )

    __table_args__ = (
        Index("ix_notification_events_user_id", "user_id"),
        Index("ix_notification_events_event_type", "event_type"),
        Index("ix_notification_events_request_id", "request_id"),
        Index("ix_notification_events_created_at", "created_at"),
        Index("ix_notification_events_delivered_at", "delivered_at"),
        # Composite index for pending notifications query
        Index("ix_notification_events_user_pending", "user_id", "delivered_at"),
    )


# ============================================================================
# CLIENT VERSION MANAGEMENT
# ============================================================================


class ClientVersion(TableModel, table=True):
    """
    Client application version registry.

    Tracks all known client versions and their enforcement status.
    Version ordering is server-defined via order_index (NO semantic version comparison).

    This is foundational infrastructure for the Version Authority system:
    - Maintains authoritative registry of client versions
    - Supports soft enforcement (visual indicators only, no blocking)
    - Policy resolution is stateless and deterministic

    Invariants:
    - Exactly one version per platform should have is_latest=True
    - Zero or one version per platform should have is_enforced=True
    - Version strings are opaque identifiers (no semantic parsing)
    """

    __tablename__ = "client_versions"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Version identifier (opaque string from client)
    version_string: str = Field(
        min_length=1,
        max_length=50,
        sa_column=Column(String(50), nullable=False, unique=True),
        description="Version string as reported by client (e.g., '1.0.0', '2.1.3-beta')",
    )

    # Platform discrimination
    platform: str = Field(
        default="desktop",
        max_length=20,
        sa_column=Column(String(20), nullable=False, server_default=text("'desktop'")),
        description="Platform identifier: 'desktop', 'web', 'mobile'",
    )

    # Server-defined ordering (higher = newer, no semantic versioning)
    order_index: int = Field(
        sa_column=Column(Integer, nullable=False),
        description="Server-defined order for comparison (higher = newer)",
    )

    # Policy flags
    is_latest: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default=text("false")),
        description="Whether this is the current latest version for its platform",
    )
    is_enforced: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default=text("false")),
        description="Whether outdated versions should show enforced update status",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default=text("true")),
        description="Whether this version entry is active in the registry",
    )

    # Optional metadata
    release_notes: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Optional release notes or changelog",
    )
    released_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When this version was released",
    )

    # Upgrade distribution metadata (desktop only)
    # Note: These fields become effectively immutable once version is enforced
    # to prevent breaking in-flight update workflows
    installer_url: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="URL to download the installer for this version",
    )
    installer_object_key: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="MinIO object key for the installer file (when uploaded via MinIO)",
    )
    silent_install_args: Optional[str] = Field(
        default="/qn /norestart",
        max_length=100,
        sa_column=Column(String(100), nullable=True, server_default=text("'/qn /norestart'")),
        description="Command-line arguments for silent installation",
    )

    # Audit fields
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Entry creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )

    __table_args__ = (
        Index("ix_client_versions_version_string", "version_string", unique=True),
        Index("ix_client_versions_platform", "platform"),
        Index("ix_client_versions_order_index", "order_index"),
        Index("ix_client_versions_is_latest", "is_latest"),
        Index("ix_client_versions_is_enforced", "is_enforced"),
        Index("ix_client_versions_is_active", "is_active"),
        # Composite index for efficient policy lookup
        Index("ix_client_versions_platform_active", "platform", "is_active"),
    )


# ============================================================================
# DEPLOYMENT CONTROL PLANE MODELS
# ============================================================================


class Device(TableModel, table=True):
    """
    Discovered device for deployment management.

    Devices can be discovered from:
    - Active Directory (computer objects)
    - Network subnet scans
    - Existing DesktopSession records

    The lifecycle_state tracks the deployment status:
    - discovered: Device found but no action taken
    - install_pending: Installation job created, awaiting worker
    - installed_unenrolled: Client installed but not enrolled
    - enrolled: Client enrolled with backend
    - managed: Fully managed device
    - quarantined: Device isolated due to security/compliance
    """

    __tablename__ = "devices"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    hostname: str = Field(
        ...,
        min_length=1,
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="Device hostname (computer name)",
    )
    ip_address: Optional[str] = Field(
        default=None,
        max_length=45,
        sa_column=Column(String(45), nullable=True),
        description="Device IP address (IPv4 or IPv6)",
    )
    mac_address: Optional[str] = Field(
        default=None,
        max_length=17,
        sa_column=Column(String(17), nullable=True),
        description="Device MAC address (XX:XX:XX:XX:XX:XX format)",
    )
    lifecycle_state: str = Field(
        default="discovered",
        max_length=50,
        sa_column=Column(String(50), nullable=False, server_default=text("'discovered'")),
        description="Device lifecycle state",
    )
    discovery_source: str = Field(
        ...,
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="How the device was discovered (ad, network_scan, desktop_session)",
    )
    ad_computer_dn: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Active Directory distinguished name (if discovered from AD)",
    )
    desktop_session_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("desktop_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="Link to active DesktopSession if device has requester app running",
    )
    last_seen_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last time device was seen (heartbeat, discovery, etc.)",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Device creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
        description="Last update timestamp",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="User who discovered/created this device record",
    )

    # Relationships
    desktop_session: Optional["DesktopSession"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[Device.desktop_session_id]",
        },
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[Device.created_by]",
        },
    )

    # Validators
    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v):
        """Validate IP address format if provided."""
        if v is None:
            return v
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid IP address format: {v}")

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, v):
        """Validate MAC address format if provided."""
        if v is None:
            return v
        mac_pattern = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$")
        if not mac_pattern.match(v):
            raise ValueError(f"Invalid MAC address format: {v}. Expected XX:XX:XX:XX:XX:XX")
        return v.upper()

    __table_args__ = (
        Index("ix_devices_hostname", "hostname"),
        Index("ix_devices_lifecycle_state", "lifecycle_state"),
        Index("ix_devices_discovery_source", "discovery_source"),
        Index("ix_devices_created_at", "created_at"),
        Index("ix_devices_desktop_session_id", "desktop_session_id"),
        # Composite index for finding devices by state and source
        Index("ix_devices_state_source", "lifecycle_state", "discovery_source"),
    )


class DeploymentJob(TableModel, table=True):
    """
    Immutable deployment job for worker execution.

    Jobs are created by the control plane when a user triggers an action
    (e.g., install NetSupport). The Rust deployment worker claims and
    executes jobs, reporting results back.

    Key invariants:
    - payload is IMMUTABLE after creation
    - status transitions: queued -> in_progress -> done|failed
    - claimed_by/claimed_at set atomically when worker claims job
    """

    __tablename__ = "deployment_jobs"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    job_type: str = Field(
        ...,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Job type identifier (e.g., 'netsupport_install')",
    )
    status: str = Field(
        default="queued",
        max_length=50,
        sa_column=Column(String(50), nullable=False, server_default=text("'queued'")),
        description="Job status (queued, in_progress, done, failed)",
    )
    payload: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
        description="Immutable execution plan (targets, installer info, constraints)",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="User who created this job",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Job creation timestamp",
    )
    claimed_by: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="Worker ID that claimed this job",
    )
    claimed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When the job was claimed by a worker",
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When the job completed (success or failure)",
    )
    result: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Per-target results reported by worker",
    )
    error_message: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Error message if job failed",
    )

    # Relationships
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[DeploymentJob.created_by]",
        },
    )

    __table_args__ = (
        Index("ix_deployment_jobs_status", "status"),
        Index("ix_deployment_jobs_job_type", "job_type"),
        Index("ix_deployment_jobs_created_at", "created_at"),
        # Composite index for worker job claiming (queued + oldest first)
        Index("ix_deployment_jobs_status_created", "status", "created_at"),
    )


class Credential(TableModel, table=True):
    """
    Credential metadata for deployment operations.

    This table stores METADATA ONLY - actual secrets are stored in an
    external vault. The vault_ref field contains an opaque reference
    that the worker uses to retrieve secrets from the vault.

    Security invariants:
    - vault_ref is NEVER returned to frontend
    - Only internal worker APIs can access vault_ref
    - scope defines which devices/subnets this credential applies to
    """

    __tablename__ = "credentials"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Human-readable credential name",
    )
    credential_type: str = Field(
        ...,
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Credential type (local_admin, domain_admin)",
    )
    scope: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
        description="Scope definition (subnets, device groups, etc.)",
    )
    vault_ref: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Opaque vault reference for worker (NEVER expose to frontend)",
    )
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="User who created this credential",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Credential creation timestamp",
    )
    last_used_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last time this credential was used in a deployment",
    )
    enabled: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default=text("true")),
        description="Whether this credential is active",
    )

    # Relationships
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[Credential.created_by]",
        },
    )

    __table_args__ = (
        Index("ix_credentials_name", "name"),
        Index("ix_credentials_type", "credential_type"),
        Index("ix_credentials_enabled", "enabled"),
        Index("ix_credentials_created_at", "created_at"),
    )


# ============================================================================
# REMOVED TABLES (commented out for reference):
# - RequestMetrics (lines 1081-1287 in original)
# - ServiceRequestUser (lines 961-1004 in original)
# - BusinessUnitRole (lines 1415-1440 in original)
# - BusinessUnitUserAssign (lines 1443-1524 in original)
# ============================================================================

# =============================================================================
# SCHEDULER MANAGEMENT MODELS
# =============================================================================


class TaskFunction(TableModel, table=True):
    """Registry of available task functions that can be scheduled."""

    __tablename__ = "task_functions"

    id: int = Field(default=None, primary_key=True)
    name: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Task function identifier (e.g., sync_domain_users)",
    )
    display_name: str = Field(
        max_length=200,
        sa_column=Column(String(200), nullable=False),
        description="Human-readable display name",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Task description",
    )
    handler_path: str = Field(
        max_length=500,
        sa_column=Column(String(500), nullable=False),
        description="Python module path (e.g., tasks.ad_sync_tasks.sync_domain_users_task)",
    )
    handler_type: str = Field(
        max_length=20,
        sa_column=Column(String(20), nullable=False),
        description="Handler type: celery_task or async_function",
    )
    queue: Optional[str] = Field(
        default=None,
        max_length=50,
        sa_column=Column(String(50), nullable=True),
        description="Celery queue name (for celery_task type)",
    )
    default_timeout_seconds: int = Field(
        default=300,
        ge=30,
        le=3600,
        sa_column=Column(Integer, nullable=False, default=300),
        description="Default execution timeout in seconds",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, default=True),
        description="Whether this task function is active",
    )
    is_system: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, default=False),
        description="System tasks cannot be deleted",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
    )

    # Relationships
    scheduled_jobs: List["ScheduledJob"] = Relationship(
        back_populates="task_function",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    __table_args__ = (
        Index("ix_task_functions_name", "name", unique=True),
        Index("ix_task_functions_is_active", "is_active"),
    )


class SchedulerJobType(TableModel, table=True):
    """Lookup table for job schedule types."""

    __tablename__ = "scheduler_job_types"

    id: int = Field(default=None, primary_key=True)
    name: str = Field(
        max_length=50,
        sa_column=Column(String(50), nullable=False, unique=True),
        description="Job type name (interval, cron)",
    )
    display_name: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Human-readable display name",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Job type description",
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, default=True),
        description="Whether this job type is active",
    )

    # Relationships
    scheduled_jobs: List["ScheduledJob"] = Relationship(
        back_populates="job_type",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    __table_args__ = (
        Index("ix_scheduler_job_types_name", "name", unique=True),
    )


class ScheduledJob(TableModel, table=True):
    """Job configuration with schedule settings."""

    __tablename__ = "scheduled_jobs"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    name: str = Field(
        max_length=200,
        sa_column=Column(String(200), nullable=False),
        description="Job name",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        sa_column=Column(Text, nullable=True),
        description="Job description",
    )

    # Task function reference
    task_function_id: int = Field(
        sa_column=Column(Integer, ForeignKey("task_functions.id"), nullable=False),
        description="Task function to execute",
    )
    task_function: "TaskFunction" = Relationship(
        back_populates="scheduled_jobs",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    # Schedule type reference
    job_type_id: int = Field(
        sa_column=Column(Integer, ForeignKey("scheduler_job_types.id"), nullable=False),
        description="Schedule type (interval or cron)",
    )
    job_type: "SchedulerJobType" = Relationship(
        back_populates="scheduled_jobs",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    # Schedule configuration (JSON)
    schedule_config: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
        description="Schedule configuration (interval or cron settings)",
    )
    task_args: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Arguments to pass to task function",
    )

    # Execution settings
    max_instances: int = Field(
        default=1,
        ge=1,
        le=10,
        sa_column=Column(Integer, nullable=False, default=1),
        description="Maximum concurrent instances",
    )
    timeout_seconds: int = Field(
        default=300,
        ge=30,
        le=3600,
        sa_column=Column(Integer, nullable=False, default=300),
        description="Execution timeout in seconds",
    )
    retry_count: int = Field(
        default=3,
        ge=0,
        le=10,
        sa_column=Column(Integer, nullable=False, default=3),
        description="Number of retries on failure",
    )
    retry_delay_seconds: int = Field(
        default=60,
        ge=0,
        le=3600,
        sa_column=Column(Integer, nullable=False, default=60),
        description="Delay between retries in seconds",
    )

    # Status
    is_enabled: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, default=True),
        description="Whether this job is enabled",
    )
    is_paused: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, default=False),
        description="Whether this job is temporarily paused",
    )
    next_run_time: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Next scheduled execution time",
    )
    last_run_time: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Last execution time",
    )
    last_status: Optional[str] = Field(
        default=None,
        max_length=20,
        sa_column=Column(String(20), nullable=True),
        description="Last execution status (success, failed, running)",
    )

    # Audit
    created_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    updated_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
    )

    # Relationships
    executions: List["ScheduledJobExecution"] = Relationship(
        back_populates="job",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    creator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ScheduledJob.created_by",
        }
    )
    updater: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ScheduledJob.updated_by",
        }
    )

    __table_args__ = (
        Index("ix_scheduled_jobs_is_enabled", "is_enabled"),
        Index("ix_scheduled_jobs_next_run_time", "next_run_time"),
        Index("ix_scheduled_jobs_task_function_id", "task_function_id"),
        Index("ix_scheduled_jobs_created_at", "created_at"),
    )


class ScheduledJobExecution(TableModel, table=True):
    """Execution history for scheduled jobs."""

    __tablename__ = "scheduled_job_executions"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    job_id: UUID = Field(
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("scheduled_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        description="Scheduled job ID",
    )
    job: "ScheduledJob" = Relationship(
        back_populates="executions",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    celery_task_id: Optional[str] = Field(
        default=None,
        max_length=100,
        sa_column=Column(String(100), nullable=True),
        description="Celery task ID",
    )
    status: str = Field(
        max_length=20,
        sa_column=Column(String(20), nullable=False),
        description="Execution status: pending, running, success, failed, timeout",
    )

    started_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Execution start time",
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="Execution completion time",
    )
    duration_seconds: Optional[float] = Field(
        default=None,
        ge=0,
        sa_column=Column(Integer, nullable=True),
        description="Execution duration in seconds",
    )

    result: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Execution result data",
    )
    error_message: Optional[str] = Field(
        default=None,
        max_length=2000,
        sa_column=Column(String(2000), nullable=True),
        description="Error message if failed",
    )
    error_traceback: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Full error traceback",
    )

    triggered_by: str = Field(
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Trigger source: scheduler, manual, api",
    )
    triggered_by_user_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="User who triggered the execution (for manual/api)",
    )
    scheduler_instance_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(
            PostgreSQL_UUID(as_uuid=True),
            ForeignKey("scheduler_instances.id", ondelete="SET NULL"),
            nullable=True,
        ),
        description="Scheduler instance that triggered this execution",
    )

    # Relationships
    triggered_by_user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "ScheduledJobExecution.triggered_by_user_id",
        }
    )

    __table_args__ = (
        Index("ix_scheduled_job_executions_job_id", "job_id"),
        Index("ix_scheduled_job_executions_status", "status"),
        Index("ix_scheduled_job_executions_started_at", "started_at"),
        Index("ix_scheduled_job_executions_job_status", "job_id", "status"),
    )


class SchedulerInstance(TableModel, table=True):
    """Tracks scheduler instances for leader election."""

    __tablename__ = "scheduler_instances"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    hostname: str = Field(
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="Instance hostname",
    )
    pid: int = Field(
        sa_column=Column(Integer, nullable=False),
        description="Process ID",
    )

    is_leader: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, default=False),
        description="Whether this instance is the leader",
    )
    leader_since: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
        description="When this instance became leader",
    )
    last_heartbeat: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Last heartbeat timestamp",
    )

    started_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Instance start time",
    )
    version: str = Field(
        max_length=50,
        sa_column=Column(String(50), nullable=False),
        description="Scheduler version",
    )

    __table_args__ = (
        Index("ix_scheduler_instances_is_leader", "is_leader"),
        Index("ix_scheduler_instances_last_heartbeat", "last_heartbeat"),
        Index("ix_scheduler_instances_hostname_pid", "hostname", "pid"),
    )


class ActiveDirectoryConfig(TableModel, table=True):
    """Active Directory configuration stored in database with encrypted credentials."""

    __tablename__ = "active_directory_configs"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    name: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Unique label for this AD configuration (e.g. 'Primary DC')",
    )
    path: str = Field(
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="LDAP server hostname or IP address",
    )
    domain_name: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Domain name (e.g. 'DOMAIN' for user@DOMAIN authentication)",
    )
    port: int = Field(
        default=389,
        sa_column=Column(Integer, nullable=False),
        description="LDAP port (389 for non-SSL, 636 for SSL)",
    )
    use_ssl: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False),
        description="Whether to use SSL/TLS for LDAP connection",
    )
    ldap_username: str = Field(
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="Service account username for LDAP binding",
    )
    encrypted_password: str = Field(
        sa_column=Column(Text, nullable=False),
        description="Fernet-encrypted service account password",
    )
    base_dn: str = Field(
        max_length=500,
        sa_column=Column(String(500), nullable=False),
        description="Base DN for LDAP searches (e.g. 'DC=example,DC=com')",
    )
    desired_ous: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description='List of OU names to sync, or ["*"] for all OUs',
    )
    is_active: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False),
        description="Whether this is the active AD configuration (only one can be active)",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
    )

    __table_args__ = (
        Index("ix_active_directory_configs_name", "name"),
        Index("ix_active_directory_configs_is_active", "is_active"),
        # Ensure only one active config at a time
        Index(
            "ix_active_directory_configs_unique_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
    )


class EmailConfig(TableModel, table=True):
    """Email/SMTP configuration stored in database with encrypted credentials."""

    __tablename__ = "email_configs"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), primary_key=True),
    )
    name: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False, unique=True),
        description="Unique label for this email configuration (e.g. 'Primary SMTP')",
    )
    smtp_host: str = Field(
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="SMTP server hostname or IP address",
    )
    smtp_port: int = Field(
        default=587,
        sa_column=Column(Integer, nullable=False),
        description="SMTP port (25, 465 for SSL, 587 for TLS)",
    )
    smtp_user: str = Field(
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="SMTP authentication username",
    )
    smtp_from: str = Field(
        max_length=255,
        sa_column=Column(String(255), nullable=False),
        description="Default 'From' email address",
    )
    encrypted_password: str = Field(
        sa_column=Column(Text, nullable=False),
        description="Fernet-encrypted SMTP password",
    )
    smtp_tls: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False),
        description="Whether to use TLS for SMTP connection",
    )
    is_active: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False),
        description="Whether this is the active email configuration (only one can be active)",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
    )
    updated_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
            "onupdate": text("CURRENT_TIMESTAMP"),
        },
    )

    __table_args__ = (
        Index("ix_email_configs_name", "name"),
        Index("ix_email_configs_is_active", "is_active"),
        # Ensure only one active config at a time
        Index(
            "ix_email_configs_unique_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
    )


class Audit(TableModel, table=True):
    """Audit log for tracking user actions and system changes."""

    __tablename__ = "audit_logs"

    id: int = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
    )
    user_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PostgreSQL_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True),
        description="User who performed the action",
    )
    action: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Action performed (CREATE, UPDATE, DELETE, etc.)",
    )
    resource_type: str = Field(
        max_length=100,
        sa_column=Column(String(100), nullable=False),
        description="Type of resource affected (User, ServiceRequest, etc.)",
    )
    resource_id: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="ID of the affected resource",
    )
    old_values: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Previous values before change",
    )
    new_values: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="New values after change",
    )
    ip_address: Optional[str] = Field(
        default=None,
        max_length=45,
        sa_column=Column(String(45), nullable=True),
        description="Client IP address (supports IPv6)",
    )
    endpoint: Optional[str] = Field(
        default=None,
        max_length=255,
        sa_column=Column(String(255), nullable=True),
        description="API endpoint called",
    )
    correlation_id: Optional[str] = Field(
        default=None,
        max_length=36,
        sa_column=Column(String(36), nullable=True),
        description="Request correlation ID for distributed tracing",
    )
    user_agent: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="Client user agent string",
    )
    changes_summary: Optional[str] = Field(
        default=None,
        max_length=1000,
        sa_column=Column(String(1000), nullable=True),
        description="Human-readable summary of changes",
    )
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column_kwargs={"server_default": text("CURRENT_TIMESTAMP")},
        description="Timestamp of audit entry creation",
    )

    # Relationships
    user: Optional["User"] = Relationship(back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_resource_type", "resource_type"),
        Index("ix_audit_logs_resource_id", "resource_id"),
        Index("ix_audit_logs_correlation_id", "correlation_id"),
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_user_action_resource", "user_id", "action", "resource_type"),
    )
