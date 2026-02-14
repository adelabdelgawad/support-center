# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **TOP-LEVEL DIRECTIVE**: This project includes the `fullstack-agents` plugin at `.claude/.claude-plugins/fullstack-agents/`. You MUST use this plugin for ALL code generation, debugging, analysis, and pattern validation. It contains the exact architecture patterns, component libraries, and reference implementations for this codebase. **Never write backend or frontend code without consulting the plugin first.** See the "fullstack-agents Plugin" section below for full details.

## Documentation Policy
**DO NOT** create summary files, documentation, or .md files after tasks unless explicitly requested. This includes SUMMARY.md, CHANGES.md, verification scripts, etc.

## Page Hierarchy Synchronization (CRITICAL)

**After each page add or remove, you MUST update the seed pages function.**

The database seed function in `/src/backend/db/setup_database.py` must stay synchronized with the actual UI pages structure. When you:

- Add a new page to the IT portal (`/src/it-app/app/(it-pages)/`)
- Remove a page from the IT portal
- Change the page hierarchy or parent-child relationships
- Modify page paths or navigation structure

You **MUST immediately update** the `seed_pages()` function in `setup_database.py` to match. Failure to do this causes:

- Navigation menu not showing new pages
- 404 errors when accessing valid pages
- Permission system not recognizing valid routes
- New users unable to access legitimate pages
- Broken parent-child page relationships

**This is a BLOCKING REQUIREMENT** - Do not consider page-related work complete without updating the seed function.

## Backend API Documentation (CRITICAL)

**ALL backend endpoints MUST be documented in `/docs/backend-api-reference.md`**

This is the **canonical reference** for backend API endpoints. It serves as the single source of truth for frontend-backend integration.

### When You MUST Update This Document

Update `/docs/backend-api-reference.md` **immediately** when making changes to:

- Backend endpoints: adding, modifying, or removing any endpoint in `/src/backend/api/routers/`
- IT Portal API routes: creating or modifying routes under `/src/it-app/app/api/`
- Server actions: creating or modifying functions under `/src/it-app/lib/actions/`
- Request/response contracts: changing any Pydantic schema or TypeScript type

### What to Document

For each endpoint change, document:
1. HTTP method and full path
2. Purpose (1 line)
3. Request/response shapes (high-level)
4. Which page/feature uses it
5. Source file locations

### BLOCKING ISSUE

**DO NOT** merge PRs or consider tasks complete without updating `/docs/backend-api-reference.md`.

Missing documentation causes:
- Random 404 errors in production
- Frontend-backend contract mismatches
- Lost development time debugging integration issues
- Broken builds when endpoints change without notice

Treat this documentation with the same rigor as code changes. It is **not optional**.

## fullstack-agents Plugin — THE PRIMARY SOURCE OF TRUTH (CRITICAL)

**This project ships with the `fullstack-agents` plugin at `.claude/.claude-plugins/fullstack-agents/`. This plugin is NOT optional — it is the authoritative reference for ALL architecture decisions, code generation, and pattern compliance in this project.**

### MANDATORY: Use the Plugin BEFORE Writing Any Code

**You MUST consult the fullstack-agents plugin BEFORE writing or modifying code in the following situations. This is a BLOCKING REQUIREMENT — do not skip it.**

| Task | Required Plugin Action |
|------|----------------------|
| **Create a new backend entity** (router, repository, service, schema) | `/fullstack-agents:generate` — generates code following exact project patterns |
| **Create a new data table page** | `/fullstack-agents:data-table` — generates all table components using the reusable `@/components/data-table` library |
| **Create a new frontend page** | `/fullstack-agents:generate` — follows SSR + simplified state pattern |
| **Debug any error** | `/fullstack-agents:debug` — diagnoses with full-stack context |
| **Fix UI not updating after mutation** | `/fullstack-agents:debug` — knows the exact useState + server response pattern |
| **Add/modify API endpoints** | `/fullstack-agents:generate` — ensures Router → Service → Repository pattern |
| **Understand how something works** | `/fullstack-agents:analyze` — analyzes architecture, patterns, dependencies |
| **Review code before completion** | `/fullstack-agents:review patterns <path>` — validates pattern compliance |
| **Scaffold a new module** | `/fullstack-agents:scaffold` — generates complete module structure |
| **Optimize existing code** | `/fullstack-agents:optimize` — performance, cleanup, refactoring |

### What the Plugin Knows

The plugin contains **9 skill domains** with detailed reference patterns that match the ACTUAL codebase:

| Skill | Location | What It Covers |
|-------|----------|----------------|
| **fastapi** | `skills/fastapi/` | Router → Service → Repository pattern, BaseRepository[T], schemas, model patterns, middleware, testing |
| **data-table** | `skills/data-table/` | Complete `@/components/data-table` component library (DataTable, DynamicTableBar, Pagination, filters, bulk actions, sort, search), page generation, column definitions, context pattern |
| **nextjs** | `skills/nextjs/` | SSR pages, data fetching strategy (Simple vs SWR), server actions, API routes, context pattern |
| **fetch-architecture** | `skills/fetch-architecture/` | Three-layer fetch system (server.ts, client.ts, api-route-helper.ts) |
| **celery** | `skills/celery/` | Background task definitions, configuration, scheduling |
| **docker** | `skills/docker/` | Docker Compose, Dockerfiles, nginx, environment configuration |
| **tasks-management** | `skills/tasks-management/` | APScheduler jobs, task patterns |
| **websocket** | `skills/websocket/` | WebSocket connection management, rooms, message protocols |
| **batch-error-resolution** | `skills/batch-error-resolution/` | Systematic resolution of multiple errors |

### Available Commands

```bash
# Code generation (USE THESE — they produce pattern-compliant code)
/fullstack-agents:generate         # Generate entity (backend or frontend) with pattern detection
/fullstack-agents:data-table       # Generate complete data table page with all components
/fullstack-agents:scaffold         # Scaffold entire project or module

# Debugging & analysis
/fullstack-agents:debug            # Debug errors, logs, performance with full-stack context
/fullstack-agents:analyze          # Analyze architecture, patterns, dependencies, codebase

# Code review & validation (USE AFTER every implementation)
/fullstack-agents:review patterns <path>    # Validate code follows project patterns
/fullstack-agents:review quality <path>     # Code quality review
/fullstack-agents:review security <path>    # Security audit
/fullstack-agents:review performance <path> # Performance review
/fullstack-agents:validate                  # Validate entity follows architecture patterns

# Optimization
/fullstack-agents:optimize         # Code cleanup, refactoring, query optimization, performance

# Status
/fullstack-agents:status           # Show project detection status
```

### Why This is NON-NEGOTIABLE

The plugin encodes the **exact patterns used in this codebase**, including:

