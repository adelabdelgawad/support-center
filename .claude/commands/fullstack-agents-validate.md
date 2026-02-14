---
description: Validate entity follows architecture patterns
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Validate Command

Validate that an entity follows the established architecture patterns.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/validate [entity-name]`

## Execution Flow

1. **Parse arguments**: Extract `entity-name` from `$ARGUMENTS`
2. **Load appropriate skill**:
   - `/skill review-patterns` - For validation patterns
   - `/skill fastapi-patterns` - For backend pattern validation
   - `/skill nextjs-patterns` - For frontend pattern validation
3. **Execute validation** with the loaded skill context

## Examples

```bash
# Validate product entity
/validate product

# Validate user entity
/validate user

# Validate all entities
/validate
```

## What Gets Validated

### FastAPI Patterns

| Check | Description |
|-------|-------------|
| SessionDep | Router uses `SessionDep` type alias |
| Repository Pattern | Repository inherits `BaseRepository[T]`, uses `flush()` not `commit()` |
| Service Pattern | Service instantiates repositories in `__init__`, commits transactions |
| CamelModel | Response schemas inherit from CamelModel |
| Domain Exceptions | Uses `DetailedHTTPException`, not raw HTTPException |
| Router Delegation | ALL routers delegate to Service, no direct DB queries |

### Next.js Patterns

| Check | Description |
|-------|-------------|
| SSR Page | Page is server component (no "use client") |
| Data Pattern | Table uses `useState(initialData)` (default) or SWR (with justification) |
| Server Response | Updates use server response, not optimistic |
| URL State | Filters/pagination in URL via nuqs |
| Context Pattern | CRUD actions via context |

## Validation Output

```markdown
## Validation Report: Product

### Summary
- **Passed**: 12 checks
- **Failed**: 2 checks
- **Warnings**: 1 check

### Failed Checks

#### 1. HTTPException in Service
- **File**: `api/services/product_service.py:67`
- **Issue**: Using HTTPException instead of domain exception
- **Fix**: Replace with `raise NotFoundError(...)`

### Passed Checks

- [x] SessionDep used in router endpoints
- [x] Repositories inherit BaseRepository[T]
- [x] Service instantiates repositories in __init__
- [x] Service commits, repositories only flush
- [x] Router delegates to Service (no direct queries)
- [x] Schemas inherit from CamelModel
- [x] Page is server component
- [x] Table uses simplified pattern (or SWR with justification)
...
```

## Quick Validation

For quick pattern check:

```bash
# Check session flow only
/validate product --check session

# Check frontend only
/validate product --frontend

# Check backend only
/validate product --backend
```

## Continuous Validation

Add to CI/CD:

```yaml
- name: Validate Patterns
  run: claude /validate --all --strict
```
