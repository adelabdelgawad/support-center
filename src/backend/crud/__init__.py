"""
CRUD layer for database operations.

This package contains all data access logic isolated from business logic.
Migrating from class-based to function-based CRUD for clarity.

Pattern:
    Old: await UserCRUD.find_by_id(db, user_id)
    New: await user_crud.find_by_id(db, user_id)
"""

# Base CRUD functions
from . import base_crud

# Migrated to plain functions
from . import active_directory_config_crud
from . import domain_user_crud
from . import email_config_crud

# Legacy class-based CRUD (to be migrated)
from .base_repository import BaseCRUD
from .chat_crud import ChatMessageCRUD, RequestStatusCRUD
from .organizational_unit_crud import OrganizationalUnitCRUD
from .page_crud import PageCRUD, PageRoleCRUD
from .remote_access_crud import RemoteAccessCRUD
from .service_request_crud import ServiceRequestCRUD
from .service_section_crud import ServiceSectionCRUD
from .user_crud import UserCRUD
from .user_role_crud import UserRoleCRUD

__all__ = [
    # Base CRUD
    "base_crud",
    # Function-based modules
    "active_directory_config_crud",
    "domain_user_crud",
    "email_config_crud",
    # Legacy class-based (to be migrated)
    "BaseCRUD",
    "ChatMessageCRUD",
    "RequestStatusCRUD",
    "OrganizationalUnitCRUD",
    "PageCRUD",
    "PageRoleCRUD",
    "RemoteAccessCRUD",
    "ServiceRequestCRUD",
    "ServiceSectionCRUD",
    "UserCRUD",
    "UserRoleCRUD",
]