1. **Backend**: Router → Service → Repository flow (not direct queries in routers)
2. **Frontend**: Simplified `useState` pattern for ALL data tables (no SWR)
3. **Data tables**: Full composition using `DataTable`, `DynamicTableBar`, `StatusBadgeFilter`, `SearchInput`, `Pagination`, bulk actions from `@/components/data-table`
4. **Schemas**: `CamelModel` base, `Field()` only for validation constraints
5. **Fetch layers**: `serverGet`/`serverPost` for SSR, `api.get`/`api.put` for client mutations
6. **State updates**: Server response → `updateItems()` → `setData()` (never optimistic)

**Without the plugin, you will:**
- ❌ Write direct queries in routers (wrong — should use Service)
- ❌ Use SWR for data tables (wrong — should use simplified pattern)
- ❌ Build table UI from scratch (wrong — should use `@/components/data-table` library)
- ❌ Use `Field()` everywhere in schemas (wrong — plain annotations preferred)
- ❌ Miss the `updateItems()` pattern and break UI updates after mutations
- ❌ Forget to compose toolbars with `DynamicTableBar` + controls

### Required Workflow for ALL Code Changes

```
1. CONSULT PLUGIN → Get pattern guidance for the task
2. GENERATE/IMPLEMENT → Follow plugin output exactly
3. VALIDATE → /fullstack-agents:review patterns <path>
4. VERIFY → npx tsc --noEmit && npm run lint (frontend) / uv run mypy . (backend)
```

**DO NOT manually explore the codebase to figure out patterns. The plugin already knows them. Use it.**

## Project Overview
Support Center — Full-Stack IT Service Management Platform:
- **IT Portal**: Next.js 15 (App Router, TypeScript, React 19, SSR) - web-based agent/admin interface
- **Requester App**: Tauri + SolidJS - Windows desktop app for employees
- **SignalR Service**: .NET Core - real-time messaging hub
- **Backend**: FastAPI (Python 3.13+, async) - unified API layer
- **Database**: PostgreSQL with SQLModel/SQLAlchemy (async)
- **Real-time**: Redis Streams + SignalR for chat and notifications
- **Task Queue**: Celery with Redis (optional), APScheduler (built-in)
- **Integration**: Active Directory/LDAP authentication, MinIO (file storage)

## Project Structure
```
support-center/
├── src/
│   ├── backend/                        # FastAPI backend
│   │   ├── api/
│   │   │   ├── routers/                # API routers (renamed from endpoints)
│   │   │   │   ├── auth/               # Authentication routers (login_router.py, etc.)
│   │   │   │   ├── internal/           # Internal routers (internal_router.py, events_router.py)
│   │   │   │   ├── management/         # Management routers
│   │   │   │   │   ├── desktop_sessions_router.py  # Remote desktop session management
│   │   │   │   │   ├── remote_access_router.py     # Remote access controls
│   │   │   │   │   ├── scheduler_router.py        # Scheduled jobs
│   │   │   │   │   └── system_events_router.py    # System event logging
│   │   │   │   ├── reporting/          # Reporting routers
│   │   │   │   │   ├── reports_router.py         # Report generation
│   │   │   │   │   └── report_configs_router.py  # Report configurations
│   │   │   │   ├── setting/            # Settings routers
│   │   │   │   │   ├── users_router.py, roles_router.py, pages_router.py
│   │   │   │   │   ├── business_units_router.py, business_unit_regions_router.py
│   │   │   │   │   ├── active_directory_config_router.py, domain_users_router.py
│   │   │   │   │   ├── email_config_router.py, organizational_units_router.py
│   │   │   │   │   ├── priorities_router.py, request_types_router.py, request_status_router.py
│   │   │   │   │   ├── sections_router.py, categories_router.py, sla_configs_router.py
│   │   │   │   │   ├── system_messages_router.py, user_custom_views_router.py
│   │   │   │   │   └── ...
│   │   │   │   └── support/            # Support request routers
│   │   │   │       ├── requests_router.py        # Service request CRUD
│   │   │   │       ├── chat_router.py            # Real-time chat
│   │   │   │       ├── chat_files_router.py      # Chat file attachments
│   │   │   │       ├── screenshots_router.py     # Screenshot management
│   │   │   │       ├── files_router.py          # File attachments
│   │   │   │       ├── notifications_router.py   # User notifications
│   │   │   │       ├── request_notes_router.py   # Internal notes
│   │   │   │       └── search_router.py          # Request search
│   │   │   ├── schemas/                # Pydantic request/response schemas (_base.py has CamelModel)
│   │   │   │   ├── user.py, role.py, page.py, token.py, login.py
│   │   │   │   ├── business_unit.py, organizational_unit.py, domain_user.py
│   │   │   │   ├── service_request.py, chat_message.py, screenshot.py
│   │   │   │   ├── desktop_session.py, remote_access.py
│   │   │   │   ├── priority.py, request_status.py, request_type.py
│   │   │   │   ├── category.py, section.py, sla_config.py
│   │   │   │   └── dashboard.py, reports.py, scheduler.py
│   │   │   ├── services/               # ⭐ Business logic (organized by domain)
│   │   │   │   ├── setting/            # Settings services (user_service.py, role_service.py, etc.)
│   │   │   │   ├── support/            # Support services (request_service.py, chat_service.py, etc.)
│   │   │   │   ├── management/          # Management services (desktop_session_service.py, remote_access_service.py, etc.)
│   │   │   │   ├── auth_service.py     # Authentication service
│   │   │   │   ├── file_service.py     # File handling service
│   │   │   │   ├── notification_service.py  # Notification service
│   │   │   │   ├── reporting_service.py    # Reporting service
│   │   │   │   ├── event_publisher.py      # Event publishing
│   │   │   │   ├── minio_service.py        # MinIO integration
│   │   │   │   ├── signalr_client.py       # SignalR client
│   │   │   │   ├── whatsapp_sender.py     # WhatsApp integration
│   │   │   │   └── presence_service.py     # User presence
│   │   │   └── repositories/           # ⭐ Class-based data access (BaseRepository[T]) - THE ONLY data access pattern
│   │   │       ├── __init__.py          # Re-exports all repositories
│   │   │       ├── base_repository.py   # Generic base repository class
│   │   │       ├── auth/               # Auth repositories (user, token, refresh_token)
│   │   │       ├── management/         # Management repositories (desktop_session, remote_access)
│   │   │       ├── reporting/          # Reporting repositories (report_config)
│   │   │       ├── setting/            # Setting repositories (user, role, page, business_unit, sla_config, etc.)
│   │   │       ├── support/            # Support repositories (request, chat, screenshot, notification, etc.)
│   │   │       └── web_session_repository.py
│   │   ├── core/                       # Config, dependencies, rate limiting, scheduler
│   │   │   ├── app_setup/              # Application initialization & router registration
│   │   │   │   └── routers_group/      # Router grouping definitions
│   │   │   ├── config.py               # Application configuration
│   │   │   ├── deps.py                 # Dependency injection
│   │   │   ├── sanitizer.py            # Input sanitization
│   │   │   └── utils/                  # Core utilities (encryption)
│   │   ├── db/                         # Database setup, seeds, models
│   │   │   ├── model.py                # SQLModel ORM models
│   │   │   └── setup_database.py       # Database initialization & seeding
│   │   ├── alembic/                    # Database migrations
│   │   ├── tasks/                      # Background tasks (Celery, APScheduler)
│   │   ├── tests/                      # Test suite (pytest)
│   │   ├── celery_app.py               # Celery configuration
│   │   ├── main.py                     # FastAPI entrypoint
│   │   └── factories.py                # Test data factories
│   ├── it-app/                         # Next.js 15 IT portal (web-based agent interface)
│   │   ├── app/
│   │   │   ├── (it-pages)/             # IT portal pages (agent/admin interface)
│   │   │   │   ├── dashboard/          # Main dashboard
│   │   │   │   ├── requests/           # Support request management
│   │   │   │   ├── chat/               # Real-time chat interface
│   │   │   │   ├── management/         # Management module
│   │   │   │   │   ├── desktop-sessions/  # Remote desktop sessions
│   │   │   │   │   └── remote-access/  # Remote access controls
│   │   │   │   ├── reporting/          # Reports and analytics
│   │   │   │   └── settings/           # Settings pages
│   │   │   │       ├── users/          # User management (context/, actions/, filters/, modal/, table/)
│   │   │   │       ├── roles/          # Role management (context/, actions/, filters/, modal/, table/)
│   │   │   │       ├── business-units/ # Business unit configuration
│   │   │   │       ├── request-types/  # Request type configuration
│   │   │   │       ├── categories/     # Category management
│   │   │   │       ├── priorities/     # Priority levels
│   │   │   │       ├── sla-configs/    # SLA configurations
│   │   │   │       ├── active-directory/  # AD configuration (modal/, ou-tree/)
│   │   │   │       ├── domain-users/   # Domain user sync (context/, actions/, table/)
│   │   │   │       └── email-config/   # Email settings (modal/)
│   │   │   ├── api/                    # Frontend API routes (proxy to FastAPI backend)
│   │   │   │   ├── auth/               # Authentication endpoints (login, logout, refresh)
│   │   │   │   ├── support/            # Support request APIs
│   │   │   │   ├── management/         # Management APIs (sessions, remote-access)
│   │   │   │   ├── reporting/          # Reporting APIs
│   │   │   │   └── setting/            # Settings APIs (users, roles, business-units, etc.)
│   │   │   ├── login/                  # Login page
│   │   │   └── remote-session/         # Remote session handler
│   │   ├── lib/                        # Utilities, server actions, types
│   │   │   ├── fetch/                  # ⭐ API helpers (server.ts, client.ts, api-route-helper.ts)
│   │   │   ├── actions/                # Server actions
│   │   │   │   └── *.actions.ts        # All actions (users, requests, settings, etc.)
│   │   │   ├── auth/                   # Auth utilities (auth-context, csrf-manager, token-refresh)
│   │   │   ├── types/                  # TypeScript types
│   │   │   │   ├── api/                # API response types (requests, users, etc.)
│   │   │   │   ├── config/             # Config types (i18n, profile, email)
│   │   │   │   ├── components/         # Component prop types (data-table)
│   │   │   │   └── common/             # Common types
│   │   │   ├── utils/                  # Utility functions (api-errors, format, url-params)
│   │   │   ├── validation/             # Zod validation schemas (requests, users, settings)
│   │   │   └── constants/              # Constants
│   │   ├── components/                 # Reusable React components
│   │   │   ├── data-table/             # ⭐ Reusable data table library (table/, controls/, filters/, ui/)
│   │   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── chat/                   # Chat components
│   │   │   ├── requests/               # Request management components
│   │   │   ├── navbar/                 # Navigation bar
│   │   │   ├── sidebar/                # Sidebar navigation
│   │   │   └── providers/              # Context & provider components
│   │   ├── hooks/                      # React hooks (use-confirmation-dialog, use-language, use-theme)
│   │   └── locales/                    # i18n translations (en, ar)
│   ├── requester-app/                  # Tauri desktop app (Windows requester interface)
│   │   ├── src/                        # SolidJS application
│   │   ├── src-tauri/                  # Tauri Rust backend
│   │   └── package.json                # npm dependencies
│   ├── signalr-service/                # .NET Core SignalR hub
│   │   ├── Hubs/                       # SignalR hub implementations
│   │   ├── Services/                   # Real-time services
│   │   └── Program.cs                  # Service entrypoint
├── docker/                             # Docker & deployment configs
│   ├── backend/                        # Backend Dockerfile
│   ├── frontend/                       # Frontend Dockerfile
│   ├── nginx/                          # Nginx proxy config
│   ├── monitoring/                     # Monitoring setup
│   ├── env/                            # Environment variable templates
│   ├── scripts/                        # Deployment scripts
│   └── syslog-service/                 # Syslog configuration
├── docs/                               # Project documentation (backend-api-reference.md, etc.)
├── specs/                              # Feature specifications
├── docker-compose.yml                  # Local dev (PostgreSQL, Redis, Elasticsearch, Celery)
├── docker-compose.prod.yml             # Production Docker Compose
└── CLAUDE.md
```

