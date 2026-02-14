# Dialogue Patterns

Interactive dialogue templates for gathering information from users.

## Core Principles

1. **Show what you detected** - Always display patterns found in existing code
2. **Ask only what's needed** - Don't ask about detected values unless user wants to override
3. **Provide examples** - Show format and examples for each question
4. **Offer sensible defaults** - Every optional field should have a default
5. **Confirm before action** - Always show a plan before generating

## Entity Generation Dialogue

### FastAPI Entity

```markdown
## Entity Configuration

I'll help you create a new FastAPI entity. Let me gather some information.

### Required Information

**1. Entity Name**
What is the name of this entity?
- Format: singular, snake_case (e.g., `product`, `order_item`, `user_profile`)
- Will be used for: table name, class name, file names

**2. Entity Fields**
What fields should this entity have?

Format each field as:
```
field_name: type (constraints)
```

Available types:
- `str` - String (add max_length)
- `int` - Integer
- `float` - Float
- `Decimal` - Decimal (add precision, scale)
- `bool` - Boolean
- `datetime` - DateTime
- `date` - Date
- `UUID` - UUID
- `JSON` - JSON/Dict

Constraints:
- `required` - Not nullable
- `optional` - Nullable
- `unique` - Unique constraint
- `index` - Create index
- `max_length=N` - For strings
- `default=value` - Default value
- `foreign_key=table.column` - Foreign key

Example:
```
name_en: str (max_length=64, required, index)
name_ar: str (max_length=64, required)
price: Decimal (precision=10, scale=2, required)
quantity: int (default=0)
category_id: int (foreign_key=category.id)
description: str (max_length=500, optional)
is_featured: bool (default=False)
```

### Detected Patterns

Based on your existing codebase, I detected these patterns:

| Pattern | Detected | Will Apply |
|---------|----------|------------|
| Bilingual fields (name_en/name_ar) | {detected} | {will_apply} |
| Soft delete (is_active) | {detected} | {will_apply} |
| Audit fields (created_at, updated_at) | {detected} | {will_apply} |
| UUID primary keys | {detected} | {will_apply} |
| CamelModel schemas | {detected} | {will_apply} |

### Optional Overrides

These have defaults based on your codebase. Override if needed:

- **Primary Key Type**: `Integer` (detected) or `UUID`?
- **Include soft delete?**: `Yes` (detected)
- **Include audit fields?**: `Yes` (detected)
- **Add bilingual fields automatically?**: `Yes` (detected)

Reply with:
1. Entity name
2. Fields list
3. Any pattern overrides (or "confirm defaults")
```

### Next.js Page

```markdown
## Page Configuration

I'll help you create a Next.js page. Let me gather some information.

### Required Information

**1. Page Type**
What type of page do you want to create?

- `data-table` - Full CRUD data table with filters, sorting, pagination
- `form` - Form page with validation
- `detail` - Detail view page
- `dashboard` - Dashboard with widgets
- `list` - Simple list view

**2. Entity/Resource Name**
What entity does this page manage?
- Format: plural for list pages (e.g., `products`, `users`)
- Should match your API endpoint name

**3. Columns/Fields** (for data-table)
What columns should be displayed?

Format:
```
column_name: type (features)
```

Types:
- `string` - Text
- `number` - Numeric
- `date` - Date/DateTime
- `boolean` - Checkbox/Badge
- `enum` - Select/Badge with options
- `actions` - Row actions menu

Features:
- `sortable` - Enable sorting
- `filterable` - Enable filtering
- `searchable` - Include in search
- `hidden` - Hidden by default
- `sticky` - Sticky column

Example:
```
id: number (hidden)
name_en: string (sortable, searchable)
name_ar: string (searchable)
price: number (sortable, filterable)
status: enum (filterable, options=[active, inactive, pending])
created_at: date (sortable)
actions: actions (edit, delete)
```

### Detected Patterns

| Pattern | Detected | Will Apply |
|---------|----------|------------|
| SSR + SWR hybrid | {detected} | {will_apply} |
| URL-based state (nuqs) | {detected} | {will_apply} |
| Context-based actions | {detected} | {will_apply} |
| Server response updates | {detected} | {will_apply} |

### Optional Features

- **Bulk actions?**: `Yes` / No (select multiple rows)
- **Export to CSV?**: `Yes` / No
- **Advanced filters?**: `Yes` / No (filter panel)
- **Row expansion?**: Yes / `No` (expandable rows)

Reply with your configuration.
```

## Scaffold Dialogue

### FastAPI Project Scaffold

