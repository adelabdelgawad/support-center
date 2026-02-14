# Agent Base Patterns

All agents in this plugin follow these core patterns for consistent behavior.

## Agent Lifecycle

Every agent must follow this 6-phase lifecycle:

```
1. DETECTION      -> Detect project type, existing patterns, new vs existing
2. DIALOGUE       -> Ask clarifying questions based on detection
3. ANALYSIS       -> Analyze existing code to match style
4. CONFIRMATION   -> Present plan, get user approval
5. EXECUTION      -> Generate/modify code
6. NEXT STEPS     -> Suggest related actions, offer to continue
```

## Phase 1: Detection

### Project Type Detection

Before any action, detect what exists:

```bash
# FastAPI Detection
exists(pyproject.toml) AND contains("fastapi")
exists(app.py) OR exists(main.py)
exists(api/) OR exists(routers/)

# Next.js Detection
exists(package.json) AND contains("next")
exists(app/) OR exists(pages/)
exists(next.config.js) OR exists(next.config.mjs)

# Docker Detection
exists(docker-compose.yml) OR exists(docker-compose.yaml)
exists(Dockerfile) OR exists(docker/)

# Celery Detection
exists(celery_app.py) OR exists(celery.py)
contains("from celery import")
```

### Project State Classification

```
IS_NEW_PROJECT = (
    not exists("app.py") and
    not exists("package.json") and
    not exists("pyproject.toml")
)

IS_EXISTING_FASTAPI = (
    exists("api/") or exists("routers/")
) and exists("db/models.py")

IS_EXISTING_NEXTJS = (
    exists("app/") or exists("pages/")
) and exists("package.json")
```

### Decision Tree

```
IF no project detected:
    -> Suggest: "No project detected. Would you like to scaffold one first?"
    -> Offer: /scaffold fastapi OR /scaffold nextjs

IF project exists but incomplete:
    -> Suggest: "Base structure missing. Would you like me to create it first?"
    -> List missing components

IF fully structured project:
    -> Proceed to dialogue phase
    -> Analyze existing patterns for style matching
```

## Phase 2: Dialogue

### Question Categories

1. **Required Questions** - Must be answered before proceeding
2. **Inference Questions** - Can be inferred from existing code, show detected values
3. **Optional Questions** - Have sensible defaults

### Dialogue Format Template

```markdown
## Entity Configuration

I need to gather some information about the entity you want to create.

### Required Information

1. **Entity Name**: What is the name of this entity?
   - Example: "product", "user", "order_item"
   - Current: [awaiting input]

2. **Fields**: What fields should this entity have?
   - Format: `field_name: type (constraints)`
   - Example: `name_en: str (max_length=64, required)`

### Detected from Codebase

Based on my analysis of your existing code:

- **Database Pattern**: SQLAlchemy 2.0 with AsyncSession
- **Naming Convention**: snake_case for files, PascalCase for classes
- **Bilingual Support**: Detected (name_en/name_ar pattern found)
- **Soft Delete**: Detected (is_active pattern found)

### Optional (with defaults)

3. **Primary Key Type**: Integer (default) or UUID?
   - Detected default: Integer

4. **Include Audit Fields?**: created_at, updated_at, created_by
   - Detected default: Yes (found in existing models)

Override any detected values? Reply with changes or "confirm" to proceed.
```

## Phase 3: Analysis

### Style Detection

Before generating, analyze existing code for style matching:

```python
style_config = {
    "import_style": "absolute" | "relative",
    "quote_style": "single" | "double",
    "naming": {
        "files": "snake_case" | "kebab-case",
        "classes": "PascalCase",
        "functions": "snake_case" | "camelCase",
        "variables": "snake_case" | "camelCase"
    },
    "indentation": 2 | 4,
    "line_length": 88 | 100 | 120,
    "trailing_comma": True | False,
    "bilingual": True | False,
    "soft_delete": True | False,
    "audit_fields": True | False
}
```

### Pattern Detection

Analyze existing entities for patterns:

```python
patterns_detected = {
    "uses_mapped_column": grep("Mapped\\[", "db/models.py"),
    "has_bilingual": grep("name_en.*name_ar", "db/models.py"),
    "has_soft_delete": grep("is_active.*Boolean", "db/models.py"),
    "has_audit_fields": grep("created_at.*updated_at", "db/models.py"),
    "pk_type": detect("Integer|UUID", "db/models.py"),
    "uses_camel_model": grep("from.*_base import CamelModel", "api/schemas/"),
}
```

## Phase 4: Confirmation

### Confirmation Format Template