## Commands

### Backend (run from `/src/backend/`)
```bash
# Development server
uv run fastapi dev main.py

# Type checking & linting
uv run mypy .
uv run ruff check .

# Testing
uv run pytest tests/ -v

# Database migrations
python -m alembic revision --autogenerate -m "description"
python -m alembic upgrade head
python -m alembic downgrade -1

# Celery (if using)
uv run celery -A celery_app worker -l INFO -E
uv run celery -A celery_app beat --loglevel=info
```

### IT Portal Frontend (run from `/src/it-app/`)
```bash
npm run dev          # Development server (Turbopack)
npx tsc --noEmit     # Type checking
npm run lint         # Linting
npm run build        # Production build
```

### Requester Desktop App (run from `/src/requester-app/`)
```bash
npm install          # Install dependencies
npm run tauri dev    # Development mode
npm run tauri build  # Production build
```

### Docker (run from repository root)
```bash
docker-compose up -d                    # Start services (PostgreSQL:5432, Redis:6379)
docker-compose logs -f [service-name]   # View logs
```

## Architecture

### Backend Layers

```
Primary Pattern (ALL endpoints):
Router → Service → Repository → Model
  ↓         ↓          ↓            ↓
Pydantic  Business   Class-based  SQLModel
schemas   logic      data access    ORM
```

**ALL endpoints delegate to a Service class.** The Service uses Repositories for data access:

**Support endpoints** (`api/routers/support/`):
- `requests_router.py` → `RequestService` → Request repositories
- `chat_router.py` → `ChatService` → Chat repositories
- `screenshots_router.py` → `ScreenshotService` → Screenshot repositories
- `files_router.py` → `FileService` → File repositories
- `notifications_router.py` → `NotificationService` → Notification repositories
- `chat_files_router.py` → `ChatFileService` → ChatFile repositories

**Management endpoints** (`api/routers/management/`):
- `desktop_sessions_router.py` → `DesktopSessionService` → DesktopSession repositories
- `remote_access_router.py` → `RemoteAccessService` → RemoteAccess repositories
- `scheduler_router.py` → `SchedulerService` → Scheduler repositories
- `system_events_router.py` → `SystemEventService` → SystemEvent repositories

