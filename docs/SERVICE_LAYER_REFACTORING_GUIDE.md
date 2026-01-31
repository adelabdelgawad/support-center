# Service Layer Refactoring Guide

## Overview

This guide outlines the refactoring of the current service layer into a clearer three-tier architecture inspired by the enterprise-starter template.

## Current State

All business logic, data access, and external integrations are in `services/`:
- 47 service files handling everything
- No clear separation between data access and business logic
- Difficult to identify reusable database queries
- Mixed responsibilities (CRUD + business rules + external APIs)

## Proposed Architecture

```
api/v1/endpoints/
    └─ users.py (thin wrappers, validation, dependency injection)
        ↓
    controllers/
        └─ user_controller.py (orchestration, business logic)
            ↓
        crud/                    services/
            └─ user_crud.py     └─ active_directory.py
            (data access)        (external integrations)
```

### Layer Responsibilities

| Layer | Purpose | Examples |
|-------|---------|----------|
| **Endpoints** | API validation, auth, HTTP | `GET /users`, validate input, inject deps |
| **Controllers** | Business logic orchestration | User creation workflow, permission checks |
| **CRUD** | Reusable database operations | `get_user_by_id()`, `list_users()` |
| **Services** | External integrations only | LDAP, SMTP, MinIO, SignalR, WhatsApp |

## Decision Rules

**When to create a CRUD function:**
- Query is used 3+ times across the codebase
- Query is a simple data access pattern (get, list, create, update, delete)
- No complex business logic involved

**When to create a Controller:**
- Orchestrates multiple CRUD operations
- Contains business rules and validation
- Coordinates between CRUD and Services

**When to keep in Services:**
- Interacts with external systems (AD, SMTP, MinIO, etc.)
- Not database-related
- Integration-specific logic

## Migration Strategy

### Phase 1: Identify and Extract CRUD (Week 1-2)

**Goal:** Move reusable data access to `crud/` layer

**Steps:**
1. Analyze services for repeated queries
2. Extract to crud layer:
   ```python
   # Before: services/user_service.py
   async def get_user_by_id(session, user_id):
       result = await session.execute(
           select(User).where(User.id == user_id)
       )
       return result.scalar_one_or_none()

   # After: crud/user_crud.py
   async def get_user_by_id(session: AsyncSession, user_id: UUID) -> Optional[User]:
       """Get user by ID (reusable)."""
       result = await session.execute(
           select(User).where(User.id == user_id)
       )
       return result.scalar_one_or_none()
   ```

3. Common CRUD patterns to extract:
   - `get_by_id(session, id)`
   - `list_with_filters(session, filters, page, per_page)`
   - `create(session, data)`
   - `update(session, id, data)`
   - `delete(session, id)`

### Phase 2: Create Controllers (Week 3-4)

**Goal:** Move business logic orchestration to `controllers/`

**Example:**
```python
# controllers/user_controller.py
from crud import user_crud
from services.active_directory import ActiveDirectoryService

class UserController:
    """Orchestrates user-related operations."""

    @staticmethod
    async def create_user_from_ad(
        session: AsyncSession,
        username: str,
        ad_service: ActiveDirectoryService,
    ) -> User:
        """
        Create user from Active Directory.
        Orchestrates: AD lookup → user creation → notification
        """
        # 1. Get user from AD (external service)
        ad_user = await ad_service.get_user(username)

        if not ad_user:
            raise ValueError(f"User {username} not found in AD")

        # 2. Check if user exists (crud)
        existing_user = await user_crud.get_by_username(session, username)
        if existing_user:
            # Update from AD
            updated_user = await user_crud.update(
                session,
                existing_user.id,
                {
                    "email": ad_user.email,
                    "full_name": ad_user.display_name,
                    "title": ad_user.title,
                }
            )
            return updated_user

        # 3. Create new user (crud)
        user_data = {
            "username": username,
            "email": ad_user.email,
            "full_name": ad_user.display_name,
            "is_domain": True,
            "title": ad_user.title,
            "office": ad_user.office,
        }
        new_user = await user_crud.create(session, user_data)

        # 4. Send welcome notification (external service)
        # await notification_service.send_welcome_email(new_user.email)

        return new_user
```

### Phase 3: Refactor Services (Week 5)

**Goal:** Keep only external integrations in `services/`

**Keep in services/ (external integrations):**
- `active_directory.py` - LDAP integration
- `minio_service.py` - S3 object storage
- `signalr_client.py` - SignalR hub communication
- `whatsapp_sender.py` - WhatsApp API
- `event_publisher.py` - Event bus publishing

**Move to crud/:**
- `user_service.py` → `crud/user_crud.py` + `controllers/user_controller.py`
- `request_service.py` → `crud/request_crud.py` + `controllers/request_controller.py`
- `chat_service.py` → `crud/chat_crud.py` + `controllers/chat_controller.py`

