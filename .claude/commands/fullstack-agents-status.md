---
description: Show project detection status and available actions
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Status Command

Show project detection status, entity inventory, and available actions.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/status [options]`

## Execution Flow

1. **Parse arguments**: Extract `options` from `$ARGUMENTS` (default: all)
2. **Load appropriate skill**:
   - `/skill project-architecture` - For project detection
   - `/skill review-patterns` - For pattern compliance check
3. **Execute status check** with the loaded skill context

## What It Shows

### 1. Project Detection

Detects and displays:
- FastAPI backend
- Next.js frontend
- Docker infrastructure
- Celery workers
- APScheduler

### 2. Entity Inventory

Shows all entities and their completeness:

```
| Entity | Model | Schema | CRUD | Router | Frontend |
|--------|-------|--------|------|--------|----------|
| User   | [x]   | [x]    | [x]  | [x]    | [x]      |
| Product| [x]   | [x]    | [x]  | [x]    | [ ]      |
| Order  | [x]   | [ ]    | [ ]  | [ ]    | [ ]      |
```

### 3. Available Actions

Suggests next actions based on project state:

```
## Suggested Actions

1. Complete Product frontend:
   /generate data-table products

2. Complete Order entity:
   /generate entity order

3. Add Docker infrastructure:
   /scaffold docker
```

### 4. Health Check

Shows project health:
- Pattern compliance
- Test coverage
- Dependency status
- Security issues

## Example Output

```markdown
## Project Status

### Detected Projects

| Project | Type | Path | Status |
|---------|------|------|--------|
| Backend | FastAPI | `./` | Complete |
| Frontend | Next.js | `./frontend` | Complete |
| Docker | Docker Compose | `./` | Partial |

### Entity Inventory

| Entity | Backend | Frontend |
|--------|---------|----------|
| User | Complete | Complete |
| Product | Complete | Missing |
| Category | Complete | Missing |
| Order | Partial | Missing |

### Health

| Metric | Status |
|--------|--------|
| Pattern Compliance | 95% |
| Test Coverage | 68% |
| Dependencies | 2 outdated |
| Security | 1 warning |

### Quick Actions

- `/generate data-table products` - Add Product management page
- `/generate data-table categories` - Add Category management page
- `/generate entity order` - Complete Order backend
- `/optimize queries` - Fix detected N+1 queries
- `/review security` - Address security warning
```

## Quick Status Checks

```bash
# Full status
/status

# Backend only
/status --backend

# Frontend only
/status --frontend

# Entities only
/status --entities

# Health only
/status --health
```