**Setting endpoints** (`api/routers/setting/`):
- `users_router.py` → `UserService` → `UserRepository`
- `roles_router.py` → `RoleService` → `RoleRepository`
- `business_units_router.py` → `BusinessUnitService` → `BusinessUnitRepository`
- `priorities_router.py` → `PriorityService` → Priority repositories
- `request_types_router.py` → `RequestTypeService` → RequestType repositories
- `request_status_router.py` → `RequestStatusService` → RequestStatus repositories
- `categories_router.py` → `CategoryService` → Category repositories
- `sections_router.py` → `SectionService` → Section repositories
- `sla_configs_router.py` → `SLAConfigService` → SLAConfig repositories
- `active_directory_config_router.py` → `ActiveDirectoryConfigService` → AD repositories
- `domain_users_router.py` → `DomainUserService` → DomainUser repositories
- `organizational_units_router.py` → `OrganizationalUnitService` → OU repositories

**Reporting endpoints** (`api/routers/reporting/`):
- `reports_router.py` → `ReportingService` → Report repositories
- `report_configs_router.py` → `ReportConfigService` → ReportConfig repositories

**Architecture Components:**
- **Routers** (`api/routers/`): API endpoints + Pydantic validation, delegate to Services (organized by domain: auth/, setting/, support/, management/, reporting/, internal/)
- **Services** (`api/services/`): Business logic, orchestration, audit logging, transaction management (organized by domain: setting/, support/, management/, + root-level services)
- **Repositories** (`api/repositories/`): Class-based data access inheriting `BaseRepository[T]` - organized by domain (auth/, management/, reporting/, setting/, support/)
- **Schemas** (`api/schemas/`): Pydantic DTOs with `CamelModel` base, never expose models directly

**CRITICAL**: This project uses class-based Repositories (`api/repositories/`). There are NO function-based CRUD helpers. All data access goes through Repository classes that inherit from `BaseRepository[T]`.

### API Field Naming Convention (CRITICAL)
**Backend uses `CamelModel` (from `api/schemas/_base.py`) for ALL Pydantic schemas.**

This means:
- Backend schema fields are defined in `snake_case` (e.g., `first_name`, `job_title`)
- API responses are automatically converted to `camelCase` (e.g., `firstName`, `jobTitle`)
- Frontend TypeScript must expect `camelCase` field names from API responses

**Common mistake**: Frontend code expecting `snake_case` (e.g., `data.first_name`) when the API returns `camelCase` (e.g., `data.firstName`).

Always check `CamelModel` usage when debugging "data not showing" issues.

### Pydantic Response Schema Pattern (CRITICAL)

**ALL backend endpoints MUST return typed Pydantic schemas, NEVER plain dicts.**

#### Rules

1. **Always use Pydantic schemas** inheriting from `CamelModel` for all API responses
2. **Define fields in snake_case** - CamelModel automatically converts to camelCase in the API response
3. **Avoid `Field()` unless you need explicit validation constraints** (min_length, max_length, ge, le, pattern). Plain type annotations are preferred.
4. **Set response_model** on the endpoint decorator
5. **Return schema instances**, not plain dicts

#### ✅ CORRECT Pattern (Typical Schema — No Field())

```python
from api.schemas._base import CamelModel

class UserResponse(CamelModel):
    id: int
    first_name: str
    last_name: str
    email: str
    is_active: bool = True
    created_at: datetime | None = None

class UserCreateRequest(CamelModel):
    username: str
    email: str
    password: str
    is_active: bool = True
```

#### ✅ CORRECT Pattern (Field() for explicit validation constraints)

```python
from pydantic import Field
from api.schemas._base import CamelModel

class UserCreateRequest(CamelModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8)
```

#### ❌ WRONG Pattern (Plain Dict)

```python
# DON'T DO THIS
@router.get("/users/{user_id}")
async def get_user(user_id: int, session: SessionDep):
    user = await session.get(User, user_id)
    return {
        "id": user.id,
        "firstName": user.first_name,  # ❌ Manual camelCase conversion
    }
```

#### Why This Matters

1. **Type safety** - Frontend contract is enforced
2. **Automatic camelCase conversion** - No manual field name conversion
3. **OpenAPI documentation** - Auto-generated API docs
4. **Consistency** - All endpoints follow the same pattern

### Frontend Data Flow
```
Server Component (SSR) → Client Component → Server Actions → Backend API
```
- Server components by default, client components only for interactivity
- Simplified pattern (`useState` + server response) for all current data tables
- Native fetch client in `lib/fetch/client.ts` with auth interceptors

### Frontend Fetch System

Three layers for different contexts:

| Layer | File | Used In | Example |
|-------|------|---------|---------|
| **Server actions** | `lib/fetch/server.ts` | `lib/actions/*.actions.ts` | `serverGet('/setting/users/')` |
| **Client fetch** | `lib/fetch/client.ts` | Client components | `api.put('/setting/users/1', body)` |
| **API route helper** | `lib/fetch/api-route-helper.ts` | `app/api/` routes | `withAuth(token => backendGet(...))` |

**Server actions** (`lib/actions/`) call the backend directly using `serverGet`/`serverPost`/`serverPut` from `lib/fetch/server.ts`. These are `"use server"` functions used by server components for SSR data fetching.

**Client fetch** (`lib/fetch/client.ts`) provides an `api` object with `get`/`post`/`put`/`delete` methods for client-side mutations.

**API routes** (`app/api/auth/`, `app/api/support/`, `app/api/management/`, `app/api/setting/`) use `withAuth()` from `api-route-helper.ts` to proxy requests to the backend with authentication.

### SWR Mutation Pattern (REFERENCE ONLY — not currently used in codebase)

**This section is kept as reference for when SWR is needed in the future. All current data tables use the Simplified Pattern below.**

**If you use SWR, all mutations MUST follow the direct-pass pattern, NOT the callback pattern.**

#### ✅ CORRECT Pattern (Direct Pass)

```typescript
// 1. Access data from component scope
const { data, mutate } = useSWR<DataType>(url, fetcher);

// 2. Pass data to action hooks
const actions = useActions({ data, mutate });

// 3. In action handler
const handleUpdate = useCallback(
  async (id: number) => {
    const result = await updateItem(id);

    if (result.success && result.data) {
      const currentData = data;  // From component scope
      if (!currentData) return result;

      // Build new data structure
      const updatedData = {
        ...currentData,
        data: currentData.data.map(item =>
          item.id === id ? { ...item, ...result.data } : item
        ),
      };

      // Pass directly to mutate (NOT as function)
      await mutate(updatedData, { revalidate: false });
    }
    return result;
  },
  [data, mutate]  // Include data in dependencies
);
```

#### ❌ WRONG Pattern (Callback)

```typescript
// DON'T DO THIS - causes UI not to update
mutate(
  (currentData) => {  // ❌ Accessing data from callback parameter
    if (!currentData) return undefined;
    return {
      ...currentData,
      data: currentData.data.map(...)
    };
  },
  { revalidate: false }
);
```

