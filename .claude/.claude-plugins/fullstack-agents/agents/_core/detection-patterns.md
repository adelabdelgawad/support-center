# Detection Patterns

Patterns for detecting project type, existing code, and codebase state.

## Project Structure Detection

### FastAPI Project

```python
FASTAPI_INDICATORS = {
    "required": [
        ("pyproject.toml", contains="fastapi") or ("requirements.txt", contains="fastapi"),
    ],
    "structure": {
        "minimal": exists("app.py") or exists("main.py"),
        "standard": exists("api/") and exists("db/"),
        "complete": exists("api/routers/") and exists("api/repositories/") and exists("api/schemas/")
    },
    "features": {
        "auth": exists("api/auth/") or grep("OAuth|JWT", "**/*.py"),
        "celery": exists("celery_app.py") or grep("from celery", "**/*.py"),
        "scheduler": grep("APScheduler", "**/*.py"),
    }
}
```

**Detection Commands:**

```bash
# Check for FastAPI
cat pyproject.toml 2>/dev/null | grep -i "fastapi"
cat requirements.txt 2>/dev/null | grep -i "fastapi"

# Check structure
ls -la app.py main.py 2>/dev/null
ls -d api/ db/ 2>/dev/null
ls -d api/routers/setting/ api/repositories/ api/schemas/ 2>/dev/null

# Check BaseRepository
cat api/repositories/base.py 2>/dev/null | head -5
```

### Next.js Project

```python
NEXTJS_INDICATORS = {
    "required": [
        ("package.json", contains="next"),
    ],
    "structure": {
        "app_router": exists("app/"),
        "pages_router": exists("pages/"),
        "complete": exists("app/") and exists("lib/") and exists("components/")
    },
    "features": {
        "auth": exists("lib/auth/") or grep("next-auth", "package.json"),
        "swr": grep("swr", "package.json"),
        "data_table": exists("components/data-table/")
    }
}
```

**Detection Commands:**

```bash
# Check for Next.js
cat package.json 2>/dev/null | grep '"next"'

# Check structure
ls -d app/ pages/ 2>/dev/null
ls -d lib/ components/ 2>/dev/null
ls -d components/data-table/ 2>/dev/null
```

### Docker Infrastructure

```python
DOCKER_INDICATORS = {
    "required": [
        exists("docker-compose.yml") or exists("docker-compose.yaml"),
    ],
    "structure": {
        "minimal": exists("Dockerfile"),
        "standard": exists("docker/") and exists("docker/env/"),
        "complete": exists("docker/backend/") and exists("docker/frontend/") and exists("docker/nginx/")
    },
    "services": {
        "postgres": grep("postgres", "docker-compose.yml"),
        "redis": grep("redis", "docker-compose.yml"),
        "nginx": grep("nginx", "docker-compose.yml"),
        "celery": grep("celery", "docker-compose.yml"),
    }
}
```

### Celery Worker

```python
CELERY_INDICATORS = {
    "required": [
        exists("celery_app.py") or grep("from celery import Celery", "**/*.py"),
    ],
    "structure": {
        "minimal": exists("celery_app.py"),
        "standard": exists("tasks/") or exists("workers/"),
        "complete": exists("tasks/") and exists("celery_app.py") and grep("beat_schedule", "**/*.py")
    }
}
```

## Existing Entity Detection

### Detect All Entities (FastAPI)

```bash
# Find all models in db/model.py
grep -h "class.*SQLModel.*table=True" db/model.py 2>/dev/null

# Find all routers
ls api/routers/setting/*.py 2>/dev/null | xargs -I {} basename {} .py

# Find all services
ls api/services/setting/*_service.py 2>/dev/null | xargs -I {} basename {} _service.py

# Find all repositories
ls api/repositories/setting/*_repository.py 2>/dev/null | xargs -I {} basename {} _repository.py

# Find all schemas
ls api/schemas/*_schema.py 2>/dev/null | xargs -I {} basename {} _schema.py
```

### Detect All Entities (Next.js)

```bash
# Find all entity pages
ls -d app/\(pages\)/setting/*/ 2>/dev/null | xargs -I {} basename {}

# Find all API routes
ls -d app/api/setting/*/ 2>/dev/null | xargs -I {} basename {}

# Find all types
ls lib/types/api/*.ts 2>/dev/null | xargs -I {} basename {} .ts
```

### Entity Completeness Check

