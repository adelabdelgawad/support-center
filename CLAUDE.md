# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Service Catalog Application - A comprehensive IT service catalog system with FastAPI backend and Next.js frontend, supporting real-time chat, request management, and multi-role access control.

**Tech Stack:**
- Backend: FastAPI + SQLModel + PostgreSQL + Redis (Python 3.12+)
- Agent Portal (`it-app/`): Next.js 15+ with TypeScript, SWR, React 19, Tailwind CSS 4, shadcn/ui
- Requester App (`src/requester-app/`): Tauri v2 + SolidJS desktop application for Windows employees
- Real-time: WebSocket for chat and notifications
- Package Manager: uv (backend), **bun** (it-app frontend), npm (requester-app)

**Repository Structure:**
- `backend/` - FastAPI backend server
- `it-app/` - Next.js web app for IT agents/supervisors
- `src/requester-app/` - Tauri + SolidJS desktop app for employees (Windows)
  - Features: SSO via Windows username, desktop notifications, screenshot capturing, system tray integration
  - WebSocket handlers: `src/requester-app/src/src/api/notification-websocket.ts`, `global-websocket.ts`
  - Remote access approval dialog implementation required in this app

## ⚠️ CRITICAL: Model Selection for Tasks

**Different task types MUST use specific models. This is MANDATORY:**

| Task Type | Model | When to Use |
|-----------|-------|-------------|
| **Planning** | `opus` | Architecture design, complex problem analysis, feature planning, multi-step task breakdown |
| **Investigation** | `opus` | Debugging root causes, analyzing complex issues, understanding codebases, research |
| **Testing** | `haiku` | Running tests, verification checks, quick validations, health checks, status monitoring |
| **Implementation** | `sonnet` | Writing code, making edits, running commands, straightforward changes |
| **Solution Execution** | `sonnet` | Applying fixes, deploying changes, executing planned solutions |

### Why This Matters

1. **Opus** excels at deep reasoning, architectural decisions, investigation, and complex planning
2. **Sonnet** is faster and more cost-effective for implementation and solution execution
3. **Haiku** is fastest and cheapest - perfect for repetitive testing tasks that don't require deep reasoning
4. Using the right model for each phase optimizes both quality, efficiency, and cost

### Example Workflow

```
User: "Add a new authentication system"

1. [Use Opus] Plan the architecture:
   - Analyze requirements
   - Design component structure
   - Identify edge cases
   - Create implementation plan

2. [Use Sonnet] Implement the plan:
   - Write the code
   - Create files
   - Apply fixes

3. [Use Haiku] Test the implementation:
   - Run test suites
   - Verify endpoints
   - Check health status
   - Monitor logs
```

```
User: "Debug why WebSocket connections are failing"

1. [Use Opus] Investigate the issue:
   - Analyze logs and error patterns
   - Trace connection flow
   - Identify root cause

2. [Use Sonnet] Execute the fix:
   - Write the fix code
   - Apply configuration changes

3. [Use Haiku] Verify the fix:
   - Run connection tests
   - Check health endpoints
```

## ⚠️ CRITICAL: No Legacy Code When Removing Features

**When removing or replacing a feature, DELETE all related code completely.**

### Rules

1. **NO commented-out code** - Delete it, don't comment it
2. **NO "legacy" wrappers** - Don't keep old functions that redirect to new ones
3. **NO backwards compatibility shims** - If something is unused, remove it entirely
4. **NO "// removed" or "// deprecated" comments** - Just delete the code
5. **NO unused imports** - Clean up all references to removed code

### ❌ WRONG - Keeping legacy code:

```python
# Legacy: kept for backwards compatibility
# def old_function():
#     return new_function()

def new_function():
    pass

# DEPRECATED: Use new_function instead
def old_function():
    """Deprecated. Use new_function."""
    return new_function()
```

### ✅ CORRECT - Clean removal:

```python
def new_function():
    pass
```

### Why This Matters

1. **Cleaner codebase** - No confusion about what's active vs deprecated
2. **Easier maintenance** - No dead code to maintain or accidentally use
3. **Better git history** - Use git to find old code if needed, not comments
4. **Smaller bundle sizes** - No unused code shipped to production

## ⚠️ CRITICAL: Schema Base Model

**ALL new schemas MUST inherit from `HTTPSchemaModel` instead of `BaseModel`.**

**Location:** `backend/core/schema_base.py`

### Usage (MANDATORY)