#### Key Differences

| Aspect | Correct (Direct Pass) | Wrong (Callback) |
|--------|----------------------|------------------|
| Data access | From component scope | From callback parameter |
| Mutate argument | New data object | Function returning data |
| Dependencies | `[data, mutate]` | `[mutate]` only |
| UI updates | ✅ Works reliably | ❌ May not trigger re-render |

#### Why This Matters

The callback pattern doesn't reliably trigger React re-renders because:
1. SWR may not detect the state change
2. Component closure doesn't capture updated data
3. React's reconciliation may skip the update

The direct-pass pattern guarantees updates by:
1. Using fresh data from component scope
2. Passing a new object reference to mutate
3. Forcing React to detect the change

#### Reference Implementation

See `src/it-app/app/(it-pages)/settings/users/_components/table/users-table.tsx` for the canonical example of this pattern (if it exists in your project).

### Simplified Pattern (Default — Used by ALL Current Tables)

**This is the pattern used by all data tables in the codebase. Use this unless you have a specific need for SWR (see SWR section above for reference).**

This pattern is appropriate when:
- Data changes only from explicit user actions (create, update, delete)
- No background revalidation is needed
- No automatic polling or real-time updates required
- Server component handles pagination/filtering via URL changes

#### ✅ Simplified Pattern (Mutation-Driven)

```typescript
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

interface TableProps {
  initialData: DataResponse;
}

function SimpleTable({ initialData }: TableProps) {
  const router = useRouter();

  // Local state synced with server-fetched initialData
  const [data, setData] = useState<DataResponse>(initialData);

  // Sync state when initialData changes (server re-fetch from URL change)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Manual refresh function (triggers server component re-render)
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Update helper - updates items with server response
  const updateItems = useCallback(async (serverResponse: Item[]) => {
    const currentData = data;
    if (!currentData) return;

    const responseMap = new Map(serverResponse.map((item) => [item.id, item]));
    const updatedList = currentData.items.map((item) =>
      responseMap.has(item.id) ? responseMap.get(item.id)! : item
    );

    // Update local state with server data
    setData({
      ...currentData,
      items: updatedList,
    });
  }, [data]);

  // Mutation handler example
  const handleUpdate = async (id: number, updates: Partial<Item>) => {
    const result = await updateItemAPI(id, updates);
    if (result.success && result.data) {
      // Update UI directly from backend response
      await updateItems([result.data]);
    }
    return result;
  };

  return (
    <div>
      {/* Table content */}
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  );
}
```

#### Key Differences from SWR Pattern

| Aspect | SWR Pattern | Simplified Pattern |
|--------|-------------|-------------------|
| Data fetching | Client-side via SWR | Server-side via Next.js |
| Revalidation | Automatic (configurable) | Manual only (`router.refresh()`) |
| State management | SWR cache | Simple `useState` |
| URL changes | SWR refetch | Server component re-run |
| Complexity | Higher (cache config) | Lower (standard React) |
| Use case | Real-time data, polling | Static data, mutation-only |

#### When to Use Each Pattern

**Use SWR Pattern when:**
- Need automatic revalidation (background refresh)
- Need real-time updates or polling
- Data can change from external sources
- Need deduplication across components
- Need request caching strategies

**Use Simplified Pattern when:**
- Data changes only from user mutations
- No automatic revalidation needed
- Server component handles filtering/pagination
- Want simpler, more maintainable code
- Want to reduce client-side complexity

#### Reference Implementations

- **Simplified Pattern**: See IT portal pages for reference implementations (users and roles tables use the same simplified pattern)

### Settings Data Table Page Guide (Reference: Users Page)

Use this section when creating any new settings page with a data table. The Users page (`setting/users/`) is the canonical reference.

#### File Structure

```
setting/<entity>/
├── page.tsx                              # Server component (SSR data fetch)
├── context/<entity>-actions-context.tsx   # Actions context provider
├── _components/
│   ├── table/
│   │   ├── <entity>-table.tsx            # Main client component (state + actions)
│   │   ├── <entity>-table-body.tsx       # DataTable rendering + selection
│   │   ├── <entity>-table-columns.tsx    # Column definitions
│   │   └── <entity>-table-controller.tsx # Toolbar (search, bulk actions)
│   ├── modal/
│   │   ├── add-<entity>-container.tsx    # Add sheet with form
│   │   ├── edit-<entity>-sheet.tsx       # Edit sheet
│   │   └── view-<entity>-sheet.tsx       # View sheet (read-only)
│   ├── actions/
│   │   ├── actions-menu.tsx              # Row action buttons (view/edit)
│   │   └── add-<entity>-button.tsx       # Add button with sheet trigger
│   └── filters/                          # Custom filter components
└── actions/                              # (if needed) action button components
```

#### SSR Data Flow

1. **`page.tsx`** (server component) receives `searchParams`
2. Computes `skip` and `limit` from URL params: `skip = (page - 1) * limit`
3. Calls server actions (e.g., `getEntities(limit, skip, filters)`) plus any lookup data (e.g., `getRoles()`)
4. Passes `initialData` + lookup data as props to the client table component

```typescript
// page.tsx pattern
export default async function EntityPage({ searchParams }: { searchParams: Promise<{...}> }) {
  const params = await searchParams;
  const pageNumber = Number(params.page) || 1;
  const limitNumber = Number(params.limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  const entities = await getEntities(limitNumber, skip, filters);
  const lookupData = await getLookupData();

  return <EntityTable initialData={entities} lookupData={lookupData} />;
}
```

#### Server Actions Pattern

Located in `lib/actions/<entity>.actions.ts`. Each function is a `"use server"` function that calls `serverGet`/`serverPost`/`serverPut` and returns a typed response directly (no wrapper). Errors are handled with `handleApiError`.

```typescript
"use server";
import { serverGet, serverPost, serverPut } from "@/lib/fetch/server";
import { handleApiError } from "@/lib/utils/api-errors";

export async function getEntities(limit: number, skip: number, filters?: {...}): Promise<EntityResponse> {
  try {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    // ...append filters
    return await serverGet(`/setting/entities/?${params.toString()}`) as EntityResponse;
  } catch (error: unknown) {
    handleApiError("fetch entities", error);
    throw error;
  }
}
```

#### Client-Side State & Mutations (Core Pattern)

The main table component (`<entity>-table.tsx`) follows this exact pattern:

1. **`useState(initialData)`** — local state initialized from SSR
2. **`useEffect` sync** — re-sync when `initialData` changes (URL param changes trigger server re-fetch)
3. **`updateEntities()` helper** — takes server response array, replaces matching items by ID, recalculates counts
4. **Action handlers** — call `api.put/post()`, then pass response to `updateEntities()`
5. **Context provider** — wraps children with actions so modals/rows can trigger mutations
6. **`router.refresh()`** — for full re-fetch on add or filter/pagination changes

