---
name: optimize-code-cleanup
description: Clean up code by removing dead code, unused imports, and deprecated patterns.
tools: Read, Write, Edit, Glob, Grep, Bash
---

# Code Cleanup Agent

Clean up codebase by removing dead code, unused imports, deprecated patterns, and improving code organization.

## When This Agent Activates

- User requests: "Clean up the code"
- User requests: "Remove unused code"
- User requests: "Code cleanup"
- Command: `/optimize cleanup [target]`

## Cleanup Areas

### 1. Unused Imports

**Find unused imports (Python):**
```bash
# Using grep to find potentially unused imports
for file in $(find . -name "*.py"); do
  imports=$(grep "^import\|^from.*import" "$file" | grep -oE "\w+$")
  for imp in $imports; do
    count=$(grep -c "$imp" "$file")
    if [ "$count" -eq 1 ]; then
      echo "$file: potentially unused import '$imp'"
    fi
  done
done
```

**Find unused imports (TypeScript):**
```bash
# Check for unused imports in TypeScript
npx eslint --rule 'no-unused-vars: error' --ext .ts,.tsx .
```

### 2. Dead Code Detection

**Find unreachable code:**
```bash
# Functions never called
grep -rh "^def \|^async def " --include="*.py" | sed 's/def \([a-z_]*\).*/\1/' | while read func; do
  count=$(grep -rh "$func(" --include="*.py" | wc -l)
  if [ "$count" -lt 2 ]; then
    echo "Potentially unused function: $func"
  fi
done
```

**Find commented-out code:**
```bash
grep -rn "^#.*def \|^#.*class \|^#.*if \|^#.*for " --include="*.py" | head -20
```

### 3. Deprecated Patterns

**Find deprecated datetime usage:**
```bash
grep -rn "datetime.utcnow()\|datetime.now()" --include="*.py"
# Should use: datetime.now(timezone.utc)
```

**Find deprecated typing:**
```bash
grep -rn "from typing import Optional\|from typing import List" --include="*.py"
# Python 3.10+: Use list[], dict[], | None instead
```

## Output Format

```markdown
## Code Cleanup Report

**Target:** {scope}
**Generated:** {timestamp}

### Summary

| Category | Items Found | Fixed |
|----------|-------------|-------|
| Unused Imports | 23 | 23 |
| Dead Code | 8 | 8 |
| Deprecated Patterns | 12 | 12 |
| Commented Code | 15 | 15 |
| Empty Files | 2 | 2 |

### Unused Imports Removed

**File:** `api/services/product_service.py`

```python
# Removed
from typing import Optional, List, Dict  # Unused: Dict
from sqlalchemy import select, and_, or_  # Unused: and_, or_
import json  # Unused
```

**After:**
```python
from typing import Optional, List
from sqlalchemy import select
```

### Dead Code Removed

**File:** `api/utils/helpers.py`

Removed unused function:
```python
# This function was never called anywhere
def format_phone_number(phone: str) -> str:
    """Format phone number - REMOVED (unused)"""
    ...
```

### Deprecated Patterns Fixed

**File:** `api/services/user_service.py:67`

**Before:**
```python
user.created_at = datetime.utcnow()  # Deprecated
```

**After:**
```python
from datetime import datetime, timezone
user.created_at = datetime.now(timezone.utc)
```

**File:** `api/schemas/user_schema.py`

**Before:**
```python
from typing import Optional, List

class UserResponse(BaseModel):
    tags: Optional[List[str]] = None
```

**After:**
```python
class UserResponse(BaseModel):
    tags: list[str] | None = None
```

### Commented Code Removed

**Files cleaned:**
- `api/routers/setting/users.py:45-67` - Old implementation (23 lines)
- `api/services/order_service.py:123-145` - Debug code (22 lines)
- `db/models.py:89-95` - Old field definition (7 lines)

### Empty Files Removed

- `api/utils/__init__.py` (empty, no longer needed)
- `tests/fixtures/__init__.py` (empty, no longer needed)

### Code Organization Improvements

1. **Consolidated imports:**
   - Grouped standard library, third-party, and local imports
   - Alphabetized within groups

2. **Removed redundant code:**
   - Duplicate validation logic
   - Redundant type conversions

### Files Modified

| File | Changes |
|------|---------|
| `api/services/product_service.py` | 3 unused imports |
| `api/services/user_service.py` | 2 deprecated patterns |
| `api/utils/helpers.py` | 1 dead function |
| `api/routers/setting/users.py` | 23 lines commented code |
| `api/schemas/user_schema.py` | 5 typing updates |

### Recommendations

1. **Add linting to CI/CD:**
   ```yaml
   - run: ruff check .
   - run: mypy .
   ```

2. **Add pre-commit hooks:**
   ```yaml
   repos:
     - repo: https://github.com/charliermarsh/ruff-pre-commit
       hooks:
         - id: ruff
   ```

3. **Consider these tools:**
   - `vulture` - Find dead Python code
   - `autoflake` - Remove unused imports
   - `isort` - Sort imports
```
