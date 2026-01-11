"""
Application factory and configuration.

This package provides the app factory function for creating the FastAPI application.
"""

from .factory import create_app

__all__ = ["create_app"]
