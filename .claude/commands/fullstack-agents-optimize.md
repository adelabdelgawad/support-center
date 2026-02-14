---
description: Optimize code for performance, cleanliness, or maintainability
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Optimize Command

Optimize your codebase for performance, cleanliness, or maintainability.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/optimize [type] [target]`

## Execution Flow

1. **Parse arguments**: Extract `type` and optional `target` from `$ARGUMENTS`
2. **Load appropriate skill**:
   - `performance` → `/skill review-patterns`
   - `cleanup` → `/skill batch-error-resolution`
   - `refactor` → `/skill review-patterns`
   - `queries` → `/skill fastapi-patterns`
3. **Execute optimization** with the loaded skill context

## Types & Skills

| Type | Skill to Load | Description |
|------|---------------|-------------|
| `performance` | `review-patterns` | Performance optimization (queries, caching) |
| `cleanup` | `batch-error-resolution` | Remove dead code, unused imports |
| `refactor` | `review-patterns` | Improve code structure |
| `queries` | `fastapi-patterns` | Database query optimization |

## Examples

```bash
# Optimize performance
/optimize performance api/routers/setting/products.py

# Clean up code
/optimize cleanup api/services/

# Refactor code
/optimize refactor api/services/order_service.py

# Optimize database queries
/optimize queries
```

## Optimization Types

### Performance Optimization

- Fix N+1 queries with eager loading
- Add Redis caching
- Optimize query column selection
- Add pagination
- Implement connection pooling

### Code Cleanup

- Remove unused imports
- Delete dead code
- Remove commented-out code
- Fix deprecated patterns
- Clean empty files

### Code Refactoring

- Extract methods
- Replace conditionals with polymorphism
- Introduce parameter objects
- Replace magic numbers with constants
- Improve naming

### Query Optimization

- Analyze execution plans
- Add missing indexes
- Fix N+1 queries
- Optimize JOIN operations
- Add partial indexes

## Output

Each optimization produces:
- List of changes made
- Before/after comparison
- Performance metrics (if applicable)
- Migration files (for indexes)
- Recommendations for further improvement

## Safe Mode

By default, optimizations show a preview before applying:

```
/optimize performance

## Optimization Plan

1. Add eager loading in product_service.py
2. Add index on product.category_id
3. Add caching for category list

Confirm? (yes/no)
```

## Bulk Optimization

Optimize entire codebase:

```bash
# Clean up entire codebase
/optimize cleanup

# Optimize all queries
/optimize queries
```
