---
description: Scaffold new projects or modules
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Scaffold Command

Scaffold new projects or add modules to existing projects.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/scaffold [type] [name]`

## Execution Flow

1. **Parse arguments**: Extract `type` and optional `name` from `$ARGUMENTS`
2. **Load appropriate skill**:
   - `fastapi` → `/skill fastapi-patterns` + `/skill project-architecture`
   - `nextjs` → `/skill nextjs-patterns` + `/skill project-architecture`
   - `docker` → `/skill docker-patterns`
   - `backend-module` → `/skill fastapi-patterns`
   - `frontend-module` → `/skill nextjs-patterns` + `/skill data-table-patterns`
   - `fullstack` → Multiple skills (fastapi, nextjs, data-table, docker)
3. **Execute scaffolding** with the loaded skill context

## Types & Skills

| Type | Skill to Load | Description |
|------|---------------|-------------|
| `fastapi` | `fastapi-patterns` + `project-architecture` | New FastAPI project with full structure |
| `nextjs` | `nextjs-patterns` + `project-architecture` | New Next.js project with App Router |
| `docker` | `docker-patterns` | Docker infrastructure (compose, Dockerfiles) |
| `backend-module` | `fastapi-patterns` | Add module to FastAPI (auth, uploads, etc.) |
| `frontend-module` | `nextjs-patterns` + `data-table-patterns` | Add module to Next.js (data-table, forms, etc.) |
| `fullstack` | Multiple skills | Complete fullstack project |

## Examples

```bash
# Scaffold new FastAPI project
/scaffold fastapi

# Scaffold new Next.js project
/scaffold nextjs

# Add Docker infrastructure
/scaffold docker

# Add authentication to backend
/scaffold backend-module auth

# Add data-table component to frontend
/scaffold frontend-module data-table

# Scaffold complete fullstack project
/scaffold fullstack
```

## Project Scaffolding

### FastAPI Project

Creates:
- Application entry point
- Database configuration (SQLAlchemy)
- API structure (routers, services, repositories, schemas)
- Alembic migrations
- Exception handling
- Configuration management

### Next.js Project

Creates:
- App Router structure
- Component library (shadcn/ui)
- Data table components
- Fetch utilities
- TypeScript configuration
- Tailwind CSS setup

### Docker Infrastructure

Creates:
- docker-compose.yml
- Service Dockerfiles
- Nginx configuration
- Environment files
- Health checks

## Module Scaffolding

### Backend Modules

- `auth` - JWT authentication
- `upload` - File upload handling
- `email` - Email sending
- `pagination` - Pagination utilities
- `logging` - Structured logging

### Frontend Modules

- `data-table` - TanStack Table component
- `auth` - Authentication pages
- `forms` - Form components with validation
- `modals` - Modal/Sheet components
- `navigation` - Navigation components

## Interactive Process

1. **Configuration** - Ask about project settings and features
2. **Preview** - Show files to be created
3. **Confirmation** - Confirm before creating
4. **Generation** - Create all files
5. **Instructions** - Provide setup instructions
