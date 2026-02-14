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

#### 1. Router -> Service Delegation

**Required Pattern:**
- ALL routers delegate to a Service class
- Service instantiated per-handler with local import
- No direct queries or repository calls in routers

**Validation:**
```bash
# Check router delegates to service
grep -n "Service(session" api/routers/setting/{entity}_router.py

# Check NO direct queries in router (should be 0)
grep -n "select(\|await session\." api/routers/setting/{entity}_router.py 2>/dev/null

# Check NO repository imports in router (should be 0)
grep -n "Repository" api/routers/setting/{entity}_router.py 2>/dev/null
```

**Pass criteria:**
```python
# Router - delegates to service
@router.get("/")
async def list_items(session: SessionDep):
    from api.services.setting.item_service import ItemService
    service = ItemService(session)
    return await service.get_items()
```

#### 2. Repository Pattern

**Required Pattern:**
- Repository class in `api/repositories/setting/{entity}_repository.py`
- Inherits from `BaseRepository[T]`
- `model = EntityClass` as class attribute
- Session in `__init__` via `super().__init__(session)`
- flush() not commit()

**Validation:**
```bash
# Check repository exists
ls api/repositories/setting/{entity}_repository.py 2>/dev/null

# Check inherits BaseRepository
grep -n "BaseRepository\[" api/repositories/setting/{entity}_repository.py

# Check model class attribute
grep -n "model = " api/repositories/setting/{entity}_repository.py

# Check NO commit in repository (should be 0)
grep -n "session.commit\|await.*commit" api/repositories/setting/{entity}_repository.py 2>/dev/null
```

#### 3. Service Pattern

**Required Pattern:**
- Service instantiates repositories in `__init__`
- Service commits transactions
- Uses repositories for all data access

**Validation:**
```bash
# Check service instantiates repositories
grep -n "Repository(session)" api/services/setting/{entity}_service.py

# Check service commits
grep -n "session.commit" api/services/setting/{entity}_service.py

# Check NO direct queries in service (should be 0)
grep -n "^.*select(" api/services/setting/{entity}_service.py 2>/dev/null
```

#### 4. Schema Inheritance

**Required Pattern:**
- Response schemas inherit from `CamelModel`
- Create/Update schemas use appropriate base
- Proper field definitions

**Validation:**
```bash
grep -n "class.*Response.*CamelModel\|class.*Request.*CamelModel" api/schemas/{entity}_schema.py
```

#### 5. SessionDep Injection

**Required Pattern:**
- Session injected via `SessionDep` type alias in router
- Session passed to Service constructor

**Validation:**
```bash
grep -n "session: SessionDep" api/routers/setting/{entity}_router.py
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
```

#### 2. Server Response Updates

**Required Pattern:**
- Never use optimistic updates
- Always update cache with server response

**Validation:**
```bash
# Should NOT have optimistic
grep -n "optimistic" app/\(pages\)/setting/{entity}/

# Should use server response
grep -n "updateItems\|responseMap" app/\(pages\)/setting/{entity}/
```

#### 3. Context-Based Actions

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
| Router -> Service delegation | PASS | All endpoints delegate |
| Repository pattern (BaseRepository[T]) | PASS | Correct inheritance |
| Service instantiates repositories | PASS | Repos in __init__ |
| Service commits transactions | PASS | commit() in service |
| CamelModel schemas | PASS | All responses inherit correctly |
| SessionDep injection | PASS | Used in all endpoints |
| SSR + Simplified pattern | PASS | Correct pattern |
| Server response updates | WARN | Missing in delete action |

### Failed Checks

#### 1. Direct Query in Router

**Location:** `api/routers/setting/{entity}_router.py:67`

**Current:**
```python
stmt = select(Item).offset(skip).limit(limit)
items = await session.scalars(stmt)
```

**Should be:**
```python
from api.services.setting.item_service import ItemService
service = ItemService(session)
return await service.get_items(skip, limit)
```

### Passed Checks

- [x] All router endpoints delegate to Service
- [x] Repository inherits BaseRepository[T]
- [x] Repository uses flush() not commit()
- [x] Service instantiates repositories in __init__
- [x] Service commits transactions
- [x] No session stored in router-level variables
- [x] Response schemas inherit from CamelModel
- [x] Page is server component
- [x] Table uses useState with initialData (simplified pattern)
- [x] Context provides CRUD actions
```

## Quick Validation Script

For rapid validation, run:

```bash
# FastAPI entity validation
echo "=== FastAPI Patterns ==="
echo "Router delegates to Service:"
grep -c "Service(session" api/routers/setting/{entity}_router.py
echo "Repository exists:"
ls api/repositories/setting/{entity}_repository.py 2>/dev/null && echo "Yes" || echo "No"
echo "Repository inherits BaseRepository:"
grep -c "BaseRepository\[" api/repositories/setting/{entity}_repository.py 2>/dev/null || echo "0"
echo "Service instantiates repositories:"
grep -c "Repository(session)" api/services/setting/{entity}_service.py 2>/dev/null || echo "0"
echo "No commit in repository (should be 0):"
grep -c "session.commit" api/repositories/setting/{entity}_repository.py 2>/dev/null || echo "0"
echo ""
echo "=== Next.js Patterns ==="
echo "'use client' in page (should be 0):"
grep -c '"use client"' app/\(pages\)/setting/{entity}/page.tsx 2>/dev/null || echo "0"
echo "useState with initialData (simplified pattern):"
grep -c "useState.*initialData" app/\(pages\)/setting/{entity}/_components/table/*.tsx 2>/dev/null || echo "0"
```
