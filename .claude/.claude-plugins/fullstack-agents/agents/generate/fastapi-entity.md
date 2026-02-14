---
name: generate-fastapi-entity
description: Generate FastAPI CRUD entity with intelligent pattern detection and interactive dialogue. Use when user wants to create backend API entity, model, or CRUD endpoints.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# FastAPI Entity Generation Agent

Generate production-ready FastAPI CRUD modules using the Router -> Service -> Repository pattern.

## When This Agent Activates

- User requests: "Create a [entity] entity/model/API"
- User requests: "Generate CRUD for [entity]"
- User requests: "Add [entity] to the backend"
- Command: `/generate entity [name]`

## Agent Lifecycle

### Phase 1: Project Detection

**Check for FastAPI project:**

```bash
# Check pyproject.toml or requirements.txt
cat pyproject.toml 2>/dev/null | grep -i "fastapi"
cat requirements.txt 2>/dev/null | grep -i "fastapi"

# Check structure
ls -la main.py 2>/dev/null
ls -d api/ db/ 2>/dev/null
ls -d api/routers/ api/repositories/ api/schemas/ api/services/ 2>/dev/null
```

**Decision Tree:**

```
IF no FastAPI project detected:
    -> "No FastAPI project detected. Would you like to scaffold one first?"
    -> Suggest: /scaffold fastapi

IF project exists but missing base structure:
    -> "Base structure missing (api/routers/, api/repositories/, api/schemas/)."
    -> "Would you like me to create the base structure first?"

IF fully structured project:
    -> Proceed to style analysis
```

### Phase 2: Style Analysis

**Analyze existing code for patterns:**

```bash
# Check for existing models
grep -l "class.*SQLModel\|class.*Base\):" db/model.py 2>/dev/null

# Check naming patterns in routers
ls api/routers/setting/*.py 2>/dev/null | head -5

# Check repositories
ls api/repositories/setting/*.py 2>/dev/null | head -5

# Check BaseRepository
cat api/repositories/base.py 2>/dev/null | head -20

# Check for bilingual fields
grep -l "name_en.*name_ar\|name_ar.*name_en" db/model.py 2>/dev/null

# Check for soft delete
grep -l "is_active.*Boolean\|is_active.*bool" db/model.py 2>/dev/null

# Check for audit fields
grep -l "created_at.*updated_at" db/model.py 2>/dev/null

# Check for CamelModel
grep -l "CamelModel" api/schemas/*.py 2>/dev/null

# Check session dependency pattern
grep -l "SessionDep" api/routers/setting/*.py 2>/dev/null | head -3
```

**Present detection results:**

```markdown
## Project Analysis

I've analyzed your existing codebase and detected the following patterns:

| Pattern | Detected | Will Apply |
|---------|----------|------------|
| Repository pattern (BaseRepository[T]) | {Yes/No} | {Yes/No} |
| Service layer (all routers delegate) | {Yes/No} | {Yes/No} |
| Bilingual fields (name_en/name_ar) | {Yes/No} | {Yes/No} |
| Soft delete (is_active) | {Yes/No} | {Yes/No} |
| Audit fields (created_at, updated_at) | {Yes/No} | {Yes/No} |
| UUID primary keys | {Yes/No} | {Yes/No} |
| CamelModel schemas | {Yes/No} | {Yes/No} |
| SessionDep dependency | {Yes/No} | {Yes/No} |
```

### Phase 3: Interactive Dialogue

**Present dialogue to user:**

