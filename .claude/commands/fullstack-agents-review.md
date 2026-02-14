---
description: Review code for quality, security, performance, or patterns
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Review Command

Review code for various quality aspects.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/review [type] [target]`

## Execution Flow

1. **Parse arguments**: Extract `type` and optional `target` from `$ARGUMENTS`
2. **Load appropriate skill**:
   - `quality` → `/skill review-patterns` (for general code patterns)
   - `security` → No specific skill needed
   - `performance` → `/skill review-patterns` (for performance patterns)
   - `patterns` → `/skill review-patterns`
3. **Execute review** with the loaded skill context

## Types & Skills

| Type | Skill to Load | Description |
|------|---------------|-------------|
| `quality` | `review-patterns` | Code quality, best practices, maintainability |
| `security` | None | Security vulnerabilities, OWASP top 10 |
| `performance` | `review-patterns` | Performance issues, N+1 queries, bottlenecks |
| `patterns` | `review-patterns` | Architecture pattern compliance |

## Target Options

- Specific file: `/review quality api/services/user_service.py`
- Entity: `/review patterns product`
- Directory: `/review security api/`
- All: `/review quality` (reviews changed files or full codebase)

## Examples

```bash
# Code quality review
/review quality api/services/order_service.py

# Security audit
/review security

# Performance review
/review performance api/routers/setting/product_router.py

# Pattern compliance for entity
/review patterns product
```

## Review Output

Each review produces a report with:

### Quality Review
- Naming convention issues
- Function complexity
- Code duplication
- Error handling gaps
- Documentation gaps

### Security Review
- SQL injection risks
- Authentication gaps
- Authorization issues
- Sensitive data exposure
- Dependency vulnerabilities

### Performance Review
- N+1 query detection
- Missing indexes
- Memory issues
- Blocking operations
- Caching opportunities

### Pattern Compliance
- Session flow validation
- Schema inheritance check
- Repository pattern compliance
- SSR + simplified pattern check
- Context pattern validation

## Severity Levels

- **Critical** - Must fix immediately
- **Error** - Should fix before deployment
- **Warning** - Should be addressed
- **Info** - Suggestions for improvement
