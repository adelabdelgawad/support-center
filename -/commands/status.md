---
description: Show project detection status and available actions
allowed-tools: Read, Glob, Grep, Bash
---

# Status Command

Show project detection status, entity inventory, and available actions.

## Usage

```
/status
```

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