```markdown
## Generation Plan

I will generate the following files for the **Product** entity:

### Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Modify | `db/model.py` | Add Product model |
| Create | `api/schemas/product_schema.py` | Pydantic DTOs |
| Create | `api/crud/products.py` | CRUD helper functions |
| Create | `api/routers/setting/product_router.py` | REST endpoints |
| Modify | `core/app_setup/routers_group/setting_routers.py` | Register products router |

### Pattern Matching

- Will follow your existing CamelModel pattern
- Will use single-session-per-request architecture
- Will include bilingual fields (name_en, name_ar)
- Will include soft delete (is_active)
- Will include audit fields (created_at, updated_at)

### Model Preview

```python
class Product(Base):
    __tablename__ = "product"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now())
```

### Confirm?

Reply **"yes"** to generate, or specify changes needed.
```

## Phase 5: Execution

### Execution Rules

1. **Follow detected patterns** - Match existing code style exactly
2. **Generate in correct order** - Dependencies first (model before schema)
3. **Use skill references** - Read from skills/ directory for pattern details
4. **Validate as you go** - Check generated code matches patterns

### Generation Order (FastAPI)

1. Model (db/model.py)
2. Schemas (api/schemas/{entity}_schema.py)
3. CRUD helpers (api/crud/{entity}.py) - only if reusable (3+ uses)
4. Router (api/routers/setting/{entity}_router.py)
5. Register router (core/app_setup/routers_group/setting_routers.py)

### Generation Order (Next.js)

1. Types (lib/types/api/{entity}.ts)
2. Server Actions (lib/actions/{entity}.actions.ts)
3. API Routes (app/api/setting/{entity}/route.ts)
4. Context (app/(pages)/setting/{entity}/context/)
5. Components (table, columns, modals)
6. Page (app/(pages)/setting/{entity}/page.tsx)

## Phase 6: Next Steps

### Next Steps Format Template

```markdown
## Generation Complete

Your **Product** entity has been created successfully.

### Files Created/Modified

- [x] `db/model.py` - Product model added
- [x] `api/schemas/product_schema.py` - Created
- [x] `api/crud/products.py` - Created
- [x] `api/routers/setting/product_router.py` - Created
- [x] `core/app_setup/routers_group/setting_routers.py` - Router registered

### Immediate Actions

1. **Create database migration**:
   ```bash
   alembic revision --autogenerate -m "add product table"
   alembic upgrade head
   ```

2. **Test the endpoints**:
   - Start server: `uvicorn app:app --reload`
   - Visit: `http://localhost:8000/docs`
   - POST `/setting/products/` - Create product
   - GET `/setting/products/` - List products

### Related Actions

Would you like me to:

- [ ] **Generate Next.js page** for Product management?
      -> Run: `/generate page products`

- [ ] **Create Celery tasks** for async operations?
      -> Run: `/generate task product-sync`

- [ ] **Add API tests** for the Product entity?
      -> Run: `/generate tests product`

- [ ] **Validate patterns** for the Product entity?
      -> Run: `/validate product`

Select an option or describe what you'd like to do next.
```

## Error Handling

### When Detection Fails

```markdown
## Project Detection

I was unable to detect a clear project structure.

### What I Found

- `pyproject.toml`: Not found
- `package.json`: Not found
- `app.py`: Not found

### Options

1. **Scaffold new FastAPI project**: `/scaffold fastapi`
2. **Scaffold new Next.js project**: `/scaffold nextjs`
3. **Specify project type manually**: Tell me what type of project this is

Which would you like to do?
```

### When Patterns Conflict

```markdown
## Pattern Conflict Detected

I found conflicting patterns in your codebase:

### Conflict: Session Management

- `api/routers/setting/user_router.py` uses: `SessionDep` passed to CRUD helpers
- `api/routers/setting/product_router.py` uses: `session` stored in service `__init__`

### Recommendation

The single-session-per-request pattern (passing session) is recommended.

### Options

1. **Follow recommended pattern** - Use session passing
2. **Match existing majority** - Which pattern is used more?
3. **Ask for clarification** - Which pattern should I use?

How would you like me to proceed?
```

## Inter-Agent Communication

### Invoking Other Agents

Agents can suggest invoking other agents:

```markdown
### Related Agents

This task would benefit from running additional agents:

1. **Review Agent**: `/review patterns product`
   - Validate the generated code follows patterns

2. **Generate Agent**: `/generate data-table products`
   - Create frontend page for this entity

Would you like me to invoke any of these agents?
```

### Orchestration Handoff

When one agent completes, it can hand off to the next:

```markdown
## Backend Generation Complete

I've finished generating the FastAPI entity.

### Orchestration Suggestion

Since you used `/generate fullstack`, I'll now proceed to generate the frontend.

**Next Agent**: `generate/nextjs-data-table`
**Target**: Products data table page

Proceeding automatically... (reply "stop" to pause)
```
