---
description: Scaffold new projects or modules
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Scaffold Command

Scaffold new projects or add modules to existing projects.

## Usage

```
/scaffold [type]
```

## Types

| Type | Agent | Description |
|------|-------|-------------|
| `fastapi` | scaffold/project-fastapi | New FastAPI project with full structure |
| `nextjs` | scaffold/project-nextjs | New Next.js project with App Router |
| `docker` | scaffold/docker-infrastructure | Docker infrastructure (compose, Dockerfiles) |
| `backend-module` | scaffold/module-backend | Add module to FastAPI (auth, uploads, etc.) |
| `frontend-module` | scaffold/module-frontend | Add module to Next.js (data-table, forms, etc.) |
| `fullstack` | orchestration | Complete fullstack project |

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