```python
from core.schema_base import HTTPSchemaModel  # NOT from pydantic import BaseModel

class MyNewSchema(HTTPSchemaModel):  # Inherit from HTTPSchemaModel
    user_id: int                     # Python: snake_case
    full_name: str
    created_at: datetime
```

### Why This Matters

1. **Next.js Compatibility**: Automatically converts snake_case to camelCase in JSON responses
2. **Bidirectional Support**: Accepts both snake_case (Python) and camelCase (Next.js) in requests
3. **No Config Duplication**: Don't add `class Config` or `model_config` with:
   - `from_attributes = True` (already in base)
   - `alias_generator = to_camel` (already in base)
   - `populate_by_name = True` (already in base)

### Example Output

**Python Schema:**
```python
class UserResponse(HTTPSchemaModel):
    user_id: int
    full_name: str
```

**JSON Response (automatic camelCase):**
```json
{
  "userId": 123,
  "fullName": "John Doe"
}
```

**JSON Request (accepts both):**
```json
{
  "userId": 123,      // ✅ camelCase (Next.js)
  "user_id": 123      // ✅ snake_case (Python)
}
```

### Migration Status
✅ All 18 existing schema files already migrated to `HTTPSchemaModel`
✅ See `SCHEMA_BASE_USAGE.md` for detailed documentation

## ⚠️ CRITICAL: Use Bun for it-app (NOT npm/node)

**ALWAYS use `bun` instead of `npm` or `node` when working in the `it-app/` directory.**

```bash
# ❌ WRONG - Never use npm/node in it-app
npm install
npm run dev
node script.js

# ✅ CORRECT - Always use bun in it-app
bun install
bun run dev
bun script.js
```

### Why This Matters

1. **Performance**: Bun is significantly faster for installs and script execution
2. **Lockfile**: Project uses `bun.lock` (not `package-lock.json`)
3. **Consistency**: All team members use bun for this project

### Commands Reference

| Task | Command |
|------|---------|
| Install dependencies | `bun install` |
| Run dev server | `bun run dev` |
| Build for production | `bun run build` |
| Run production server | `bun run start` |
| Lint code | `bun run lint` |
| Add a package | `bun add <package>` |
| Add dev dependency | `bun add -d <package>` |

## ⚠️ CRITICAL: Next.js API Route Pattern

**NEVER call the backend directly from client-side components!**

**ALWAYS use Next.js API routes as a proxy between client and backend.**

### Architecture

```
Client Component (Browser)
  ↓ fetch()
Next.js API Route (/api/*)
  ↓ makeAuthenticatedRequest() or axiosServerPublic
Backend API (FastAPI)
```

### Why This Matters

1. **Security**: httpOnly cookies with tokens never exposed to client JavaScript
2. **Authentication**: Server-side token management and validation
3. **Consistency**: Single source of truth for API communication
4. **Type Safety**: Proper error handling and response typing
5. **SSR Support**: Works with both client and server components

### Implementation Pattern

**❌ WRONG - Direct backend call from client:**
```typescript
// DON'T DO THIS!
import { axiosClient } from '@/lib/api';

const response = await axiosClient.post('/requests', data);
```

**✅ CORRECT - Call Next.js API route:**

**Step 1: Create API route** (`app/api/requests/route.ts`)
```typescript
import { makeAuthenticatedRequest } from "@/lib/api/axios-server";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Call backend with server-side authentication
  const response = await makeAuthenticatedRequest('POST', '/requests', body);

  return NextResponse.json(response, { status: 201 });
}
```

**Step 2: Create client service** (`lib/api/service-request.ts`)
```typescript
export async function createServiceRequest(data: CreateRequestData) {
  // Call Next.js API route (NOT backend)
  const response = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Include httpOnly cookies
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Request failed');
  }

  return await response.json();
}
```

**Step 3: Use in client component**
```typescript
'use client';

import { createServiceRequest } from '@/lib/api/service-request';

const result = await createServiceRequest({ title: 'My request' });
```

### Server-Side Utilities

Located in `lib/api/axios-server.ts`:

- `makeAuthenticatedRequest<T>(method, endpoint, data?)` - Authenticated requests
- `axiosServerPublic` - Public endpoints (login, SSO)
- `getServerAccessToken()` - Get token from httpOnly cookie
- `getServerErrorMessage(error)` - Extract error messages

### Existing API Routes

