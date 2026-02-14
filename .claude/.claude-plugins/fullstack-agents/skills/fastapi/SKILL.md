# FastAPI Template Skill

Generate production-ready FastAPI modules following the Repository pattern architecture.

## When to Use This Skill

Use this skill when asked to:
- Create a new FastAPI entity/module (router, repository, service, schemas)
- Add CRUD endpoints to an existing FastAPI application
- Generate repository classes following the BaseRepository[T] pattern
- Build REST APIs with SQLAlchemy and Pydantic

## Architecture Overview

```
Primary Pattern (ALL endpoints):
+---------------------------------------------------------+
|                    HTTP Request                           |
+--------------------------+------------------------------+
                           |
                           v
+---------------------------------------------------------+
|  Router (api/routers/setting/{entity}_router.py)         |
|  - Endpoint definitions                                  |
|  - Request/Response validation                           |
|  - session: SessionDep                                   |
|  - Delegates to Service for ALL operations               |
+-------------------------+-------------------------------+
                           |
                           v
+---------------------------------------------------------+
|  Service (api/services/setting/{entity}_service.py)      |
|  - Business logic, validation, orchestration             |
|  - Instantiates repositories in __init__                 |
|  - Audit logging, external integrations                  |
|  - Commits transactions                                  |
+-------------------------+-------------------------------+
                           |
                           v
+---------------------------------------------------------+
|  Repository (api/repositories/setting/{entity}_repo.py)  |
|  - Class inheriting BaseRepository[T]                    |
|  - Session stored in self.session via __init__           |
|  - flush() not commit() — caller commits                 |
+-------------------------+-------------------------------+
                           |
                           v
+---------------------------------------------------------+
|  Model (db/model.py) + Schemas                           |
|  - SQLModel ORM models                                   |
|  - api/schemas/ (Pydantic DTOs with CamelModel)          |
+---------------------------------------------------------+
```

## File Structure

```
api/
+-- routers/
|   +-- setting/
|       +-- {entity}_router.py      # Router with endpoints
+-- repositories/
|   +-- base.py                     # BaseRepository[T] generic base class
|   +-- __init__.py                 # Re-exports all repositories
|   +-- auth/                       # Auth-related repositories
|   +-- setting/                    # Setting-related repositories
|       +-- {entity}_repository.py  # Repository class for entity
+-- services/
|   +-- setting/
|       +-- {entity}_service.py     # Business logic + orchestration
+-- schemas/
|   +-- _base.py                    # CamelModel base class
|   +-- {entity}_schema.py          # Pydantic DTOs (request/response)
+-- exceptions.py                   # DetailedHTTPException

db/
+-- model.py                        # SQLModel ORM models

core/
+-- dependencies.py                 # SessionDep, ActiveUserDep, SuperAdminDep
+-- app_setup/
|   +-- routers_group/
|       +-- setting_routers.py      # Router registration
```

## Core Principles

### 1. Single Session Per Request

Every request uses exactly ONE database session via typed dependency:

```python
@router.post("/items")
async def create_item(
    item_create: ItemCreate,
    session: SessionDep,  # Typed dependency - NOT Depends(get_session)
):
    service = ItemService(session)
    return await service.create_item(item_create)
```

### 2. Session Flow

```
Router (SessionDep) --> Service (receives session in __init__)
                          |
                          +--> Repository (receives session in __init__)
                                 |
                                 +--> Database (flush, NOT commit)
```

- **Router**: Receives `SessionDep`, passes to Service constructor
- **Service**: Stores session, creates repositories in `__init__`, commits transactions
- **Repository**: Stores session in `self.session`, uses `flush()` not `commit()`

### 3. CamelModel for API Responses

All schemas inherit from CamelModel for automatic snake_case to camelCase conversion:

```python
class ItemResponse(CamelModel):
    item_id: int        # Python: snake_case
    created_at: datetime
    # JSON output: {"itemId": 1, "createdAt": "..."}
```

### 4. Domain Exceptions

Use `DetailedHTTPException` for errors:

```python
from api.exceptions import DetailedHTTPException
from fastapi import status

raise DetailedHTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=f"Item not found with ID: {item_id}",
)
```

## Generation Order

When creating a new entity, generate files in this order:

1. **Model** (`db/model.py`) - Add SQLModel model
2. **Schemas** (`api/schemas/{entity}_schema.py`) - Pydantic DTOs with CamelModel
3. **Repository** (`api/repositories/setting/{entity}_repository.py`) - Data access class
4. **Register repository** in `api/repositories/__init__.py`
5. **Service** (`api/services/setting/{entity}_service.py`) - Business logic
6. **Router** (`api/routers/setting/{entity}_router.py`) - API endpoints
7. **Register router** in `core/app_setup/routers_group/setting_routers.py`

## Quick Reference

### Repository Pattern
- Class inheriting `BaseRepository[T]`
- `model = EntityClass` as class attribute
- Session stored in `self.session` via `__init__` (calls `super().__init__(session)`)
- `flush()` not `commit()` - caller (service) commits
- Import from: `from api.repositories import EntityRepository`

### Service Pattern (Primary — ALL endpoints use services)
- ALL routers delegate to a Service class
- Services instantiate repositories in `__init__`
- Business logic, validation, orchestration, audit logging
- External integrations (AD, email, Redis, SMS)
- Session passed to constructor, stored as `self.session`
- Commits transactions after repository operations

### Router Pattern
- Use `SessionDep` typed dependency
- ALL routers delegate to Service (instantiated in each handler)
- Path: `api/routers/setting/{entity}_router.py`
- Registration: `core/app_setup/routers_group/setting_routers.py`

## References

See the `references/` directory for detailed patterns:

### Core Patterns
- `model-pattern.md` - SQLAlchemy models
- `schema-pattern.md` - Pydantic DTO patterns
- `repository-pattern.md` - BaseRepository[T] class pattern
- `service-pattern.md` - Business logic with repository usage
- `router-pattern.md` - API endpoints delegating to services

### Advanced Patterns
- `file-upload-pattern.md` - File uploads with UploadFile, validation, S3
- `testing-pattern.md` - pytest fixtures, async tests, dependency overrides
- `response-types-pattern.md` - HTML, file downloads, streaming, redirects
- `middleware-pattern.md` - Security headers, correlation ID, timing, logging
- `form-data-pattern.md` - Form handling, OAuth2 password flow, headers, cookies
