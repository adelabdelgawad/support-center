---
name: analyze-patterns
description: Detect and document coding patterns, conventions, and styles used in the codebase.
tools: Read, Glob, Grep, Bash
---

# Pattern Analysis Agent

Detect and document coding patterns, conventions, and architectural styles in the codebase.

## When This Agent Activates

- User requests: "What patterns does this project use?"
- User requests: "Analyze coding conventions"
- User requests: "Document the project patterns"
- Command: `/analyze patterns`

## Pattern Detection

### 1. Naming Conventions

**File naming:**
```bash
# Python files
ls api/routers/setting/*.py api/services/*.py api/crud/*.py 2>/dev/null | head -10

# TypeScript files
ls app/**/*.tsx components/**/*.tsx 2>/dev/null | head -10
```

**Class naming:**
```bash
grep -rh "^class " --include="*.py" | head -20
```

**Function naming:**
```bash
grep -rh "^def \|^async def " --include="*.py" | head -20
```

### 2. Architecture Patterns

**CRUD helper pattern:**
```bash
ls api/crud/*.py 2>/dev/null | head -5
grep -rh "from api.crud import" --include="*.py" | head -5
```

**Service pattern:**
```bash
grep -rl "class.*Service" --include="*.py" | head -5
```

**Session management:**
```bash
grep -rh "session: AsyncSession" --include="*.py" | head -5
grep -rh "session: SessionDep" --include="*.py" | head -5
```

### 3. Frontend Patterns

**Component patterns:**
```bash
# Server vs Client components
grep -rl '"use client"' --include="*.tsx" | wc -l
grep -rL '"use client"' app/\(pages\)/**/page.tsx 2>/dev/null | wc -l

# Context usage
grep -rl "createContext\|useContext" --include="*.tsx" | head -5

# SWR usage
grep -rl "useSWR" --include="*.tsx" | head -5
```

### 4. Code Style

**Import style:**
```bash
# Absolute vs relative imports
grep -rh "^from \.\|^import \." --include="*.py" | head -5
grep -rh "^from [a-z]" --include="*.py" | head -5
```

**String formatting:**
```bash
grep -rh 'f".*{.*}"' --include="*.py" | head -5  # f-strings
grep -rh '\.format(' --include="*.py" | head -5  # .format()
grep -rh '% ' --include="*.py" | head -5  # % formatting
```

## Output Format

```markdown
## Pattern Analysis Report

**Generated:** {timestamp}

### Naming Conventions

| Type | Pattern | Examples |
|------|---------|----------|
| Python files | snake_case | `user_service.py`, `user_router.py` |
| TypeScript files | kebab-case | `products-table.tsx`, `add-product-sheet.tsx` |
| Python classes | PascalCase | `UserService`, `UserCreate` |
| Python functions | snake_case | `get_user_by_id`, `create_order` |
| TypeScript functions | camelCase | `fetchProducts`, `handleSubmit` |
| Constants | UPPER_SNAKE | `MAX_RETRIES`, `DEFAULT_PAGE_SIZE` |
| Database tables | snake_case (singular) | `user`, `product`, `order_item` |

### Architecture Patterns

#### Backend (FastAPI)

| Pattern | Detected | Implementation |
|---------|----------|----------------|
| **CRUD Helper Pattern** | Yes | `api/crud/*.py` |
| **Service Layer** | Yes | `api/services/*.py` (external integrations only) |
| **SessionDep Injection** | Yes | Session via SessionDep type alias |
| **Domain Exceptions** | Yes | `api/exceptions.py` |
| **DTO Pattern (Schemas)** | Yes | `api/schemas/*.py` |
| **CamelModel** | Yes | All response schemas |

**Session Flow:**
```python
# Detected pattern (simple operations)
Router (session: SessionDep)
    → CRUD helper function(session, ...) or direct query
        → session.execute(query)

# Detected pattern (complex operations with external integrations)
Router (session: SessionDep)
    → Service.method(session, ...)
        → CRUD helper / external API call
```

#### Frontend (Next.js)

| Pattern | Detected | Implementation |
|---------|----------|----------------|
| **SSR + SWR Hybrid** | Yes | Pages fetch, SWR for updates |
| **Server Components** | Yes | Pages are server components |
| **Context for State** | Yes | Entity-specific contexts |
| **Server Actions** | Partial | Some use API routes |
| **URL State (nuqs)** | Yes | Filters, pagination in URL |

**Data Flow:**
```typescript
// Detected pattern
Page (Server) → fetch initial data
    → Client Component (useSWR with fallbackData)
        → Context (CRUD mutations)
            → API Routes → Backend
```

### Code Style Patterns

#### Python

| Aspect | Pattern | Consistency |
|--------|---------|-------------|
| Imports | Absolute | 100% |
| String formatting | f-strings | 95% |
| Type hints | Present | 90% |
| Docstrings | Google style | 60% |
| Line length | 88 (Black) | 100% |

#### TypeScript

| Aspect | Pattern | Consistency |
|--------|---------|-------------|
| Imports | Absolute (@/) | 100% |
| Quotes | Double | 100% |
| Semicolons | Yes | 100% |
| Component style | Function | 100% |
| Exports | Named | 95% |

### Entity Patterns

**Model Pattern:**
```python
class Entity(Base):
    __tablename__ = "entity"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())
```

**Detected entity features:**
- Bilingual fields (name_en, name_ar): 80% of entities
- Soft delete (is_active): 100% of entities
- Audit fields (created_at, updated_at): 100% of entities
- UUID primary keys: 0% (using Integer)

### API Patterns

**Endpoint Structure:**
```
/setting/{entities}/         GET (list), POST (create)
/setting/{entities}/{id}     GET (single), PUT (update), DELETE (soft delete)
```

**Response Pattern:**
```python
# List response
{
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 10,
    "pages": 10
}

# Single response
{
    "id": 1,
    "nameEn": "...",  # camelCase
    "nameAr": "...",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z"
}
```

### Pattern Documentation

Based on analysis, here's a pattern guide for new code:

#### Creating New Entity (Backend)

1. Model in `db/models.py`:
   - Include bilingual fields if needed
   - Include `is_active` for soft delete
   - Include `created_at`, `updated_at`

2. Schemas in `api/schemas/{entity}_schema.py`:
   - `{Entity}Create` for creation
   - `{Entity}Update` for updates
   - `{Entity}Response(CamelModel)` for responses

3. CRUD helpers in `api/crud/{entity}.py` (if reusable, 3+ uses):
   - Plain async functions (no classes)
   - Receive session as first parameter

4. Router in `api/routers/setting/{entity}_router.py`:
   - Inject session with `SessionDep`
   - Use CRUD helpers or direct queries for simple ops
   - Use services only for external integrations

#### Creating New Page (Frontend)

1. Page in `app/(pages)/setting/{entity}/page.tsx`:
   - Server component (no "use client")
   - Fetch initial data
   - Pass to client component

2. Table in `_components/table/{entity}-table.tsx`:
   - Client component
   - `useState(initialData)` (default) or `useSWR` (when justified)
   - Use context for mutations

3. Context in `context/{entity}-actions-context.tsx`:
   - Provide CRUD operations
   - Handle state mutations with server responses
   - No optimistic updates
```
