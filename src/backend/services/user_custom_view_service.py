"""Service for managing user custom view - ONE view per user controlling visible tabs."""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import log_database_operation, safe_database_query
from models.database_models import UserCustomView
from schemas.user_custom_view import (
    AVAILABLE_TABS,
    UserCustomViewCreate,
    UserCustomViewRead,
    UserCustomViewUpdate,
)

logger = logging.getLogger(__name__)


class UserCustomViewService:
    """Service for managing user custom view - ONE view per user."""

    @staticmethod
    @safe_database_query
    @log_database_operation("get_or_create_user_view")
    async def get_or_create_user_view(
        db: AsyncSession,
        user_id: UUID,
    ) -> UserCustomView:
        """
        Get the user's custom view, creating it with defaults if it doesn't exist.

        Each user has exactly ONE custom view that controls which tabs are visible.
        """
        # Try to get existing view
        query = select(UserCustomView).where(UserCustomView.user_id == user_id)
        result = await db.execute(query)
        custom_view = result.scalar_one_or_none()

        if custom_view:
            return custom_view

        # Create default view if it doesn't exist
        custom_view = UserCustomView(
            user_id=user_id,
            visible_tabs=[
                "unassigned",
                "all_unsolved",
                "my_unsolved",
                "recently_updated",
                "recently_solved",
            ],
            default_tab="unassigned",
            is_active=True,
        )

        db.add(custom_view)
        await db.commit()
        await db.refresh(custom_view)

        logger.info(f"Created default custom view for user {user_id}")
        return custom_view

    @staticmethod
    @safe_database_query
    @log_database_operation("update_user_view")
    async def update_user_view(
        db: AsyncSession,
        user_id: UUID,
        data: UserCustomViewUpdate,
    ) -> UserCustomView:
        """
        Update the user's custom view configuration.

        Creates the view with provided data if it doesn't exist.
        """
        # Get or create the view
        custom_view = await UserCustomViewService.get_or_create_user_view(db, user_id)

        # Update fields
        update_data = data.model_dump(exclude_unset=True)

        # Validate visible_tabs if provided
        if "visible_tabs" in update_data:
            visible_tabs = update_data["visible_tabs"]
            if not visible_tabs:
                raise ValueError("visible_tabs cannot be empty")

            # Validate that all tab IDs are valid
            invalid_tabs = [tab for tab in visible_tabs if tab not in AVAILABLE_TABS]
            if invalid_tabs:
                raise ValueError(
                    f"Invalid tab IDs: {invalid_tabs}. Valid tabs: {AVAILABLE_TABS}"
                )

        # Validate default_tab if provided
        if "default_tab" in update_data:
            default_tab = update_data["default_tab"]
            # Get current or updated visible_tabs list
            current_visible_tabs = (
                update_data.get("visible_tabs") or custom_view.visible_tabs
            )
            if default_tab not in current_visible_tabs:
                raise ValueError(
                    f"default_tab '{default_tab}' must be in visible_tabs list"
                )

        for field, value in update_data.items():
            setattr(custom_view, field, value)

        custom_view.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        await db.commit()
        await db.refresh(custom_view)

        logger.info(f"Updated custom view for user {user_id}")
        return custom_view

    @staticmethod
    @safe_database_query
    @log_database_operation("reset_user_view_to_defaults")
    async def reset_to_defaults(
        db: AsyncSession,
        user_id: UUID,
    ) -> UserCustomView:
        """Reset the user's custom view to default settings."""
        custom_view = await UserCustomViewService.get_or_create_user_view(db, user_id)

        # Reset to defaults
        custom_view.visible_tabs = [
            "unassigned",
            "all_unsolved",
            "my_unsolved",
            "recently_updated",
            "recently_solved",
        ]
        custom_view.default_tab = "unassigned"
        custom_view.is_active = True
        custom_view.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        await db.commit()
        await db.refresh(custom_view)

        logger.info(f"Reset custom view to defaults for user {user_id}")
        return custom_view