```markdown
## FastAPI Project Configuration

I'll help you scaffold a new FastAPI project.

### Project Settings

**1. Project Name**
What is your project name?
- Format: lowercase with hyphens (e.g., `my-api`, `inventory-service`)

**2. Database**
Which database will you use?
- `PostgreSQL` (recommended)
- `MySQL`
- `SQLite` (development only)

**3. Features**
Which features do you need? (select all that apply)
- [ ] Authentication (JWT + OAuth2)
- [ ] Celery (background tasks)
- [ ] APScheduler (scheduled jobs)
- [ ] Redis (caching/sessions)
- [ ] WebSocket support
- [ ] File uploads (S3/MinIO)

### Architecture Options

**Session Management**
- `single-session-per-request` (recommended) - Session passed through layers
- `session-in-service` - Session stored in service class

**Schema Style**
- `CamelModel` (recommended) - Auto snake_case <-> camelCase
- `BaseModel` - Standard Pydantic

### Default Patterns

These will be included by default:
- [x] Repository pattern
- [x] Service layer
- [x] Domain exceptions
- [x] Pagination utilities
- [x] Alembic migrations

Override any? Reply with your choices.
```

### Docker Infrastructure Scaffold

```markdown
## Docker Infrastructure Configuration

I'll help you set up Docker infrastructure.

### Services

**1. Required Services**
Which services do you need?

Backend:
- [ ] FastAPI (Python backend)
- [ ] Node.js (if separate from Next.js)

Frontend:
- [ ] Next.js (React frontend)

Database:
- [ ] PostgreSQL
- [ ] MySQL
- [ ] MongoDB

Cache/Queue:
- [ ] Redis
- [ ] RabbitMQ

Workers:
- [ ] Celery worker
- [ ] Celery beat (scheduler)

Proxy:
- [ ] Nginx (reverse proxy)
- [ ] Traefik

Monitoring:
- [ ] Prometheus
- [ ] Grafana
- [ ] Loki (logs)

**2. Environment**
- `development` - Hot reload, debug mode
- `production` - Optimized builds, security

**3. Scaling**
- Backend replicas: `1` / 2 / 3
- Worker replicas: `1` / 2 / 3

### Network Configuration

- **Domain**: (e.g., `api.example.com`)
- **SSL**: Let's Encrypt / Self-signed / None

Reply with your configuration.
```

## Review Dialogue

### Code Review Request

```markdown
## Code Review Configuration

What would you like me to review?

### Review Type

- `quality` - Code quality, best practices, maintainability
- `security` - Security vulnerabilities, OWASP top 10
- `performance` - Performance bottlenecks, optimization opportunities
- `patterns` - Architecture pattern compliance

### Scope

- `file` - Specific file (provide path)
- `entity` - All files for an entity (provide entity name)
- `directory` - All files in directory
- `recent` - Recently modified files (git diff)
- `all` - Full codebase scan

### Focus Areas (optional)

Select specific areas to focus on:
- [ ] Error handling
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] Authentication/Authorization
- [ ] N+1 query detection
- [ ] Memory leaks
- [ ] Type safety
- [ ] Test coverage

Reply with your review configuration.
```

## Confirmation Patterns

### Generation Confirmation

```markdown
## Confirmation Required

### What I Will Do

**Create Files:**
| File | Size | Description |
|------|------|-------------|
| `api/schemas/product_schema.py` | ~50 lines | Pydantic DTOs |
| `api/crud/products.py` | ~80 lines | Data access |
| `api/services/product_service.py` | ~100 lines | Business logic |
| `api/routers/setting/products.py` | ~120 lines | REST endpoints |

**Modify Files:**
| File | Changes |
|------|---------|
| `db/models.py` | Add Product class (~30 lines) |
| `app.py` | Register products router (+2 lines) |

### Code Preview

<details>
<summary>Product Model (click to expand)</summary>

```python
class Product(Base):
    __tablename__ = "product"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    # ... rest of model
```
</details>

### Confirm?

- Reply **"yes"** to proceed with generation
- Reply **"no"** to cancel
- Reply with specific changes to adjust the plan
```

## Error Dialogue

### Missing Information

```markdown
## Missing Information

I need more information to proceed.

### Missing: Entity Fields

You didn't specify the fields for the entity. Please provide:

```
field_name: type (constraints)
```

Example for a Product entity:
```
name: str (max_length=100, required)
price: Decimal (precision=10, scale=2)
stock: int (default=0)
```

### Why This Is Needed

Without fields, I cannot:
- Create the database model
- Generate appropriate schemas
- Create repository queries
- Build service methods

Please provide the fields list.
```

### Conflict Resolution

```markdown
## Conflict Detected

I found a conflict that needs your decision.

### The Conflict

**Entity "Product" already exists** with different structure:

Current:
```python
class Product(Base):
    id: Mapped[int]
    name: Mapped[str]
    price: Mapped[float]
```

Your request:
```python
class Product(Base):
    id: Mapped[int]
    name_en: Mapped[str]
    name_ar: Mapped[str]
    price: Mapped[Decimal]
    category_id: Mapped[int]
```

### Options

1. **Update existing** - Modify current Product model (migration needed)
2. **Create new** - Use different name (e.g., `ProductV2`)
3. **Cancel** - Don't make changes

Which option do you prefer?
```
