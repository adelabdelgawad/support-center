"""
Page schemas package.

This package contains all schemas related to pages and page permissions.
"""

from .page import (
    PageBase,
    PageCreate,
    PageUpdate,
    PageRead,
    PageRoleCreate,
    PageRoleRead,
    PageRoleDetailedResponse,
    PageRoleListResponse,
    PageWithRolesName,
    RolePagesResponse,
)

__all__ = [
    "PageBase",
    "PageCreate",
    "PageUpdate",
    "PageRead",
    "PageRoleCreate",
    "PageRoleRead",
    "PageRoleDetailedResponse",
    "PageRoleListResponse",
    "PageWithRolesName",
    "RolePagesResponse",
]