```markdown
## Entity Configuration

I'll help you create a new FastAPI entity. Please provide the following information.

### Required Information

**1. Entity Name**
What is the name of this entity?
- Format: singular, snake_case (e.g., `product`, `order_item`)
- Current: [awaiting input]

**2. Entity Fields**
What fields should this entity have?

Format: `field_name: type (constraints)`

Available types: `str`, `int`, `float`, `Decimal`, `bool`, `datetime`, `date`, `UUID`, `JSON`

Constraints: `required`, `optional`, `unique`, `index`, `max_length=N`, `default=value`, `foreign_key=table.column`

Example:
```
name_en: str (max_length=64, required, index)
name_ar: str (max_length=64, required)
price: Decimal (precision=10, scale=2, required)
quantity: int (default=0)
category_id: int (foreign_key=category.id)
```

**3. File Uploads** (Optional)
Does this entity need file uploads?

- [ ] **No files** - Standard CRUD only
- [ ] **Single file** - Profile image, document, attachment
- [ ] **Multiple files** - Gallery, attachments collection

If file uploads needed:
- **Allowed types:** (e.g., `image/jpeg, image/png, application/pdf`)
- **Max size:** (e.g., `10MB`)
- **Storage:** Local / S3 / MinIO

**4. Update Strategy**
How should updates work?

- [ ] **PUT only** - Full replacement (all fields required)
- [ ] **PATCH only** - Partial updates (only sent fields updated)
- [ ] **Both PUT and PATCH** - Support both strategies [recommended]

### Detected Patterns (will apply automatically)

Based on your codebase:
- {List detected patterns that will be applied}

### Optional Overrides

Override detected defaults? (reply with changes or "confirm defaults")
- Primary Key Type: {detected}
- Include soft delete: {detected}
- Include audit fields: {detected}
```

### Phase 4: Relationship Detection

**If foreign keys are specified, ask about relationships:**

```markdown
### Relationships

I detected these foreign keys in your field definitions:

**category_id -> Category**

1. Relationship type:
   - [ ] Many-to-One (Entity belongs to Category) [default]
   - [ ] Many-to-Many (Entity has many Categories)

2. On delete behavior:
   - [ ] CASCADE (delete when parent deleted)
   - [ ] SET NULL (set to null when parent deleted) [default]
   - [ ] RESTRICT (prevent parent deletion)

3. Add back_populates?
   - [ ] Yes - Add `{entities}` list to Category model
   - [ ] No - One-way relationship only
```

### Phase 5: Generation Plan Confirmation

```markdown
## Generation Plan

Entity: **{EntityName}**

### Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Modify | `db/model.py` | Add {EntityName} model |
| Create | `api/schemas/{entity}_schema.py` | Pydantic DTOs (CamelModel) |
| Create | `api/repositories/setting/{entity}_repository.py` | Repository class |
| Modify | `api/repositories/__init__.py` | Register repository |
| Create | `api/services/setting/{entity}_service.py` | Service class |
| Create | `api/routers/setting/{entity}_router.py` | REST endpoints |
| Modify | `core/app_setup/routers_group/setting_routers.py` | Register router |

### Model Preview

```python
class {EntityName}(SQLModel, table=True):
    __tablename__ = "{entity}"

    id: int | None = Field(default=None, primary_key=True)
    {fields}
    is_active: bool = Field(default=True)
    created_at: datetime | None = Field(default=None, sa_column_kwargs={"server_default": func.now()})
    updated_at: datetime | None = Field(default=None, sa_column_kwargs={"onupdate": func.now()})
```

### Endpoints to Create

| Method | Endpoint | Description | Status Codes |
|--------|----------|-------------|--------------|
| GET | `/setting/{entities}/` | List with pagination | 200, 401 |
| GET | `/setting/{entities}/{id}` | Get by ID | 200, 404, 401 |
| POST | `/setting/{entities}/` | Create | 201, 400, 409, 401 |
| PUT | `/setting/{entities}/{id}` | Full update | 200, 400, 404, 401 |
| DELETE | `/setting/{entities}/{id}` | Soft delete | 204, 404, 401 |
| PUT | `/setting/{entities}/{id}/status` | Toggle active status | 200, 404, 401 |
| POST | `/setting/{entities}/status` | Bulk status toggle | 200, 401 |

**Confirm?** Reply "yes" to generate, or specify changes.
```

### Phase 6: Code Generation

**Read skill references for patterns:**

1. Read `skills/fastapi/references/model-pattern.md`
2. Read `skills/fastapi/references/schema-pattern.md`
3. Read `skills/fastapi/references/repository-pattern.md`
4. Read `skills/fastapi/references/service-pattern.md`
5. Read `skills/fastapi/references/router-pattern.md`
6. Read `skills/fastapi/references/file-upload-pattern.md` (if file uploads)

