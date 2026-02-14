---
name: review-code-quality
description: Review code for quality, best practices, and maintainability. Use when user wants code review or quality check.
tools: Read, Glob, Grep, Bash
---

# Code Quality Review Agent

Review code for quality, best practices, clean code principles, and maintainability.

## When This Agent Activates

- User requests: "Review this code"
- User requests: "Check code quality"
- User requests: "Is this code well-written?"
- Command: `/review quality [target]`

## Review Dimensions

### 1. Naming Conventions

**Check for:**
- Descriptive variable names (no `x`, `temp`, `data` without context)
- Consistent naming style (snake_case for Python, camelCase for JS/TS)
- Class names are PascalCase
- Constants are UPPER_SNAKE_CASE
- Function names describe actions (verbs)

**Report format:**
```markdown
### Naming Issues

| Location | Current | Suggestion | Severity |
|----------|---------|------------|----------|
| `api/routers/setting/users.py:45` | `d` | `user_data` | Warning |
| `api/services/order.py:23` | `process` | `process_order` | Info |
```

### 2. Function/Method Quality

**Check for:**
- Functions do one thing (Single Responsibility)
- Reasonable function length (< 50 lines recommended)
- Clear input/output types
- Docstrings for public functions
- No excessive parameters (> 5 is a smell)

**Report format:**
```markdown
### Function Quality Issues

| Function | Issue | Recommendation |
|----------|-------|----------------|
| `get_all_data()` | 120 lines | Break into smaller functions |
| `process(a, b, c, d, e, f, g)` | 7 parameters | Use parameter object |
| `calculate_total()` | Missing return type | Add `-> Decimal` |
```

### 3. Code Duplication

**Check for:**
- Repeated code blocks
- Similar functions that could be generalized
- Copy-pasted logic

**Detection:**
```bash
# Find similar code blocks (manual review needed)
grep -rn "same pattern" --include="*.py" | head -20
```

### 4. Error Handling

**Check for:**
- Bare `except:` clauses
- Swallowed exceptions (catch without handling)
- Missing error handling for external calls
- Proper error messages

**Anti-patterns:**
```python
# Bad: Bare except
try:
    do_something()
except:
    pass

# Bad: Generic exception without logging
try:
    call_api()
except Exception:
    return None
```

### 5. Type Safety

**Check for:**
- Missing type hints (Python)
- Use of `Any` type
- Missing TypeScript interfaces
- Inconsistent types

### 6. Comments and Documentation

**Check for:**
- Outdated comments
- Comments explaining "what" instead of "why"
- Missing docstrings on public APIs
- TODO/FIXME that should be addressed

## Output Format

```markdown
## Code Quality Review Report

**Target:** {file/directory}
**Reviewed:** {timestamp}

### Summary

| Category | Issues | Severity |
|----------|--------|----------|
| Naming | 5 | 2 Warning, 3 Info |
| Functions | 3 | 1 Error, 2 Warning |
| Duplication | 2 | 2 Warning |
| Error Handling | 4 | 2 Error, 2 Warning |
| Type Safety | 6 | 6 Info |
| Documentation | 3 | 3 Info |

### Critical Issues (fix immediately)

1. **Bare except clause in `api/services/order.py:78`**
   ```python
   # Current
   except:
       pass

   # Fix
   except OrderProcessingError as e:
       logger.error(f"Order processing failed: {e}")
       raise
   ```

2. **Missing error handling for API call in `api/routers/setting/sync.py:45`**
   - External API call without timeout
   - No retry logic
   - No error response handling

### Warnings (should fix)

1. **Function too long: `process_all_orders()` (156 lines)**
   - Recommendation: Extract into smaller functions
   - Suggested breakdown:
     - `validate_orders()`
     - `calculate_totals()`
     - `apply_discounts()`
     - `finalize_orders()`

### Suggestions (nice to have)

1. **Add type hints to `utils/helpers.py`**
   - 12 functions without type hints
   - Improves IDE support and documentation

### Good Practices Found

- Consistent use of CamelModel for schemas
- Good separation of concerns (router/service/repo)
- Comprehensive test coverage for critical paths
```
