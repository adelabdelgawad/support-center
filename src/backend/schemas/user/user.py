"""
User schemas for API validation and serialization.

REFACTORED:
- Removed UserRole enum field, replaced with is_technician boolean
- Removed role-based filtering
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import EmailStr, Field, model_validator

from core.schema_base import HTTPSchemaModel


class UserBase(HTTPSchemaModel):
    """Base user schema with common fields."""

    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: Optional[str] = Field(None, max_length=100)
    is_technician: bool = False
    is_active: bool = True
    is_super_admin: bool = False
    phone_number: Optional[str] = Field(None, max_length=20)
    title: Optional[str] = Field(
        None, max_length=100, description="User's job title"
    )
    office: Optional[str] = Field(
        None, max_length=100, description="User's office location"
    )
    manager_id: Optional[UUID] = Field(None, description="User's manager ID")
    is_domain: bool = True
    is_blocked: bool = False
    block_message: Optional[str] = Field(
        None,
        max_length=500,
        description="Custom message explaining why user is blocked",
    )
    is_deleted: bool = False
    language: Optional[str] = Field("ar", max_length=10, description="User's preferred language (en or ar)")
    theme: Optional[str] = Field("system", max_length=10, description="User's preferred theme (light, dark, or system)")
    notifications_enabled: Optional[bool] = Field(True, description="Whether desktop notifications are enabled")
    sound_enabled: Optional[bool] = Field(True, description="Whether notification sounds are enabled")
    sound_volume: Optional[float] = Field(0.5, ge=0.0, le=1.0, description="Notification sound volume (0.0 to 1.0)")


class UserCreate(UserBase):
    """Schema for creating a new user."""

    password_hash: Optional[str] = Field(None, max_length=255)


class UserUpdate(HTTPSchemaModel):
    """Schema for updating a user."""

    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, max_length=100)
    is_technician: Optional[bool] = None
    is_active: Optional[bool] = None
    is_super_admin: Optional[bool] = None
    phone_number: Optional[str] = Field(None, max_length=20)
    title: Optional[str] = Field(
        None, max_length=100, description="User's job title"
    )
    office: Optional[str] = Field(
        None, max_length=100, description="User's office location"
    )
    manager_id: Optional[UUID] = Field(None, description="User's manager ID")
    is_domain: Optional[bool] = None
    is_blocked: Optional[bool] = None
    block_message: Optional[str] = Field(
        None,
        max_length=500,
        description="Custom message explaining why user is blocked",
    )
    is_deleted: Optional[bool] = None
    language: Optional[str] = Field(None, max_length=10, description="User's preferred language (en or ar)")
    theme: Optional[str] = Field(None, max_length=10, description="User's preferred theme (light, dark, or system)")
    notifications_enabled: Optional[bool] = Field(None, description="Whether desktop notifications are enabled")
    sound_enabled: Optional[bool] = Field(None, description="Whether notification sounds are enabled")
    sound_volume: Optional[float] = Field(None, ge=0.0, le=1.0, description="Notification sound volume (0.0 to 1.0)")


class UserRead(UserBase):
    """Schema for reading user data."""

    id: UUID
    is_online: bool
    created_at: datetime
    updated_at: datetime
    last_seen: Optional[datetime] = None


class UserListItem(HTTPSchemaModel):
    """Lightweight schema for user lists."""

    id: UUID
    username: str
    full_name: Optional[str]
    email: Optional[str] = None
    title: Optional[str] = None
    is_technician: bool
    is_online: bool
    is_active: bool
    is_super_admin: bool
    is_domain: bool
    is_blocked: bool = False
    block_message: Optional[str] = None
    manager_id: Optional[UUID] = None
    is_deleted: bool = False


class UserDetail(UserRead):
    """Detailed user schema with relationships."""

    created_requests_count: int = 0
    assigned_requests_count: int = 0
    active_sessions_count: int = 0


class UserProfileUpdate(HTTPSchemaModel):
    """Schema for updating user profile."""

    full_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = Field(None, max_length=20)
    title: Optional[str] = Field(
        None, max_length=100, description="User's job title"
    )
    office: Optional[str] = Field(
        None, max_length=100, description="User's office location"
    )


class UserPasswordUpdate(HTTPSchemaModel):
    """Schema for updating user password."""

    current_password: str
    new_password: str = Field(..., min_length=8)


class UserStatus(HTTPSchemaModel):
    """Schema for user status updates."""

    is_online: bool
    last_seen: Optional[datetime] = None


class UserSessionSummary(HTTPSchemaModel):
    """Summary of user sessions."""

    total_sessions: int
    active_sessions: int
    desktop_sessions: int
    web_sessions: int
    mobile_sessions: int


class UserWithDetails(UserRead):
    """User with additional details for admin view."""

    password_last_changed: Optional[datetime] = None
    last_login: Optional[datetime] = None
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None
    preferences: Optional[dict] = None


class UserBlockRequest(HTTPSchemaModel):
    """Schema for blocking/unblocking a user."""

    is_blocked: bool
    block_message: Optional[str] = Field(
        None,
        max_length=500,
        description="Custom message explaining why user is blocked",
    )

    @model_validator(mode="after")
    def validate_block_message(self):
        """Validate that block_message is provided when blocking a user."""
        if self.is_blocked and (
            self.block_message is None or self.block_message == ""
        ):
            raise ValueError(
                "block_message is required when is_blocked is True"
            )
        return self


class UserBlockedResponse(HTTPSchemaModel):
    """Schema for response when user is blocked."""

    is_blocked: bool
    block_message: Optional[str]
    message: str


# Role management schemas
class UserRoleInfo(HTTPSchemaModel):
    """Simple role information for user responses."""

    id: UUID
    name: str


# Business Unit information schemas
class UserBusinessUnitInfo(HTTPSchemaModel):
    """Simple business unit information for user responses."""

    id: int
    name: str
    is_active: bool


class UserWithRoles(UserRead):
    """User with assigned roles."""

    roles: List[UserRoleInfo] = []
    role_ids: List[UUID] = []


class UserWithRolesListItem(UserListItem):
    """Lightweight user with role information for lists."""

    roles: List[UserRoleInfo] = []
    role_ids: List[UUID] = []
    business_units: List[UserBusinessUnitInfo] = []


class UserCreateWithRoles(UserCreate):
    """Schema for creating a user with role assignments."""

    role_ids: List[UUID] = []


class UserRolesUpdate(HTTPSchemaModel):
    """Schema for updating user's role assignments."""

    user_id: UUID
    original_role_ids: List[UUID]
    updated_role_ids: List[UUID]


