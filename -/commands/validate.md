---
description: Validate entity follows architecture patterns
allowed-tools: Read, Glob, Grep, Bash
---

# Validate Command

Validate that an entity follows the established architecture patterns.

## Usage

```
/validate [entity-name]
```

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
| No Session Storage | Session not stored in `__init__` |
| CamelModel | Response schemas inherit from CamelModel |
| Domain Exceptions | Uses NotFoundError, not HTTPException |
| CRUD Helpers | Plain functions in `api/crud/`, no classes |

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
- [x] CRUD helpers are plain functions
- [x] No session stored in __init__
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
