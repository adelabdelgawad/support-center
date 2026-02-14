"""Service for managing user custom view - ONE view per user controlling visible tabs."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import log_database_operation, safe_database_query
from db.models import UserCustomView
from repositories.setting.user_custom_view_repository import UserCustomViewRepository
from api.schemas.user_custom_view import (
    AVAILABLE_TABS,
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
        custom_view = await UserCustomViewRepository.find_by_user(db, user_id)

        if custom_view:
            return custom_view

        custom_view = await UserCustomViewRepository.create(
            db,
            obj_in={
                "user_id": user_id,
                "visible_tabs": [
                    "unassigned",
                    "all_unsolved",
                    "my_unsolved",
                    "recently_updated",
                    "recently_solved",
                ],
                "default_tab": "unassigned",
                "is_active": True,
            },
            commit=True,
        )

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
        custom_view = await UserCustomViewService.get_or_create_user_view(db, user_id)

        update_data = data.model_dump(exclude_unset=True)

        if "visible_tabs" in update_data:
            visible_tabs = update_data["visible_tabs"]
            if not visible_tabs:
                raise ValueError("visible_tabs cannot be empty")

            invalid_tabs = [tab for tab in visible_tabs if tab not in AVAILABLE_TABS]
            if invalid_tabs:
                raise ValueError(
                    f"Invalid tab IDs: {invalid_tabs}. Valid tabs: {AVAILABLE_TABS}"
                )

        if "default_tab" in update_data:
            default_tab = update_data["default_tab"]
            current_visible_tabs = (
                update_data.get("visible_tabs") or custom_view.visible_tabs
            )
            if default_tab not in current_visible_tabs:
                raise ValueError(
                    f"default_tab '{default_tab}' must be in visible_tabs list"
                )

        update_data["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None)

        updated_view = await UserCustomViewRepository.update(
            db, id_value=custom_view.id, obj_in=update_data, commit=True
        )

        logger.info(f"Updated custom view for user {user_id}")
        return updated_view

    @staticmethod
    @safe_database_query
    @log_database_operation("reset_user_view_to_defaults")
    async def reset_to_defaults(
        db: AsyncSession,
        user_id: UUID,
    ) -> UserCustomView:
        """Reset the user's custom view to default settings."""
        custom_view = await UserCustomViewService.get_or_create_user_view(db, user_id)

        default_data = {
            "visible_tabs": [
                "unassigned",
                "all_unsolved",
                "my_unsolved",
                "recently_updated",
                "recently_solved",
            ],
            "default_tab": "unassigned",
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }

        updated_view = await UserCustomViewRepository.update(
            db, id_value=custom_view.id, obj_in=default_data, commit=True
        )

        logger.info(f"Reset custom view to defaults for user {user_id}")
        return updated_view