**Authentication:**
- `/api/auth/ad-login` - Active Directory login
- `/api/auth/sso` - SSO authentication
- `/api/auth/refresh` - Token refresh
- `/api/auth/logout` - Logout

**Service Requests:**
- `/api/requests` - POST (create), GET (list)
- `/api/requests/[id]` - GET (retrieve by ID)

### Creating New API Routes

1. Create route file: `app/api/resource/route.ts`
2. Use `makeAuthenticatedRequest()` for authenticated endpoints
3. Use `axiosServerPublic` for public endpoints
4. Return proper error responses with status codes
5. Create corresponding client service in `lib/api/`

## Frontend Development Commands

```bash
cd it-app

# Install dependencies
bun install

# Run development server (port 3010)
bun run dev

# Build for production
bun run build

# Run production server
bun run start

# Lint code
bun run lint
```

## ⚠️ CRITICAL: Frontend Deployment (Production)

**The Next.js app runs DIRECTLY on the host with bun, NOT in Docker.**

### Production Deployment Steps

1. **Navigate to it-app directory:**
   ```bash
   cd /home/arc-webapp-01/support_center/src/it-app
   ```

2. **Build the application:**
   ```bash
   bun run build
   ```
   - This creates optimized production build in `.next` directory
   - Uses Turbopack for fast compilation
   - Generates standalone server output

3. **Start the production server:**
   ```bash
   PORT=3010 bun run start > /tmp/nextjs-server.log 2>&1 &
   ```
   - Runs on port 3010
   - Logs to `/tmp/nextjs-server.log`
   - Background process (use `&`)

4. **Verify server is running:**
   ```bash
   netstat -tlnp | grep :3010   # Check port is listening
   ps aux | grep "next-server"   # Check process is running
   curl -I http://localhost:3010 # Test HTTP response
   ```

### Important Notes

- **NOT containerized**: Despite docker-compose.yml having a frontend service, the production app runs on host
- **Always rebuild after code changes**: Production mode serves from `.next` build directory
- **Port**: Must run on port 3010 (configured in package.json and expected by clients)
- **Mode**: Production uses `next start` (NOT `next dev` with Turbopack HMR)
- **Persistence**: Use a process manager (systemd, pm2) for production to restart on crash/reboot

### Troubleshooting

**Static asset failures (`NS_ERROR_CONNECTION_REFUSED`):**
- Server is not running → Start with `bun run start`
- Wrong mode (dev vs prod) → Use `bun run start` not `bun run dev`
- Build is stale/missing → Run `bun run build` first

**TypeScript compilation errors during build:**
- Fix type errors before build will succeed
- Check `bun run build` output for specific errors

## Development Commands

### Backend Setup and Running

```bash
cd backend

# Install dependencies using uv
uv sync

# Or using pip (legacy)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run development server (auto-reload, single worker)
uvicorn main:app --reload

# Run production server (4 workers)
python main.py

# Health check
curl http://localhost:8000/health
```

### Database Operations

```bash
cd backend

# Create new migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Rollback one migration
uv run alembic downgrade -1

# View migration history
uv run alembic history

# Check current database version
uv run alembic current

# Show head revisions (useful for detecting conflicts)
uv run alembic heads
```

**Migration Best Practices:**
- Use descriptive names: `YYYY_MM_DD_HHMM_description.py`
- Always review autogenerated migrations before applying
- Test on development data first
- Keep migrations atomic and reversible
- Avoid `index=True` in Field() when using `__table_args__` for indexes (causes SQLAlchemy RuntimeError)

### Docker Services

```bash
# Start PostgreSQL and Redis only
docker-compose up -d postgres redis

# PostgreSQL runs on port 5433 (mapped from container 5432)
# Redis runs on port 6380 (mapped from container 6379)

# Stop services
docker-compose down

# View logs
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Testing

```bash
cd backend

# Run all tests
pytest

# Run with coverage report
pytest --cov

# Run specific test file
pytest tests/test_file.py

# Run specific test function
pytest tests/test_file.py::test_function_name
```

### Code Quality

```bash
cd backend

# Format code
black .

# Lint code
ruff check .

