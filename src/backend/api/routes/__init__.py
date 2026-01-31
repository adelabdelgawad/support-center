"""
Application route handlers.

This package contains route handlers for core application endpoints.
"""

from .root import router as root_router
from .health import router as health_router

__all__ = ["root_router", "health_router"]