```python
def check_entity_completeness(entity_name):
    """Check if entity has all required files"""

    fastapi_files = {
        "model": f"db/model.py contains class {entity_name}",
        "schema": f"api/schemas/{entity_name}_schema.py",
        "repository": f"api/repositories/setting/{entity_name}_repository.py",
        "service": f"api/services/setting/{entity_name}_service.py",
        "router": f"api/routers/setting/{entity_name}_router.py",
    }

    nextjs_files = {
        "types": f"lib/types/api/{entity_name}.ts",
        "page": f"app/(pages)/setting/{entity_name}/page.tsx",
        "table": f"app/(pages)/setting/{entity_name}/_components/table/{entity_name}-table.tsx",
        "context": f"app/(pages)/setting/{entity_name}/context/{entity_name}-context.tsx",
    }

    return {
        "fastapi": {k: exists(v) for k, v in fastapi_files.items()},
        "nextjs": {k: exists(v) for k, v in nextjs_files.items()},
    }
```

## Pattern Style Detection

### Detect Naming Conventions

```bash
# File naming (snake_case vs kebab-case)
ls api/routers/setting/*.py 2>/dev/null  # snake_case: user_router.py
ls app/**/*.tsx 2>/dev/null  # kebab-case: user-profile.tsx

# Class naming (always PascalCase)
grep "^class " api/**/*.py 2>/dev/null

# Function naming
grep "^def \|^async def " api/**/*.py 2>/dev/null
```

### Detect Field Patterns

```bash
# Bilingual fields
grep -l "name_en.*name_ar\|name_ar.*name_en" db/model.py 2>/dev/null

# Soft delete
grep -l "is_active.*Boolean\|is_deleted.*Boolean" db/model.py 2>/dev/null

# Audit fields
grep -l "created_at.*updated_at" db/model.py 2>/dev/null

# UUID primary keys
grep -l "UUID.*primary_key" db/model.py 2>/dev/null
```

### Detect Architecture Patterns

```bash
# Single-session-per-request (using SessionDep type alias)
grep -l "session: SessionDep" api/routers/setting/*.py 2>/dev/null

# CamelModel usage
grep -l "from.*CamelModel\|class.*CamelModel" api/schemas/*.py 2>/dev/null

# Repository pattern
ls api/repositories/setting/*.py 2>/dev/null

# BaseRepository
grep -l "BaseRepository" api/repositories/base.py 2>/dev/null

# Service pattern
grep -l "class.*Service" api/services/setting/*.py 2>/dev/null
```

## Detection Output Format

### Project Status Report

```markdown
## Project Detection Results

### Detected Projects

| Project | Type | Path | Status |
|---------|------|------|--------|
| Backend | FastAPI | `.` | Complete |
| Frontend | Next.js 16 | `./frontend` | Complete |
| Infrastructure | Docker | `./docker` | Partial |

### FastAPI Structure

| Component | Status | Path |
|-----------|--------|------|
| Entry Point | Found | `main.py` |
| Models | Found | `db/model.py` |
| Routers | Found | `api/routers/setting/` |
| Repositories | Found | `api/repositories/setting/` |
| Services | Found | `api/services/setting/` |
| Schemas | Found | `api/schemas/` |

### Detected Entities

| Entity | Model | Schema | Repository | Service | Router | Frontend |
|--------|-------|--------|------------|---------|--------|----------|
| User | [x] | [x] | [x] | [x] | [x] | [x] |
| Role | [x] | [x] | [x] | [x] | [x] | [x] |
| Product | [x] | [x] | [ ] | [ ] | [ ] | [ ] |

### Detected Patterns

| Pattern | Detected | Notes |
|---------|----------|-------|
| Repository pattern (BaseRepository[T]) | Yes | All entities |
| Service layer (all routers delegate) | Yes | All routers |
| SessionDep injection | Yes | All routers |
| CamelModel | Yes | All schemas |
| Bilingual fields | Yes | name_en/name_ar |
| Soft delete | Yes | is_active |
| Audit fields | Yes | created_at/updated_at |
| UUID primary keys | Mixed | Users=UUID, Roles=int |

### Recommendations

1. **Complete Product entity** - Missing repository, service, router
2. **Create Product frontend** - Backend in progress
```

## Detection Decision Tree

```
START
  |
  v
[Check pyproject.toml / package.json]
  |
  +-- Found pyproject.toml with fastapi? --> FASTAPI_PROJECT
  |     |
  |     v
  |   [Check structure]
  |     +-- Has api/routers/, repositories/, schemas? --> COMPLETE_FASTAPI
  |     +-- Has app.py only? --> MINIMAL_FASTAPI
  |     +-- Missing base? --> NEEDS_SCAFFOLD
  |
  +-- Found package.json with next? --> NEXTJS_PROJECT
  |     |
  |     v
  |   [Check structure]
  |     +-- Has app/, lib/, components? --> COMPLETE_NEXTJS
  |     +-- Has app/ only? --> MINIMAL_NEXTJS
  |     +-- Missing base? --> NEEDS_SCAFFOLD
  |
  +-- Found docker-compose.yml? --> DOCKER_PROJECT
  |
  +-- Found both fastapi + next? --> FULLSTACK_PROJECT
  |
  +-- Found nothing? --> NEW_PROJECT
        |
        v
      [Offer scaffold options]
```
