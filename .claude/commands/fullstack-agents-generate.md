---
description: Generate code with intelligent pattern detection and interactive dialogue
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Generate Command

Generate code using intelligent agents with pattern detection and interactive dialogue.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/generate [type] [name]`

## Execution Flow

1. **Parse arguments**: Extract `type` and optional `name` from `$ARGUMENTS`
2. **Load appropriate skill**:
   - `entity` → `/skill generate-entity`
   - `page` → `/skill nextjs-patterns`
   - `data-table` → `/skill data-table-patterns` then `/skill nextjs-patterns`
   - `api-route` → `/skill fetch-architecture`
   - `task` → `/skill celery-patterns`
   - `job` → `/skill tasks-management`
   - `docker-service` → `/skill docker-patterns`
   - `fullstack` → `/skill generate-entity` then `/skill data-table-patterns`
3. **Execute generation** with the loaded skill context

## Types & Skills

| Type | Skill to Load | Description |
|------|---------------|-------------|
| `entity` | `generate-entity` | FastAPI entity (model, schema, repository, service, router) |
| `page` | `nextjs-patterns` | Next.js page with SSR and server actions |
| `data-table` | `data-table-patterns` + `nextjs-patterns` | Next.js data table page with full CRUD |
| `api-route` | `fetch-architecture` | Next.js API routes proxying to backend |
| `task` | `celery-patterns` | Celery background task |
| `job` | `tasks-management` | APScheduler scheduled job |
| `docker-service` | `docker-patterns` | Docker service in docker-compose |
| `fullstack` | `generate-entity` + `data-table-patterns` | Complete fullstack feature (backend + frontend) |

## Examples

```bash
# Generate FastAPI entity
/generate entity product

# Generate Next.js data table page
/generate data-table products

# Generate complete fullstack feature
/generate fullstack order
```

## Interactive Process

After loading the appropriate skill, follow:
1. **Detection** - Detect project type and existing patterns
2. **Dialogue** - Ask clarifying questions about fields, relationships, features
3. **Confirmation** - Show generation plan before creating files
4. **Generation** - Create files following detected patterns
5. **Next Steps** - Suggest related actions

## Smart Features

- **Pattern Detection** - Analyzes existing code to match your style
- **Relationship Handling** - Asks about foreign keys and relationships
- **Edge Cases** - Considers soft delete, audit fields, bilingual support
- **Orchestration** - Chain multiple agents for fullstack generation

## Default Behavior

If no type specified, show interactive menu:

```bash
/generate

# Shows:
# 1. FastAPI Entity
# 2. Next.js Page
# 3. Data Table Page
# 4. API Route
# 5. Celery Task
# 6. Scheduled Job
# 7. Docker Service
# 8. Fullstack Feature
```

**Now use the `/question` tool to ask user which type to generate.**