**Move to controllers/:**
- Business logic from services
- Multi-step workflows
- Cross-entity operations

### Phase 4: Update Imports (Week 6)

**Goal:** Update all endpoint imports to use new structure

**Before:**
```python
# api/v1/endpoints/users.py
from services.user_service import UserService

@router.post("/")
async def create_user(data: UserCreate, session: AsyncSession = Depends(get_session)):
    return await UserService.create_user(session, data)
```

**After:**
```python
# api/v1/endpoints/users.py
from controllers.user_controller import UserController

@router.post("/")
async def create_user(data: UserCreate, session: AsyncSession = Depends(get_session)):
    return await UserController.create_user(session, data)
```

## Example File Structure

```
src/backend/
├── api/v1/endpoints/
│   ├── users.py
│   └── requests.py
├── controllers/
│   ├── __init__.py
│   ├── user_controller.py
│   ├── request_controller.py
│   └── chat_controller.py
├── crud/
│   ├── __init__.py
│   ├── user_crud.py
│   ├── request_crud.py
│   ├── chat_crud.py
│   └── base.py            # Generic CRUD operations
├── services/
│   ├── active_directory.py
│   ├── minio_service.py
│   ├── signalr_client.py
│   ├── whatsapp_sender.py
│   ├── event_publisher.py
│   └── event_coalescer.py
└── models/
    └── database_models.py
```

## Generic CRUD Base Class

Create `crud/base.py` for common operations:

```python
# crud/base.py
from typing import Generic, TypeVar, Type, Optional, List
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

ModelType = TypeVar("ModelType", bound=SQLModel)

class CRUDBase(Generic[ModelType]):
    """Generic CRUD operations."""

    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, session: AsyncSession, id: UUID) -> Optional[ModelType]:
        """Get by ID."""
        result = await session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        session: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> List[ModelType]:
        """List with pagination."""
        result = await session.execute(
            select(self.model).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, session: AsyncSession, obj_in: dict) -> ModelType:
        """Create."""
        db_obj = self.model(**obj_in)
        session.add(db_obj)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def update(
        self,
        session: AsyncSession,
        id: UUID,
        obj_in: dict
    ) -> Optional[ModelType]:
        """Update."""
        db_obj = await self.get(session, id)
        if not db_obj:
            return None
        for key, value in obj_in.items():
            setattr(db_obj, key, value)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def delete(self, session: AsyncSession, id: UUID) -> bool:
        """Delete."""
        db_obj = await self.get(session, id)
        if not db_obj:
            return False
        await session.delete(db_obj)
        await session.commit()
        return True
```

**Usage:**
```python
# crud/user_crud.py
from crud.base import CRUDBase
from models.database_models import User

class UserCRUD(CRUDBase[User]):
    """User-specific CRUD operations."""

    async def get_by_username(
        self,
        session: AsyncSession,
        username: str
    ) -> Optional[User]:
        """Get user by username."""
        result = await session.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

user_crud = UserCRUD(User)
```

## Testing Strategy

1. **CRUD tests**: Simple database operations
2. **Controller tests**: Business logic + mocking crud/services
3. **Service tests**: External API mocking
4. **Integration tests**: End-to-end with real database

## Benefits

1. **Reusability**: CRUD functions can be reused across controllers
2. **Testability**: Each layer can be tested independently
3. **Clarity**: Clear separation of concerns
4. **Maintainability**: Easy to find and modify logic
5. **Performance**: Identify slow queries in crud layer

## Rollout Plan

1. **Week 1-2**: Create crud/ structure, extract common queries
2. **Week 3-4**: Create controllers/ structure, move business logic
3. **Week 5**: Clean up services/ to keep only integrations
4. **Week 6**: Update all imports, test thoroughly
5. **Week 7**: Documentation and training

## Documentation Updates

Update `CLAUDE.md` with:
```markdown
## ⚠️ CRITICAL: Service Layer Architecture

**Three-tier architecture:**

| Layer | Purpose | Examples |
|-------|---------|----------|
| **Controllers** | Business logic orchestration | `controllers/user_controller.py` |
| **CRUD** | Reusable database operations | `crud/user_crud.py` |
| **Services** | External integrations only | `services/active_directory.py` |

**Decision rules:**
- Use CRUD for queries used 3+ times
- Use Controllers for multi-step workflows
- Use Services for external systems only
```

## Success Metrics

- [ ] 80%+ of repeated queries moved to crud/
- [ ] All business logic in controllers/
- [ ] Only external integrations in services/
- [ ] 100% test coverage for new structure
- [ ] All endpoints updated to use controllers
- [ ] Documentation complete

## Conclusion

This refactoring will make the codebase more maintainable, testable, and aligned with enterprise best practices. Start with high-traffic endpoints (users, requests, chat) and gradually migrate the rest.