class UserStatusUpdate(HTTPSchemaModel):
    """Schema for updating user activation status."""

    user_id: UUID
    is_active: bool


class UserTechnicianUpdate(HTTPSchemaModel):
    """Schema for updating user technician status."""

    user_id: UUID
    is_technician: bool


class BulkUserStatusUpdate(HTTPSchemaModel):
    """Schema for bulk updating user activation status."""

    user_ids: List[UUID]
    is_active: bool


class BulkUserTechnicianUpdate(HTTPSchemaModel):
    """Schema for bulk updating user technician status."""

    user_ids: List[UUID]
    is_technician: bool


class BulkUserUpdateResponse(HTTPSchemaModel):
    """Response for bulk user update operations."""

    updated_users: List["UserWithRolesListItem"]


class UserListResponse(HTTPSchemaModel):
    """Response for listing users with statistics.

    Count types:
    1. Global User Type counts (always reflect database totals):
       - global_total: Total users in database
       - technician_count: Total technicians in database
       - user_count: Total non-technicians in database

    2. Scoped Status counts (filtered by selected User Type):
       - active_count: Active users within selected User Type
       - inactive_count: Inactive users within selected User Type
       - total: Total users matching current filters (for pagination)

    3. Scoped Role counts (filtered by User Type AND Status):
       - role_counts: Dict mapping role_id to user count within current filters
    """

    users: List[UserWithRolesListItem]
    # Filtered total (for pagination)
    total: int
    # Scoped Status counts (within selected User Type)
    active_count: int
    inactive_count: int
    # Global User Type counts (always database totals)
    global_total: int
    technician_count: int
    user_count: int
    # Scoped Role counts (within selected User Type AND Status)
    # Dict mapping role_id (string UUID) to user count
    role_counts: dict[str, int] = {}


class UserCountsResponse(HTTPSchemaModel):
    """Response for user count statistics."""

    total: int
    active_count: int
    inactive_count: int


class UserPreferencesUpdate(HTTPSchemaModel):
    """Schema for updating user preferences."""

    language: Optional[str] = Field(None, max_length=10, description="User's preferred language (en or ar)")
    theme: Optional[str] = Field(None, max_length=10, description="User's preferred theme (light, dark, or system)")
    notifications_enabled: Optional[bool] = Field(None, description="Whether desktop notifications are enabled")
    sound_enabled: Optional[bool] = Field(None, description="Whether notification sounds are enabled")
    sound_volume: Optional[float] = Field(None, ge=0.0, le=1.0, description="Notification sound volume (0.0 to 1.0)")

    @model_validator(mode="after")
    def validate_preferences(self):
        """Validate preference values."""
        if self.language is not None and self.language not in ["en", "ar"]:
            raise ValueError("language must be 'en' or 'ar'")
        if self.theme is not None and self.theme not in ["light", "dark", "system"]:
            raise ValueError("theme must be 'light', 'dark', or 'system'")
        return self


class UserPreferencesRead(HTTPSchemaModel):
    """Schema for reading user preferences."""

    language: str = "ar"
    theme: str = "system"
    notifications_enabled: bool = True
    sound_enabled: bool = True
    sound_volume: float = 0.5
