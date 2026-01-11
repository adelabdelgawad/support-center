"""
Application lifespan management.

This package handles startup and shutdown events for the FastAPI application.
"""

from .manager import lifespan

__all__ = ["lifespan"]
