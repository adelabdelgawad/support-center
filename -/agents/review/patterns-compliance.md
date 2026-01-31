---
name: review-patterns-compliance
description: Validate code follows established architecture patterns (session flow, repository pattern, SSR+SWR, etc.).
tools: Read, Glob, Grep, Bash
---

# Patterns Compliance Review Agent

Validate that code follows the established architecture patterns for FastAPI and Next.js.

## When This Agent Activates

- User requests: "Validate patterns"
- User requests: "Check if this follows the architecture"
- User requests: "Review for pattern compliance"
- Command: `/review patterns [entity]`
- Command: `/validate [entity]`

## Pattern Categories

### FastAPI Patterns

#### 1. SessionDep Injection

**Required Pattern:**
- Session is injected via `SessionDep` type alias in router
- Session is passed to CRUD helpers or used directly in router
- For complex operations, session is passed to service methods
- No session stored in `__init__`

**Validation:**
```bash
# Check router has SessionDep
grep -n "session: SessionDep" api/routers/setting/{entity}_router.py

# Check NO session in __init__
grep -n "self._session\|self.session" api/services/{entity}_service.py 2>/dev/null
```

**Pass criteria:**
```python
# Router - simple operations (direct queries or CRUD helpers)
@router.get("")
async def list_items(
    session: SessionDep,  # REQUIRED - type alias for AsyncSession
):
    return await items_crud.get_items(session, skip, limit)

# CRUD helper (plain function, not class)
async def get_items(session: AsyncSession, skip: int, limit: int) -> list[Item]:
    stmt = select(Item).offset(skip).limit(limit)
    return (await session.scalars(stmt)).all()
```

#### 2. CRUD Helper Pattern

**Required Pattern:**
- CRUD helpers are plain async functions in `api/crud/{entity}.py`
- No classes, no state
- Used for reusable queries (3+ uses)
- Simple queries can go directly in routers

**Validation:**
```bash
# Check CRUD helpers exist
ls api/crud/{entity}.py 2>/dev/null

# Check NO classes in CRUD helpers (should be plain functions)
grep -n "^class " api/crud/{entity}.py 2>/dev/null
```

#### 3. Schema Inheritance

**Required Pattern:**
- Response schemas inherit from `CamelModel`
- Create/Update schemas use appropriate base
- Proper field definitions

**Validation:**
```bash
grep -n "class.*Response.*CamelModel\|class.*Response.*BaseModel" api/schemas/{entity}_schema.py
```

#### 4. Domain Exceptions

**Required Pattern:**
- Use domain exceptions (NotFoundError, ConflictError, ValidationError)
- Exceptions mapped to HTTP status codes
- No raw HTTP exceptions in services

**Validation:**
```bash
# Should NOT find raw HTTP exceptions in services
grep -n "raise HTTPException" api/services/{entity}_service.py 2>/dev/null
```

### Next.js Patterns

#### 1. SSR + Simplified Pattern (Default)

**Required Pattern:**
- Page component is server component (no "use client")
- Page fetches initial data
- Client component uses `useState(initialData)` (default) or `useSWR` (when justified)

**Validation:**
```bash
# Page should NOT have "use client"
grep -n '"use client"' app/\(pages\)/setting/{entity}/page.tsx

# Client component should use useState with initialData (default pattern)
grep -n "useState.*initialData\|useState(initialData" app/\(pages\)/setting/{entity}/_components/table/{entity}-table.tsx

# OR if SWR is used, should have justification comment
grep -n "SWR JUSTIFICATION" app/\(pages\)/setting/{entity}/_components/table/{entity}-table.tsx
```

#### 2. Server Response Updates

**Required Pattern:**
- Never use optimistic updates
- Always update cache with server response
- Use `mutate` with server response

**Validation:**
```bash
# Should NOT have optimistic
grep -n "optimistic" app/\(pages\)/setting/{entity}/

# Should use server response
grep -n "mutate.*response\|responseMap" app/\(pages\)/setting/{entity}/
```

#### 3. URL State Management

**Required Pattern:**
- Filter/sort/pagination state in URL
- Use `nuqs` for URL state
- State persists on refresh

**Validation:**
```bash
grep -n "useQueryState\|parseAsInteger\|parseAsString" app/\(pages\)/setting/{entity}/
```

#### 4. Context-Based Actions

**Required Pattern:**
- CRUD actions provided via context
- Context wraps table component
- Actions accessible from deeply nested components

## Output Format

```markdown
## Patterns Compliance Report

**Entity:** {EntityName}
**Date:** {timestamp}

### Summary

| Pattern | Status | Notes |
|---------|--------|-------|
| SessionDep injection | PASS | All endpoints compliant |
| CamelModel schemas | PASS | All responses inherit correctly |
| Domain exceptions | FAIL | HTTPException in service |
| CRUD helpers are plain functions | PASS | No classes in crud/ |
| SSR + Simplified pattern | PASS | Correct pattern |
| Server response updates | WARN | Missing in delete action |
| URL state | PASS | Using nuqs |

### Failed Checks

#### 1. Domain Exceptions Not Used

**Location:** `api/services/{entity}_service.py:67`

**Current:**
```python
raise HTTPException(status_code=404, detail="Not found")
```

**Should be:**
```python
from api.exceptions import NotFoundError
raise NotFoundError(f"{Entity} with id {id} not found")
```

### Warnings

#### 2. Missing Server Response in Delete

**Location:** `app/(pages)/setting/{entity}/context/{entity}-context.tsx:89`

**Current:**
```python
await deleteEntity(id)
mutate()  # Just revalidates
```

**Recommended:**
```python
const response = await deleteEntity(id)
mutate(data => data.filter(item => item.id !== id), false)
```

### Passed Checks

- [x] SessionDep used in all router endpoints (5/5 endpoints)
- [x] CRUD helpers are plain functions (no classes)
- [x] No session stored in constructors
- [x] Response schemas inherit from CamelModel
- [x] Page is server component
- [x] Table uses useState with initialData (simplified pattern)
- [x] URL state managed with nuqs
- [x] Context provides CRUD actions

### Recommendations

1. **Update service to use domain exceptions**
   - Replace all `HTTPException` with domain exceptions
   - Exception handler will map to correct status codes

2. **Add server response handling to delete**
   - Update mutation to use server response
   - Maintains consistency with create/update patterns
```

## Quick Validation Script

For rapid validation, run:

```bash
# FastAPI entity validation
echo "=== FastAPI Patterns ==="
echo "SessionDep in router:"
grep -c "session: SessionDep" api/routers/setting/{entity}_router.py
echo "CRUD helpers exist:"
ls api/crud/{entity}.py 2>/dev/null && echo "Yes" || echo "No"
echo "Classes in CRUD helpers (should be 0):"
grep -c "^class " api/crud/{entity}.py 2>/dev/null || echo "0"
echo "HTTPException in service (should be 0):"
grep -c "HTTPException" api/services/{entity}_service.py 2>/dev/null || echo "0"
echo ""
echo "=== Next.js Patterns ==="
echo "'use client' in page (should be 0):"
grep -c '"use client"' app/\(pages\)/setting/{entity}/page.tsx 2>/dev/null || echo "0"
echo "useState with initialData (simplified pattern):"
grep -c "useState.*initialData" app/\(pages\)/setting/{entity}/_components/table/*.tsx 2>/dev/null || echo "0"
echo "SWR usage (optional, needs justification):"
grep -c "useSWR" app/\(pages\)/setting/{entity}/_components/table/*.tsx 2>/dev/null || echo "0"
```