# Type checking
mypy .
```

## Architecture

### Service Layer Pattern

Business logic is organized into service classes that handle all database operations:
- Services in `services/`: `auth_service.py`, `user_service.py`, `chat_service.py`, `request_service.py`, etc.
- Endpoints in `api/v1/endpoints/`: Thin wrappers that validate input and call services
- Services use decorators from `core/decorators.py` for error handling, logging, and transactions

### Database Models vs Schemas

**Strict separation:**
- `models/database_models.py`: SQLModel database tables with relationships
- `schemas/`: Pydantic models for API validation (Create, Update, Read schemas)

**CRITICAL Schema Requirements:**
- **ALL schemas MUST inherit from `HTTPSchemaModel`** (from `core.schema_base`)
- This provides automatic camelCase conversion for Next.js compatibility
- Never use plain `BaseModel` - always use `HTTPSchemaModel`

**Important:** Avoid `index=True` in Field() when defining indexes in `__table_args__` - this causes SQLAlchemy RuntimeError. Use only `__table_args__` for all index definitions.

### Dependency Injection (core/dependencies.py)

Key dependencies:
- `get_session()`: Async database session management
- `get_current_user()`: JWT authentication from Bearer token
- `get_current_user_session()`: Returns (User, UserSession) tuple
- `require_admin()`: Role-based access control
- `require_roles(*roles)`: Multi-role authorization
- `get_client_ip(request)`: Extract client IP from request headers

### Authentication System

**Passwordless JWT-based authentication:**
- Access tokens: 15 minutes expiry
- Refresh tokens: 7 days expiry
- Session tracking with device info (IP, user agent)
- Token rotation on refresh
- Session management (view/revoke sessions)

**Flow:**
1. POST `/api/v1/auth/login` with username only
2. Returns access_token, refresh_token, user info
3. Use `Authorization: Bearer <access_token>` header
4. Refresh via POST `/api/v1/auth/refresh` with refresh_token
5. Logout via POST `/api/v1/auth/logout` (invalidates session)

### User Roles and Access Control

Defined in `models/model_enum.py`:
- **EMPLOYEE**: Submit requests, chat with agents
- **AGENT**: View/manage requests, chat with employees
- **SUPERVISOR**: System-wide metrics, task assignment, reporting

Additional user fields:
- `is_super_admin`: Full system access override
- `is_domain`: Domain user (AD) vs local user
- `is_blocked`: Account blocking with custom message
- `manager_id`: User's manager reference

### Database Configuration

- **Driver**: asyncpg for PostgreSQL with AsyncSession
- **Pooling**: 20 connections, 10 max overflow
- **Pool settings**: 30s timeout, 1h recycle time
- **Features**: JIT enabled, pre-ping verification, query caching
- **Timezone**: Cairo (Africa/Cairo) used throughout

### Redis Caching

- Max 50 connections with socket keepalive
- Default TTL: 300 seconds (5 minutes)
- Used for: session data, frequently accessed queries
- LRU eviction policy (512MB max in docker-compose)
- Configuration in `core/cache.py`

### WebSocket Management

**Location:** `websocket/manager.py`

ConnectionManager features:
- User-based connection tracking: `user_id -> Set[WebSocket]`
- Request rooms: `request_id -> Set[user_id]`
- Automatic cleanup on disconnect
- Heartbeat interval: 30 seconds
- Broadcast methods: `send_personal_message()`, `broadcast_to_request()`

**WebSocket endpoint:** `/ws/{user_id}?token={access_token}`

### API Structure

All routes under `/api/v1/`:
- `/auth`: Authentication (login, logout, refresh, sessions)
- `/users`: User management (CRUD, profile, blocking)
- `/requests`: Service request lifecycle
- `/request-statuses`: Request status tracking
- `/request-notes`: Notes on service requests
- `/sessions`: Session management
- `/chat`: Chat message operations
- `/files`: File upload/download (SMB-backed)
- `/categories`: Request categories
- `/priorities`: Priority levels
- `/business-units`: Business unit management
- `/business-unit-regions`: Regional assignments
- `/business-unit-roles`: Role assignments
- `/business-unit-user-assigns`: User-BU assignments

### Configuration System

**Location:** `core/config.py`

Uses Pydantic Settings with `.env` file:
- Database: `DATABASE_URL`, pool configuration
- Redis: `REDIS_URL`, connection settings
- JWT: `SECRET_KEY`, `JWT_SECRET_KEY`, expiration times
- SMTP: Email notification settings
- SMB: File storage configuration (`SMB_SHARED_PATH`, credentials)
- Active Directory: LDAP settings (`DC_PATH`, `DC_DOMAIN_NAME`, `DC_BASE_DN`)
- Performance: Cache TTL, query logging, metrics
- File uploads: Size limits, allowed extensions

### Error Handling Decorators

**Location:** `core/decorators.py`

Service layer decorators:
- `@safe_database_query`: Catches and logs database errors
- `@transactional_database_operation`: Automatic transaction management
- `@log_database_operation`: Structured logging with performance metrics
- `@critical_database_operation`: High-priority error handling

### Logging

**Location:** `core/logging_config.py`

- File logging: `logs/` directory with rotation (10MB max, 5 backups)
- Console logging: Enabled by default
- Structured logging with module-level loggers
- Configured via environment variables in `.env`

### Additional Features

- **Rate Limiting**: SlowAPI integration (60 requests/minute default, 10 burst)
- **Metrics**: Prometheus metrics at `/metrics` (when `ENABLE_METRICS=True`)
- **CORS**: Configurable origins via `CORS_ORIGINS`
- **GZip**: Automatic compression for responses >1000 bytes
- **SMB Integration**: File storage on network shares via `services/smb_service.py`
- **Active Directory**: LDAP integration via `services/active_directory.py`

## Important Implementation Details

### Creating a New Endpoint

1. Define Pydantic schemas in `schemas/<resource>/`
   - **CRITICAL**: Inherit from `HTTPSchemaModel` (NOT `BaseModel`)
   - Create, Update, Read schemas
   - Use proper validation (field_validator, model_validator)
2. Add service class in `services/<resource>_service.py`
   - Use error handling decorators
   - Implement async database operations
3. Create endpoint in `api/v1/endpoints/<resource>.py`
   - Use dependency injection for auth
   - Keep logic thin - delegate to service
4. Register router in `api/v1/__init__.py`
5. Create migration if model changes: `uv run alembic revision --autogenerate -m "description"`

### Database Query Optimization

- Use `selectinload()` for eager loading relationships
- Leverage Redis cache for frequently accessed data
- Use `expire_on_commit=False` in sessions where needed
- Apply proper indexes in `__table_args__` (NOT in Field())
- Consider pagination for large result sets (default: 20/page, max: 100/page)

### Service Request Business Rules

- `resolution` field is **MANDATORY** when changing status to `status_id` 6 or 8
- Status changes are tracked in `RequestStatus` table
- Validation enforced in `request_service.py`

### Key Database Relationships

- `User` has many: `ServiceRequest`, `ChatMessage`, `UserSession`, `BusinessUnitUserAssign`
- `ServiceRequest` has many: `ChatMessage`, `Attachment`, `RequestNote`
- `ServiceRequest` belongs to: `Category`, `Priority`, `RequestStatus` (status_id)
- `ChatMessage` may have: `screenshot_file_name` for screenshot attachments
- `BusinessUnit` has many: `BusinessUnitRegion`, `BusinessUnitRole`, `BusinessUnitUserAssign`

## Project Structure

```
it_support_center/
├── backend/                    # FastAPI backend
│   ├── main.py                 # App entry point with lifespan events
│   ├── core/                   # Core configuration and utilities
│   │   ├── config.py          # Settings with Pydantic
│   │   ├── schema_base.py     # HTTPSchemaModel (CRITICAL - use for all schemas)
│   │   ├── database.py        # Database engine and session
│   │   ├── cache.py           # Redis cache wrapper
│   │   ├── dependencies.py    # FastAPI dependencies (auth, DB)
│   │   ├── security.py        # JWT token handling
│   │   ├── decorators.py      # Service layer decorators
│   │   └── logging_config.py  # Logging setup
│   ├── models/                 # SQLModel database models
│   ├── schemas/                # Pydantic validation schemas (one folder per resource)
│   ├── services/               # Business logic layer
│   ├── api/v1/endpoints/       # API endpoints
│   ├── websocket/              # WebSocket handling
│   ├── alembic/versions/       # Database migrations
│   ├── tests/                  # Test suite
│   └── pyproject.toml         # uv dependencies
│
├── it-app/                     # Next.js frontend
│   ├── app/
│   │   ├── (it-pages)/        # Main app routes (support-center, setting)
│   │   └── api/               # Next.js API routes (proxy to backend)
│   ├── lib/
│   │   ├── actions/           # Server actions (*.actions.ts)
│   │   ├── api/               # Client API wrappers + axios-server.ts
│   │   ├── hooks/             # Custom React hooks (SWR, WebSocket)
│   │   ├── swr/               # SWR cache keys
│   │   ├── auth/              # Auth context and services
│   │   ├── types/             # TypeScript type definitions
│   │   └── utils/             # Utility functions
│   ├── components/ui/         # shadcn/ui components
│   ├── types/                 # Centralized type definitions (*.d.ts)
│   └── package.json           # bun dependencies (use bun, not npm)
│
├── docs/                       # Architecture documentation
│   ├── API_ARCHITECTURE.md
│   ├── page-refactoring-architecture.md
│   └── SWR_MIGRATION_AND_STATE_MANAGEMENT_GUIDE.md
│
├── docker/                     # Docker configuration
│   ├── env/                   # Centralized environment files
│   │   ├── .env.backend       # Backend/Celery environment (gitignored)
│   │   ├── .env.example.*     # Example env files (committed)
│   │   └── ...                # Other service env files
│   ├── backend/               # Backend Docker config
│   │   ├── Dockerfile
│   │   └── .dockerignore
│   ├── frontend/              # Frontend Docker config
│   │   ├── Dockerfile
│   │   └── .dockerignore
│   ├── monitoring/            # Prometheus & Grafana monitoring
│   │   ├── prometheus/        # Prometheus config, alerts, rules
│   │   ├── grafana/           # Grafana provisioning & dashboards
│   │   └── README.md
│   ├── postgres/              # PostgreSQL initialization
│   │   └── init.sql
│   └── nginx/                 # Nginx configuration
│       └── nginx.conf
│
└── docker-compose.yml         # All services orchestration
```

## Environment Setup

### Backend
1. Copy `.env.example` to `.env` and configure
2. Start Docker services: `docker-compose up -d postgres redis`
3. Install dependencies: `cd backend && uv sync`
4. Run migrations: `uv run alembic upgrade head`
5. Start server: `uvicorn main:app --reload`

### Frontend
1. Install dependencies: `cd it-app && bun install`
2. Run development server: `bun run dev` (port 3010)

## Frontend Architecture

### Page Structure Pattern

All pages follow this architecture (see `docs/page-refactoring-architecture.md` for details):

```
app/(it-pages)/feature/
├── page.tsx                    # Server component - fetches ALL GET data
├── x-page.tsx                  # Client wrapper - receives data as props
├── _context/
│   └── feature-context.tsx     # Provider with state & SWR hooks
├── _components/                # UI components (use context, no prop drilling)
└── _types/                     # Page-specific types (optional)
```

**Data Flow:**
- `page.tsx` → Server actions (`lib/actions/*.actions.ts`) → Backend via `makeAuthenticatedRequest()`
- Client mutations → Client API (`lib/api/*.ts`) → Next.js API routes (`app/api/*`) → Backend

### Key Frontend Patterns

1. **Server Actions** (`lib/actions/*.actions.ts`): Use `Promise.all` for parallel fetching
2. **Client API** (`lib/api/*.ts`): Call internal `/api/*` routes (NEVER backend directly), include `credentials: 'include'`
3. **Providers**: Use SWR for refreshable data with `fallbackData` from server, WebSocket for real-time
4. **Components**: Always prefer shadcn/ui components from `/components/ui/`

### SWR for State Management

Use SWR hooks with optimistic updates instead of useState/useCallback patterns. See `docs/SWR_MIGRATION_AND_STATE_MANAGEMENT_GUIDE.md`.

Cache keys centralized in `lib/swr/cache-keys.ts`.

## Current State

- Backend fully functional with passwordless auth, multi-role access, real-time chat
- **Agent Portal** (`it-app/`): Next.js frontend for agents/supervisors to manage tickets
- **Requester App** (`@it_support_center_frontend/`): Separate Tauri + SolidJS desktop app for employees to submit requests (Windows, features: SSO, notifications, screenshots)
- SMB and Active Directory integration available but optional
- **Backend schemas MUST inherit from `HTTPSchemaModel`** (from `core.schema_base`)
- **Frontend variables use camelCase, backend uses snake_case** - conversion handled by HTTPSchemaModel

## Active Technologies
- Python 3.12+ (Backend), TypeScript 5.x (Frontend) + FastAPI, SQLModel, Next.js 15, React 19, SWR (001-fix-assignees-update)
- PostgreSQL with asyncpg (001-fix-assignees-update)

## Recent Changes
- 001-fix-assignees-update: Added Python 3.12+ (Backend), TypeScript 5.x (Frontend) + FastAPI, SQLModel, Next.js 15, React 19, SWR
