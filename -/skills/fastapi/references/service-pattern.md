# Service Pattern Reference

Services handle external integrations and complex multi-step orchestration ONLY. Simple CRUD operations go directly in routers.

## When to Use Services

- **External integrations**: Active Directory/LDAP, email/SMTP, Redis, SMS, Elasticsearch
- **Complex multi-step orchestration**: User creation + AD sync + role assignment + welcome email
- **Cross-cutting concerns**: Audit logging across multiple entities, notification dispatch

## When NOT to Use Services

- **Simple CRUD operations** - Put directly in routers
- **Single-table queries** - Use CRUD helpers or inline queries
- **Basic data formatting** - Do in router or schema
- **Forwarding to data layer** - This is unnecessary indirection

```python
# BAD - Unnecessary service layer for simple CRUD
class ItemService:
    async def get_items(self, session: AsyncSession, skip: int, limit: int):
        # This just forwards to a query - put it directly in the router
        stmt = select(Item).offset(skip).limit(limit)
        return (await session.scalars(stmt)).all()

# GOOD - Simple query directly in router
@router.get("/")
async def list_items(session: SessionDep, skip: int = 0, limit: int = 100):
    stmt = select(Item).offset(skip).limit(limit)
    return (await session.scalars(stmt)).all()
```

## Service Structure

Services use CRUD helpers or direct queries for database access. No repository classes.

```python
# api/services/user_sync_service.py
"""User Sync Service - Orchestrates user synchronization with Active Directory."""

import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from api.crud import users as users_crud
from api.services.async_ad_client_service import AsyncADClientService
from api.exceptions import DetailedHTTPException
from db.model import User
from fastapi import status

logger = logging.getLogger(__name__)


class UserSyncService:
    """Orchestrates user synchronization with Active Directory."""

    def __init__(self, ad_service: AsyncADClientService):
        self.ad_service = ad_service

    async def sync_user_from_ad(
        self,
        session: AsyncSession,
        username: str,
    ) -> User:
        """
        Sync a user from Active Directory.

        Steps:
        1. Fetch user from AD (external integration)
        2. Create or update in database (CRUD helper)
        3. Assign default roles if new user
        4. Log the sync operation
        """
        # Step 1: External integration
        ad_user_data = await self.ad_service.get_user(username)
        if not ad_user_data:
            raise DetailedHTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User '{username}' not found in Active Directory",
            )

        # Step 2: Database operation via CRUD helper
        existing_user = await users_crud.get_user_by_username(session, username)

        if existing_user:
            # Update existing user with AD data
            existing_user.first_name = ad_user_data.get("first_name", existing_user.first_name)
            existing_user.last_name = ad_user_data.get("last_name", existing_user.last_name)
            existing_user.email = ad_user_data.get("email", existing_user.email)
            await session.flush()
            await session.refresh(existing_user)
            logger.info(f"Updated user {username} from AD")
            return existing_user

        # Step 3: Create new user
        user = await users_crud.create_user(
            session,
            username=username,
            first_name=ad_user_data.get("first_name", ""),
            last_name=ad_user_data.get("last_name", ""),
            email=ad_user_data.get("email", ""),
        )

        # Step 4: Assign default role
        await users_crud.assign_default_role(session, user.id)

        logger.info(f"Created new user {username} from AD sync")
        return user
```

## Service with Multiple External Integrations

```python
# api/services/notification_service.py
"""Notification Service - Sends notifications via multiple channels."""

from api.services.email_service import EmailService
from api.services.sms_service import SMSService
from api.crud import users as users_crud


class NotificationService:
    """Orchestrates notifications across channels."""

    def __init__(
        self,
        email_service: EmailService,
        sms_service: Optional[SMSService] = None,
    ):
        self.email_service = email_service
        self.sms_service = sms_service

    async def notify_user_created(
        self,
        session: AsyncSession,
        user_id: int,
    ) -> None:
        """
        Send welcome notifications for a new user.

        External integrations:
        - Email service (SMTP)
        - SMS service (optional)
        """
        user = await users_crud.ensure_user_exists(session, user_id)

        # Send welcome email
        await self.email_service.send_welcome_email(
            to_email=user.email,
            first_name=user.first_name,
        )

        # Send SMS if configured
        if self.sms_service and user.phone:
            await self.sms_service.send_welcome_sms(
                phone=user.phone,
                first_name=user.first_name,
            )
```

## Service Using CRUD Helpers (Not Repositories)

```python
# api/services/domain_credentials_service.py
"""Domain Credentials Service - Manages domain authentication credentials."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.exceptions import DetailedHTTPException
from db.model import DomainCredential
from fastapi import status


class DomainCredentialsService:
    """Service for domain credential operations with external validation."""

    async def create_credential(
        self,
        session: AsyncSession,
        domain: str,
        username: str,
        password: str,
    ) -> DomainCredential:
        """Create credential after validating against external domain."""
        # External validation (justifies service layer)
        is_valid = await self._validate_domain_credentials(domain, username, password)
        if not is_valid:
            raise DetailedHTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid domain credentials",
            )

        # Direct query (simple, no CRUD helper needed)
        credential = DomainCredential(
            domain=domain,
            username=username,
            password=password,  # Encrypted by model
        )
        session.add(credential)
        await session.flush()
        await session.refresh(credential)
        return credential

    async def _validate_domain_credentials(
        self,
        domain: str,
        username: str,
        password: str,
    ) -> bool:
        """Validate credentials against the domain controller."""
        # External integration logic here
        ...
```

## Usage in Router

```python
# api/routers/setting/user_router.py
from api.services.user_sync_service import UserSyncService
from api.services.async_ad_client_service import AsyncADClientService

@router.post("/sync-ad")
async def sync_user_from_ad(
    username: str,
    session: SessionDep,
):
    """Sync user from Active Directory - complex operation needs service."""
    ad_service = AsyncADClientService()
    sync_service = UserSyncService(ad_service)
    user = await sync_service.sync_user_from_ad(session, username)
    await session.commit()
    return user


# Simple CRUD - NO service needed
@router.get("/")
async def list_users(session: SessionDep, skip: int = 0, limit: int = 100):
    """List users - simple query, no service."""
    stmt = select(User).offset(skip).limit(limit)
    return (await session.scalars(stmt)).all()
```

## Key Points

1. **Services ONLY for**: external integrations, complex orchestration, cross-cutting concerns
2. **No services for simple CRUD** - Put directly in routers
3. **Use CRUD helpers** for database access, not repositories
4. **Session passed as parameter** - Service does not own the session
5. **flush() in service, commit() in router** - Router owns the transaction
6. **Inject external dependencies** - Pass services via constructor
7. **Log operations** - Use Python logging for audit trail