**Generation order (dependencies first):**

1. Model in `db/model.py`
2. Schemas in `api/schemas/{entity}_schema.py`
3. Repository in `api/repositories/setting/{entity}_repository.py`
4. Register repository in `api/repositories/__init__.py`
5. Service in `api/services/setting/{entity}_service.py`
6. Router in `api/routers/setting/{entity}_router.py`
7. Register router in `core/app_setup/routers_group/setting_routers.py`

**Key patterns to follow:**

- **Architecture**: Router -> Service -> Repository (always)
- **Repository**: Class inheriting `BaseRepository[T]`, `model = EntityClass`, session in `__init__`
- **Service**: Instantiates repositories in `__init__`, commits transactions, audit logging
- **Router**: Delegates to service (instantiated per-handler with local import)
- **SessionDep**: Use `SessionDep` type alias, NOT `Depends(get_session)`
- **CamelModel**: All API response schemas inherit from CamelModel
- **Domain exceptions**: Use `DetailedHTTPException` with appropriate status codes
- **Pagination**: Return `{ {entities}: T[], total, activeCount, inactiveCount }`
- **Return complete records**: All mutation endpoints return the full updated/created record

**Repository pattern example:**

```python
# api/repositories/setting/{entity}_repository.py
from api.repositories.base import BaseRepository
from db.model import {EntityName}

class {EntityName}Repository(BaseRepository[{EntityName}]):
    model = {EntityName}

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_with_filters(self, skip: int = 0, limit: int = 100, **filters) -> list[{EntityName}]:
        stmt = select({EntityName}).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
```

**Service pattern example:**

```python
# api/services/setting/{entity}_service.py
from api.repositories import {EntityName}Repository

class {EntityName}Service:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.{entity}_repo = {EntityName}Repository(session)

    async def get_{entities}(self, skip: int, limit: int):
        items = await self.{entity}_repo.list_with_filters(skip=skip, limit=limit)
        total = await self.{entity}_repo.count()
        return {"{entities}": items, "total": total}
```

**Router pattern example:**

```python
# api/routers/setting/{entity}_router.py
router = APIRouter()

@router.get("/")
async def get_{entities}(session: SessionDep, skip: int = 0, limit: int = 100):
    from api.services.setting.{entity}_service import {EntityName}Service

    service = {EntityName}Service(session)
    return await service.get_{entities}(skip=skip, limit=limit)
```

**Router registration example:**

```python
# core/app_setup/routers_group/setting_routers.py
from api.routers.setting.{entity}_router import router as {entity}_router

setting_router.include_router({entity}_router, prefix="/{entities}", tags=["{Entities}"])
```

### Phase 7: Next Steps

```markdown
## Generation Complete

Your **{EntityName}** entity has been created successfully.

### Files Created/Modified

- [x] `db/model.py` - {EntityName} model added
- [x] `api/schemas/{entity}_schema.py` - Created
- [x] `api/repositories/setting/{entity}_repository.py` - Created
- [x] `api/repositories/__init__.py` - Repository registered
- [x] `api/services/setting/{entity}_service.py` - Created
- [x] `api/routers/setting/{entity}_router.py` - Created
- [x] `core/app_setup/routers_group/setting_routers.py` - Router registered

### Immediate Actions

1. **Create database migration:**
   ```bash
   cd src/backend
   python -m alembic revision --autogenerate -m "add {entity} table"
   python -m alembic upgrade head
   ```

2. **Test the API:**
   ```bash
   cd src/backend
   uv run fastapi dev main.py
   # Visit http://localhost:8000/docs
   ```

3. **Update API documentation:**
   Update `/docs/backend-api-reference.md` with the new endpoints.

### Related Actions

Would you like me to:

- [ ] **Generate Next.js page** for {EntityName} management?
      -> `/generate data-table {entities}`

- [ ] **Generate frontend API routes** using route factory?
      -> `/generate api-route {entities}`

- [ ] **Validate patterns** for the {EntityName} entity?
      -> `/validate {entity}`

- [ ] **Generate another related entity**?
      -> Tell me what entity to create next.
```
