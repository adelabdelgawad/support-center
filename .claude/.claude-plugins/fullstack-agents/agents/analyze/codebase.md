---
name: analyze-codebase
description: Comprehensive codebase analysis - project type, structure, entities, and health overview.
tools: Read, Glob, Grep, Bash
---

# Codebase Analysis Agent

Perform comprehensive analysis of the entire codebase including project detection, entity inventory, and health assessment.

## When This Agent Activates

- User requests: "Analyze the codebase"
- User requests: "What does this project contain?"
- User requests: "Give me an overview"
- Command: `/analyze codebase`
- Command: `/status`

## Analysis Dimensions

### 1. Project Detection

**Detect project types:**

```bash
# FastAPI
[ -f "pyproject.toml" ] && grep -q "fastapi" pyproject.toml && echo "FastAPI: Yes"
[ -f "requirements.txt" ] && grep -q "fastapi" requirements.txt && echo "FastAPI: Yes"

# Next.js
[ -f "package.json" ] && grep -q '"next"' package.json && echo "Next.js: Yes"

# Docker
[ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ] && echo "Docker: Yes"

# Celery
grep -rq "from celery" *.py 2>/dev/null && echo "Celery: Yes"

# APScheduler
grep -rq "apscheduler" *.py requirements.txt pyproject.toml 2>/dev/null && echo "APScheduler: Yes"
```

### 2. Structure Analysis

**FastAPI structure:**

```bash
echo "=== FastAPI Structure ==="
[ -f "main.py" ] && echo "Entry: main.py"
[ -d "api/routers/setting" ] && echo "Routers: api/routers/setting/"
[ -d "api/crud" ] && echo "CRUD Helpers: api/crud/"
[ -d "api/services" ] && echo "Services: api/services/"
[ -d "api/schemas" ] && echo "Schemas: api/schemas/"
[ -d "db" ] && echo "Database: db/"
```

**Next.js structure:**

```bash
echo "=== Next.js Structure ==="
[ -d "app" ] && echo "App Router: app/"
[ -d "pages" ] && echo "Pages Router: pages/"
[ -d "components" ] && echo "Components: components/"
[ -d "lib" ] && echo "Lib: lib/"
[ -d "lib/types" ] && echo "Types: lib/types/api/"
```

### 3. Entity Inventory

**FastAPI entities:**

```bash
echo "=== Backend Entities ==="
# Models
grep -h "class.*Base\):" db/models.py 2>/dev/null | sed 's/class \([A-Za-z]*\)(Base):/\1/'

# For each entity, check completeness
for entity in $(grep -h "class.*Base\):" db/models.py 2>/dev/null | sed 's/class \([A-Za-z]*\)(Base):/\1/'); do
    lower=$(echo $entity | tr '[:upper:]' '[:lower:]')
    echo -n "$entity: "
    [ -f "api/schemas/${lower}_schema.py" ] && echo -n "Schema " || echo -n "- "
    [ -f "api/crud/${lower}.py" ] && echo -n "CRUD " || echo -n "- "
    [ -f "api/routers/setting/${lower}_router.py" ] && echo -n "Router" || echo -n "-"
    echo ""
done
```

**Next.js entities:**

```bash
echo "=== Frontend Entities ==="
ls -d app/\(pages\)/setting/*/ 2>/dev/null | xargs -I {} basename {}
```

### 4. Dependency Analysis

```bash
echo "=== Python Dependencies ==="
cat requirements.txt 2>/dev/null | head -20

echo "=== Node Dependencies ==="
cat package.json 2>/dev/null | jq '.dependencies' 2>/dev/null | head -20
```

### 5. Test Coverage

```bash
echo "=== Test Files ==="
find . -name "test_*.py" -o -name "*_test.py" | wc -l
find . -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" | wc -l
```

## Output Format

```markdown
## Codebase Analysis Report

**Generated:** {timestamp}
**Path:** {codebase_path}

### Project Overview

| Project | Type | Path | Status |
|---------|------|------|--------|
| Backend | FastAPI | `./` | Complete |
| Frontend | Next.js 15 | `./frontend` | Complete |
| Infrastructure | Docker | `./docker` | Partial |
| Workers | Celery | `./` | Complete |
| Scheduler | APScheduler | `./scheduler` | Not found |

### Backend Structure (FastAPI)

```
./
├── main.py                # Application entry
├── db/
│   ├── model.py           # SQLAlchemy models
│   └── setup_database.py  # Database connection
├── api/
│   ├── routers/setting/   # API routers
│   ├── crud/              # CRUD helper functions
│   ├── services/          # External integrations only
│   └── schemas/           # Pydantic DTOs
└── alembic/              # Migrations
```

### Frontend Structure (Next.js)

```
./frontend
├── app/
│   ├── (pages)/          # Page routes
│   │   └── setting/      # Settings section
│   └── api/              # API routes
├── components/           # Shared components
└── lib/                  # Utilities
    └── types/api/        # TypeScript types
```

### Entity Inventory

| Entity | Model | Schema | CRUD | Router | Frontend |
|--------|-------|--------|------|--------|----------|
| User | [x] | [x] | [x] | [x] | [x] |
| Product | [x] | [x] | [x] | [x] | [ ] |
| Category | [x] | [x] | [ ] | [ ] | [ ] |
| Order | [x] | [ ] | [ ] | [ ] | [ ] |

**Legend:** [x] = Exists, [ ] = Missing

### Incomplete Entities

1. **Product** - Missing frontend page
   - Action: `/generate data-table products`

2. **Category** - Missing CRUD helpers, router
   - Action: `/generate entity category` (will update existing model)

3. **Order** - Only model exists
   - Action: `/generate entity order`

### Dependencies Summary

**Python (Backend):**
- FastAPI 0.109.0
- SQLAlchemy 2.0.25
- Pydantic 2.5.3
- Celery 5.3.6
- Alembic 1.13.1

**Node (Frontend):**
- Next.js 15.0.0
- React 19.0.0
- TanStack Table 8.11.0
- SWR 2.2.4

### Code Statistics

| Metric | Backend | Frontend |
|--------|---------|----------|
| Files | 45 | 78 |
| Lines of Code | 5,200 | 8,400 |
| Test Files | 12 | 8 |
| Test Coverage | ~68% | ~45% |

### Health Assessment

| Area | Status | Notes |
|------|--------|-------|
| Structure | Good | Follows conventions |
| Completeness | Fair | 2 entities incomplete |
| Tests | Fair | Below 80% target |
| Documentation | Poor | Missing README updates |
| Security | Unknown | Run `/review security` |

### Recommendations

1. **Complete incomplete entities**
   ```bash
   /generate entity category
   /generate entity order
   /generate data-table products
   ```

2. **Increase test coverage**
   - Backend: Add tests for Order service
   - Frontend: Add tests for Product page

3. **Run security audit**
   ```bash
   /review security
   ```

4. **Update documentation**
   - Add API documentation
   - Update README with setup instructions
```