```typescript
"use client";
function EntityTable({ initialData, lookupData }: EntityTableProps) {
  const router = useRouter();
  const [data, setData] = useState<EntityResponse | null>(initialData);

  // Sync on server re-fetch
  useEffect(() => { setData(initialData); }, [initialData]);

  // Update helper: replace items by ID from backend response
  const updateEntities = useCallback(async (serverResponse: Entity[]) => {
    const currentData = data;
    if (!currentData) return;
    const responseMap = new Map(serverResponse.map((e) => [e.id, e]));
    const updatedList = currentData.entities.map((item) =>
      responseMap.has(item.id) ? responseMap.get(item.id)! : item
    );
    setData({ ...currentData, entities: updatedList,
      activeCount: updatedList.filter((e) => e.isActive).length,
      inactiveCount: updatedList.filter((e) => !e.isActive).length,
    });
  }, [data]);

  // Action example: toggle status
  const actions = {
    onToggleStatus: async (id: string, isActive: boolean) => {
      const result = await api.put<Entity>(`/setting/entities/${id}/status`, { is_active: isActive });
      await updateEntities([result]);
      return { success: true, data: result };
    },
    onRefresh: () => { router.refresh(); },
  };

  return (
    <EntityActionsProvider actions={actions}>
      {/* StatusBadgeFilter, TableBody, Pagination */}
    </EntityActionsProvider>
  );
}
```

#### Actions Context Pattern

A simple React context that passes action functions to child components (modals, row actions):

```typescript
"use client";
import { createContext, useContext, ReactNode } from "react";

const EntityActionsContext = createContext<EntityActionsContextType | null>(null);

export function EntityActionsProvider({ children, actions }: { children: ReactNode; actions: EntityActionsContextType }) {
  return <EntityActionsContext.Provider value={actions}>{children}</EntityActionsContext.Provider>;
}

export function useEntityActions() {
  const context = useContext(EntityActionsContext);
  if (!context) throw new Error("useEntityActions must be used within EntityActionsProvider");
  return context;
}
```

#### Add / Edit / View Flows

| Flow | Trigger | Mutation | UI Update |
|------|---------|----------|-----------|
| **Add** | Sheet form → server action (`createEntity`) | `serverPost` | `router.refresh()` (new row appears via SSR re-fetch) |
| **Edit** | Sheet form → `api.put()` | Client-side `api.put` | `updateEntities([response])` (in-place update) |
| **View** | Sheet (read-only) | None | None |

**Why Add uses `router.refresh()`**: New entities affect pagination/counts/sort order — a full server re-fetch is correct. Edits only change existing rows, so in-place update is sufficient.

#### Backend Contract

The backend must return:

| Endpoint | Returns |
|----------|---------|
| `GET /setting/entities/` | `{ entities: T[], total, activeCount, inactiveCount }` |
| `POST /setting/entities/` | Full created `T` record |
| `PUT /setting/entities/{id}` | Full updated `T` record |
| `PUT /setting/entities/{id}/status` | Full updated `T` record |
| `PUT /setting/entities/status` (bulk) | `{ updatedEntities: T[] }` |

All mutation endpoints return the **complete record** (not partial), so the frontend can replace its local state directly.

#### New Settings Page Checklist

1. Create `setting/<entity>/page.tsx` — server component with SSR data fetch
2. Create server actions in `lib/actions/<entity>.actions.ts`
3. Create TypeScript types in `lib/types/api/<entity>.ts`
4. Create `context/<entity>-actions-context.tsx`
5. Create table components: `<entity>-table.tsx`, `-table-body.tsx`, `-table-columns.tsx`, `-table-controller.tsx`
6. Create modal components: add, edit, view sheets
7. Create backend repository, service, router, and schemas
8. Update `/docs/backend-api-reference.md` with all new endpoints
9. Verify: `npx tsc --noEmit && npm run lint && npm run build`

### Background Tasks
- **APScheduler**: In-process scheduled tasks (< 30 sec), auto-starts in `main.py` lifespan
- **Celery**: Heavy distributed tasks (> 30 sec), requires separate worker via docker-compose

### Backend Architectural Patterns (CRITICAL)

**This project uses Router → Service → Repository as the ONLY pattern.**

#### Repository Pattern (THE ONLY DATA ACCESS PATTERN)

**CRITICAL**: This project uses class-based Repositories inheriting from `BaseRepository[T]`. There are NO function-based CRUD helpers.

Repositories (`api/repositories/`) are classes that inherit from `BaseRepository[T]` and centralize all database queries.

**BaseRepository[T]** provides common operations for free:
```python
# api/repositories/base_repository.py
class BaseRepository(Generic[T]):
    model: Type[T]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, id: int | UUID) -> T | None: ...
    async def create(self, entity: T) -> T: ...       # flush + refresh, NO commit
    async def delete(self, entity: T) -> None: ...     # NO commit
    async def list_all(self, skip, limit) -> list[T]: ...
```

**Entity Repository pattern:**
```python
# api/repositories/setting/user_repository.py
class UserRepository(BaseRepository[User]):
    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_id(self, user_id: UUID, load_roles: bool = False) -> Optional[User]:
        stmt = select(User).where(User.id == user_id)
        if load_roles:
            stmt = stmt.options(selectinload(User.role_permissions).selectinload(UserRole.role))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def ensure_exists(self, user_id: UUID) -> User:
        user = await self.get_by_id(user_id)
        if not user:
            raise DetailedHTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User not found with ID: {user_id}")
        return user
```

**Transaction Control:**
- Repositories use `flush()` not `commit()` — caller (service) commits
- Document in docstring: "caller must commit" or "read-only"
- Import from: `from api.repositories import UserRepository`

#### Service Layer Pattern (Primary Pattern)

**ALL endpoints delegate to a Service class.** Services instantiate repositories in `__init__`:

```python
# api/services/setting/user_service.py
from api.repositories import UserRepository, RoleRepository

class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)

    async def get_users(self, skip: int, limit: int) -> SettingUsersResponse:
        count_stats = await self.user_repo.count()
        users = await self.user_repo.list_with_roles(skip=skip, limit=limit)
        return SettingUsersResponse(users=users, total=count_stats.total, ...)

    async def create_user(self, user_data: UserCreateRequest, current_user_id: UUID):
        new_user = await self.user_repo.create_user(username=user_data.username, ...)
        await self.session.commit()  # Service commits
        return new_user
```

Services handle:
- Business logic and validation
- Repository orchestration (multiple repos in one operation)
- Transaction management (commit/rollback)
- Audit logging via `AuditService`
- External integrations (AD/LDAP, Redis, email)

#### Router Pattern (Delegates to Service)

**ALL routers delegate to Service.** Service is instantiated per-handler with local import:

```python
# api/routers/setting/users_router.py
@router.get("/", response_model=SettingUsersResponse)
async def get_users(session: SessionDep, skip: int = 0, limit: int = 100):
    from api.services.setting.user_service import UserService
    service = UserService(session=session)
    return await service.get_users(skip, limit)
```

## Development Principles

