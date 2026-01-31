# Fullstack Agents

Unified fullstack development plugin with **25 specialized AI agents** for intelligent code generation, review, analysis, scaffolding, debugging, and optimization.

## Features

- **Smart Code Generation** - Not static templates. Agents analyze existing code, ask clarifying questions, and generate context-aware code that matches your patterns.
- **Interactive Dialogue** - Agents detect your codebase patterns, ask about relationships and edge cases, confirm before generating, and suggest next steps.
- **Multi-Agent Orchestration** - Chain agents together for fullstack feature generation (backend + frontend + docker).
- **Pattern Detection** - Automatically detects your coding style, naming conventions, and architectural patterns.

## Supported Technologies

| Category | Technologies |
|----------|-------------|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic, Celery, APScheduler |
| Frontend | Next.js 15+, React, TanStack Table, SWR |
| Infrastructure | Docker, Docker Compose, Nginx, PostgreSQL, Redis |

## Agent Categories

### Review (4 agents)
- `code-quality` - Code quality review
- `security` - Security audit
- `performance` - Performance review
- `patterns-compliance` - Architecture pattern validation

### Generate (7 agents)
- `fastapi-entity` - FastAPI CRUD entity generation
- `nextjs-page` - Next.js page generation
- `nextjs-data-table` - Data table page generation
- `api-route` - Next.js API route generation
- `celery-task` - Celery task generation
- `scheduled-job` - APScheduler job generation
- `docker-service` - Docker service generation

### Analyze (4 agents)
- `codebase` - Full codebase analysis
- `architecture` - Architecture review
- `dependencies` - Dependency analysis
- `patterns` - Pattern detection

### Scaffold (5 agents)
- `project-fastapi` - FastAPI project scaffolding
- `project-nextjs` - Next.js project scaffolding
- `module-backend` - Backend module scaffolding
- `module-frontend` - Frontend module scaffolding
- `docker-infrastructure` - Docker infrastructure scaffolding

### Debug (4 agents)
- `error-diagnosis` - Error analysis
- `log-analysis` - Log pattern analysis
- `performance-profiling` - Performance bottleneck detection
- `api-debugging` - API request/response debugging

### Optimize (4 agents)
- `performance` - Performance optimization
- `code-cleanup` - Dead code removal
- `refactoring` - Code refactoring
- `query-optimization` - Database query optimization

## Commands

| Command | Description |
|---------|-------------|
| `/analyze [target]` | Analyze codebase, architecture, dependencies, or patterns |
| `/generate [type] [name]` | Generate entities, pages, components with dialogue |
| `/scaffold [type]` | Scaffold new projects or modules |
| `/review [type] [target]` | Review code quality, security, performance, patterns |
| `/debug [type]` | Debug errors, analyze logs, profile performance |
| `/optimize [type] [target]` | Optimize performance, cleanup, refactor, queries |
| `/validate [entity]` | Validate entity follows architecture patterns |
| `/status` | Show project detection status and available actions |

## Quick Start

### Generate a FastAPI Entity

```bash
/generate entity product
```

The agent will:
1. Detect your project structure and patterns
2. Ask about entity fields, relationships, and features
3. Show you a generation plan for confirmation
4. Generate model, schema, repository, service, and router
5. Suggest next steps (migrations, frontend page, tests)

### Generate Fullstack Feature

```bash
/generate fullstack order
```

Orchestrates multiple agents to create:
1. FastAPI backend (model, schema, repo, service, router)
2. Next.js API routes (proxy to backend)
3. Next.js data table page (with CRUD operations)

### Review Patterns

```bash
/review patterns product
```

Validates that your entity follows architecture patterns:
- Single-session-per-request flow
- Repository pattern compliance
- Schema inheritance
- SSR + SWR hybrid pattern

## Agent Lifecycle

All agents follow this lifecycle:

```
1. DETECTION      -> Detect project type, existing patterns, new vs existing
2. DIALOGUE       -> Ask clarifying questions based on detection
3. ANALYSIS       -> Analyze existing code to match style
4. CONFIRMATION   -> Present plan, get user approval
5. EXECUTION      -> Generate/modify code
6. NEXT STEPS     -> Suggest related actions, offer to continue
```

## Installation

Add the plugin to your Claude Code configuration:

```bash
cd your-project
claude plugin add fullstack-agents
```

## License

MIT
