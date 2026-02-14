from datetime import datetime
from typing import Optional

from core.schema_base import HTTPSchemaModel


class ClientVersionBase(HTTPSchemaModel):
    version_string: str
    platform: str = "desktop"
    order_index: int = 0
    is_latest: bool = False
    is_enforced: bool = False
    is_active: bool = True
    release_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    installer_url: Optional[str] = None
    installer_object_key: Optional[str] = None
    silent_install_args: Optional[str] = None


class ClientVersionCreate(HTTPSchemaModel):
    version_string: str
    is_enforced: bool = False
    release_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    silent_install_args: Optional[str] = "/qn /norestart"


class ClientVersionUpdate(HTTPSchemaModel):
    is_enforced: Optional[bool] = None
    is_active: Optional[bool] = None
    release_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    silent_install_args: Optional[str] = None


class ClientVersionRead(HTTPSchemaModel):
    id: int
    version_string: str
    platform: str
    order_index: int
    is_latest: bool
    is_enforced: bool
    is_active: bool
    release_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    installer_url: Optional[str] = None
    installer_object_key: Optional[str] = None
    silent_install_args: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ClientVersionListItem(ClientVersionRead):
    pass


class VersionPolicyResult(HTTPSchemaModel):
    version_status: str
    target_version_id: Optional[int] = None
    target_version_string: Optional[str] = None
    is_enforced: bool = False
    installer_url: Optional[str] = None
    silent_install_args: Optional[str] = None