### Type Safety (Strict)
- TypeScript: NO `any` types, use `unknown` with type guards
- Python: All functions must have type hints, Pydantic for all API boundaries
- Validation: Zod for frontend runtime validation

### API Mutations - Return Complete Data
After any Create/Update/Delete:
1. Backend returns the complete updated record (not partial)
2. Frontend updates local state directly (no full table refetch)
3. Show loading spinner on affected rows during operation

### UI Consistency
- Modern enterprise UI patterns
- Status colors: Active=green, Pending=yellow, Error/Inactive=red
- @tanstack/react-table for data tables
- shadcn/ui components with Tailwind CSS

### Code Changes
- Remove ALL orphaned code when changing/removing features
- Always create Alembic migrations after model changes
- Run verification after changes:
  ```bash
  # Frontend
  npx tsc --noEmit && npm run lint && npm run build
  # Backend
  uv run mypy . && uv run ruff check .
  ```

## Code Simplicity and Best Practices (CRITICAL)

**ALWAYS prioritize simple, maintainable, and performant code. Every line should justify its existence.**

### Core Principles

#### 1. Simplicity First
- **Write the minimum code needed** to solve the problem
- **Avoid premature abstractions** - Three instances of duplication is better than one wrong abstraction
- **Delete code aggressively** - Unused code is a liability, not an asset
- **Prefer explicit over clever** - Code is read 10x more than written
- **Question every dependency** - Each import adds weight and risk

#### 2. No Speculative Code
**Never write code "for future use" or "just in case":**
- ❌ Generic utility functions used once
- ❌ Configuration options with no current use case
- ❌ "Flexible" abstractions that obscure simple logic
- ❌ Framework-like patterns for application code
- ❌ Commented-out code "we might need later"

**Write code for today's requirements, refactor when tomorrow comes.**

#### 3. Performance by Default
- **Async everywhere** in Python - Never block the event loop
- **N+1 query prevention** - Use `selectinload()`/`joinedload()` for relationships
- **Pagination required** - No unbounded queries
- **Index-aware queries** - Filter on indexed columns first
- **Batch operations** - Use bulk updates/deletes when operating on multiple records
- **Connection pooling** - Reuse database connections (SQLAlchemy handles this)

#### 4. Type Safety Everywhere
```python
# ✅ GOOD - Explicit types
async def get_user(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)

# ❌ BAD - No types
async def get_user(session, user_id):
    return await session.get(User, user_id)
```

```typescript
// ✅ GOOD - Explicit types
async function getUser(id: number): Promise<User | null> {
  const response = await api.get<User>(`/users/${id}`);
  return response.data;
}

// ❌ BAD - Using any
async function getUser(id: any): Promise<any> {
  const response = await api.get(`/users/${id}`);
  return response.data;
}
```

#### 5. Architectural Discipline

**Backend - Use Service for most endpoints, direct queries only for simple entities:**
```python
# ✅ GOOD - Most endpoints delegate to Service
@router.get("/users/")
async def list_users(session: SessionDep, skip: int = 0, limit: int = 100):
    service = UserService(session)
    return await service.get_users(skip, limit)

# ✅ ALSO GOOD - Direct queries for simple entities (schedulers, OUs)
@router.get("/schedulers/")
async def list_schedulers(session: SessionDep, skip: int = 0, limit: int = 100):
    stmt = select(Scheduler).offset(skip).limit(limit)
    return (await session.scalars(stmt)).all()
```

**Frontend - Colocate related code:**
```typescript
// ✅ GOOD - Actions with component
const MyTable = () => {
  const handleUpdate = async (id: number) => {
    // Action logic here
  };
  return <DataTable onUpdate={handleUpdate} />;
};

// ❌ BAD - Scattered across files
// actions/my-actions.ts
// hooks/use-my-actions.ts
// utils/my-utils.ts
// components/MyTable.tsx
```

#### 6. Query Optimization Patterns

**Always use selectinload/joinedload for relationships:**
```python
# ✅ GOOD - Eager load to avoid N+1
stmt = select(User).options(selectinload(User.roles)).where(User.is_active == True)
users = await session.scalars(stmt)

# ❌ BAD - N+1 queries (one query per user for roles)
stmt = select(User).where(User.is_active == True)
users = await session.scalars(stmt)
for user in users:
    roles = user.roles  # Lazy load triggers new query!
```

**Use exists() for existence checks:**
```python
# ✅ GOOD - Efficient existence check
stmt = select(exists().where(User.email == email))
exists = await session.scalar(stmt)

# ❌ BAD - Fetches full record
user = await session.scalar(select(User).where(User.email == email))
exists = user is not None
```

**Use count() efficiently:**
```python
# ✅ GOOD - Count only
count = await session.scalar(select(func.count()).select_from(User))

# ❌ BAD - Fetches all records then counts
users = await session.scalars(select(User))
count = len(users.all())
```

#### 7. Error Handling - Fail Fast
```python
# ✅ GOOD - Validate early, fail fast
@router.post("/users/")
async def create_user(session: SessionDep, user_in: UserCreate):
    # Pydantic validates automatically
    if await email_exists(session, user_in.email):
        raise HTTPException(409, "Email already exists")

    user = User(**user_in.model_dump())
    session.add(user)
    await session.commit()
    return user

# ❌ BAD - Try/except for flow control
@router.post("/users/")
async def create_user(session: SessionDep, user_in: dict):
    try:
        # Validate manually
        if not user_in.get("email"):
            raise ValueError("Email required")
        # ... more validation ...
        user = User(**user_in)
        session.add(user)
        await session.commit()
        return user
    except Exception as e:
        raise HTTPException(500, str(e))
```

#### 8. Frontend Data Flow - Backend-First Always

**ALWAYS wait for backend response before updating UI. No optimistic updates.**

```typescript
// ✅ GOOD - Wait for backend, then update
const handleUpdate = async (id: number, updates: Partial<User>) => {
  setLoading(id, true);  // Show loading state

  const result = await updateUser(id, updates);

  if (result.success && result.data) {
    // Update UI with server response
    setData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === id ? result.data! : item
      )
    }));
    toast.success("Updated successfully");
  } else {
    toast.error(result.message);
  }

  setLoading(id, false);
};

// ❌ BAD - Optimistic update
const handleUpdate = async (id: number, updates: Partial<User>) => {
  // DON'T update UI before backend responds
  setData(prev => ({
    ...prev,
    items: prev.items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    )
  }));

  await updateUser(id, updates);  // Backend might fail!
};
```

**Why Backend-First?**
1. **UI reflects reality** - What user sees = what's in database
2. **No rollbacks needed** - Backend validates before UI updates
3. **Simpler error handling** - Just show error, no state cleanup
4. **Consistent behavior** - All mutations work the same way
5. **Easier debugging** - UI issues = backend issues

**Every mutation must have:**
- ✅ Loading state (spinner, disabled button, skeleton)
- ✅ Backend call and wait for response
- ✅ Update UI only with server data
- ✅ Show success/error feedback

