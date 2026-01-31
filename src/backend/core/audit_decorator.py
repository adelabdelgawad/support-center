"""
Audit decorator for automatic tracking of model changes.

Provides a decorator that automatically creates audit log entries
for database operations (CREATE, UPDATE, DELETE).
"""

import functools
import logging
from typing import Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from core.middleware.correlation import get_correlation_id
from api.schemas.audit import AuditCreate
from api.services.audit_service import AuditService

logger = logging.getLogger(__name__)


def audit_operation(
    resource_type: str,
    action: str,
    get_resource_id: Optional[Callable] = None,
    get_old_values: Optional[Callable] = None,
    get_new_values: Optional[Callable] = None,
):
    """
    Decorator to automatically audit database operations.

    Args:
        resource_type: Type of resource (e.g., "User", "ServiceRequest")
        action: Action performed (e.g., "CREATE", "UPDATE", "DELETE")
        get_resource_id: Optional callable to extract resource ID from result
        get_old_values: Optional callable to get old values before operation
        get_new_values: Optional callable to get new values after operation

    Example:
        @audit_operation(
            resource_type="User",
            action="UPDATE",
            get_resource_id=lambda result: str(result.id),
            get_new_values=lambda result: {"username": result.username, "email": result.email}
        )
        async def update_user(session, user_id, data):
            # ... update logic ...
            return updated_user
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Execute the original function
            result = await func(*args, **kwargs)

            try:
                # Extract session from args/kwargs
                session: Optional[AsyncSession] = None
                for arg in args:
                    if isinstance(arg, AsyncSession):
                        session = arg
                        break
                if not session and "session" in kwargs:
                    session = kwargs["session"]

                if not session:
                    logger.warning(
                        f"Cannot create audit log: No session found for {func.__name__}"
                    )
                    return result

                # Extract resource ID
                resource_id = None
                if get_resource_id and result:
                    resource_id = get_resource_id(result)
                elif hasattr(result, "id"):
                    resource_id = str(result.id)

                # Get old/new values
                old_values = get_old_values(result) if get_old_values else None
                new_values = get_new_values(result) if get_new_values else None

                # Extract user_id from kwargs if available
                user_id = kwargs.get("current_user_id") or kwargs.get("user_id")

                # Get correlation ID from context
                correlation_id = get_correlation_id()

                # Generate summary
                changes_summary = AuditService.generate_changes_summary(
                    old_values, new_values
                )

                # Create audit log entry
                audit_data = AuditCreate(
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    old_values=old_values,
                    new_values=new_values,
                    correlation_id=correlation_id,
                    changes_summary=changes_summary,
                )

                # Create audit log (fire and forget - don't block operation)
                try:
                    await AuditService.create_audit_log(
                        session=session,
                        audit_data=audit_data,
                    )
                except Exception as audit_error:
                    logger.error(
                        f"Failed to create audit log for {action} on {resource_type}: "
                        f"{str(audit_error)}"
                    )

            except Exception as e:
                logger.error(
                    f"Error in audit decorator for {func.__name__}: {str(e)}"
                )

            return result

        return wrapper

    return decorator