**Backend must return complete data:**
```python
# ✅ GOOD - Return full updated record
@router.put("/users/{user_id}")
async def update_user(
    session: SessionDep,
    user_id: int,
    user_in: UserUpdate
) -> UserPublic:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    user.sqlmodel_update(user_in)
    await session.commit()
    await session.refresh(user)

    return user  # Frontend replaces its data with this

# ❌ BAD - Return partial or just success
@router.put("/users/{user_id}")
async def update_user(...):
    # ...update logic...
    return {"success": True}  # Frontend doesn't know new state!
```

#### 9. Code Deletion Checklist
When removing features, remove ALL related code:
- [ ] Router endpoints
- [ ] Repositories (if unused elsewhere)
- [ ] Services (if unused elsewhere)
- [ ] Database models and migrations
- [ ] Frontend pages and components
- [ ] API route handlers
- [ ] TypeScript types and interfaces
- [ ] Import statements
- [ ] Tests
- [ ] Documentation

**Dead code is not "safe to keep" - it's a maintenance burden.**

#### 10. Before Committing Code

**Run these checks:**
```bash
# Frontend
npx tsc --noEmit          # No type errors
npm run lint              # No lint errors
npm run build             # Build succeeds

# Backend
uv run mypy .             # No type errors
uv run ruff check .       # No lint errors
uv run pytest             # Tests pass
```

**Ask yourself:**
- [ ] Is this the simplest solution?
- [ ] Have I removed all unused code?
- [ ] Are all queries efficient (no N+1)?
- [ ] Is everything typed?
- [ ] Could this be 50% shorter?

## Key Technical Details

### Authentication
- JWT tokens with refresh rotation
- Rate limiting: login (5/min), refresh (20/min)
- Device fingerprinting with @fingerprintjs/fingerprintjs
- Middleware validates tokens and checks page-level permissions

### Database
- Async SQLModel sessions exclusively
- Relationships with `back_populates`
- Never use raw SQL - use SQLModel query builder

## Working Directories
- Backend commands: `/src/backend/`
- IT Portal commands: `/src/it-app/`
- Requester App commands: `/src/requester-app/`
- SignalR Service commands: `/src/signalr-service/`
- Docker commands: `/` (repository root)

## Before Task Completion
- [ ] No `any` types (TS) or untyped functions (Python)
- [ ] No orphaned imports or commented-out code
- [ ] Migrations created for model changes
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Build succeeds

## Desktop Session Tracking (CRITICAL)

**Desktop session tracking uses Redis TTL-based presence detection with timing relationships that MUST be coordinated.**

### Configuration Relationships

The three timing values MUST be coordinated to prevent false negatives (users incorrectly marked as offline) while maintaining responsive presence detection:

1. **heartbeat_interval_seconds** (Desktop App Frequency)
   - How often Tauri desktop app sends heartbeat requests
   - Trade-offs: Lower (60-120s) = more accurate but higher load; Higher (300-600s) = less load but slower detection
   - Default: 300 seconds (5 minutes)
   - Range: 60-600 seconds (1-10 minutes)

2. **ttl_seconds** (Redis Key Expiration)
   - How long Redis keeps presence keys without refresh
   - CRITICAL: MUST be >= 2x heartbeat_interval_seconds
   - Recommended: 2.2x heartbeat interval (10% safety margin)
   - Formula: ttl_seconds >= heartbeat_interval_seconds * 2.2
   - Default: 660 seconds (11 minutes = 2.2 x 300)
   - Purpose: Allows at least 1 missed heartbeat before marking offline
   - If too low: Network latency causes false negatives
   - If too high: Delayed offline detection after app closes

3. **cleanup_timeout_minutes** (Database Hygiene)
   - How long before APScheduler marks sessions inactive in database
   - Relationship: cleanup_timeout_minutes = 4 x heartbeat_interval_seconds
   - Default: 20 minutes (4 x 5 minutes)
   - Purpose: Database cleanup job interval (NOT real-time presence)
   - Redis is authoritative for presence, DB is for history/reports
   - If too low: Premature cleanup of valid sessions
   - If too high: Stale data in reports (but doesn't affect presence)

### Configuration Presets

**Conservative (Low Backend Load - Default):**
- heartbeat_interval_seconds = 300 (5 min)
- ttl_seconds = 660 (11 min = 2.2 x 300)
- cleanup_timeout_minutes = 20 (20 min = 4 x 5 min)
- Use case: Stable network, lower resource usage

**Aggressive (Accurate Presence):**
- heartbeat_interval_seconds = 120 (2 min)
- ttl_seconds = 264 (4.4 min = 2.2 x 120)
- cleanup_timeout_minutes = 8 (8 min = 4 x 2 min)
- Use case: Real-time requirements, higher backend capacity

**Balanced:**
- heartbeat_interval_seconds = 180 (3 min)
- ttl_seconds = 396 (6.6 min = 2.2 x 180)
- cleanup_timeout_minutes = 12 (12 min = 4 x 3 min)
- Use case: General production use

### Invalid Configurations

**NEVER configure these (will cause false negatives or other issues):**
```python
# ❌ TTL too low - causes false negatives
heartbeat_interval_seconds = 300
ttl_seconds = 400  # < 2x heartbeat (should be >= 600)

# ❌ TTL equal to heartbeat - no tolerance for delays
heartbeat_interval_seconds = 300
ttl_seconds = 300  # Network latency will cause false negatives

# ❌ Mismatched cleanup - premature DB cleanup
heartbeat_interval_seconds = 300
ttl_seconds = 660  # OK
cleanup_timeout_minutes = 5  # Too low! Should be ~20
```

### Configuration Validation

The `PresenceSettings` class in `/src/backend/core/config.py` validates that `ttl_seconds >= 2x heartbeat_interval_seconds` at startup. If validation fails, the application will not start with an error message:

```
ValueError: ttl_seconds (400) must be at least 2x heartbeat_interval_seconds (300).
Recommended: 2.2x (660s) for safety margin.
```

### Documentation

For detailed configuration examples, formulas, and troubleshooting, see:
- **Configuration Guide:** `/docs/desktop-session-tracking.md`
- **Configuration Class:** `/src/backend/core/config.py` (PresenceSettings)
- **Related:** `/docs/desktop-session-improvements-plan.md` (improvement roadmap)

## Active Technologies
- **Backend**: Python 3.13+ (async) + FastAPI, SQLModel, SQLAlchemy (async), Pydantic
- **Database**: PostgreSQL (async sessions via SQLModel/SQLAlchemy)
- **IT Portal**: TypeScript 5.x + Next.js 15 (App Router), React 19, `next/headers` (cookies), `withAuth` helper
- **Requester App**: Tauri + Rust + SolidJS (Windows desktop application)
- **Real-time**: .NET Core SignalR + Redis Streams (chat, notifications, presence)
- **Storage**: MinIO (S3-compatible object storage for files, screenshots, attachments)
- **Task Queue**: Celery + Redis (background tasks), APScheduler (in-process scheduled tasks)
- **Integration**: Active Directory / LDAP (authentication & domain user sync), WhatsApp (notifications)
