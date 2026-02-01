# Support Center

A full-stack IT service management platform for handling support requests, real-time agent-requester communication, and multi-role access control across web and desktop interfaces.

---

## What It Does

Support Center connects employees who need IT help with the agents who resolve their issues. Employees submit requests through a Windows desktop app, and IT staff manage those requests through a web portal — with live chat, file attachments, status tracking, and role-based dashboards.

### For Employees (Requesters)
- Submit service requests from a lightweight desktop app
- Chat in real-time with assigned IT agents
- Attach screenshots and files directly from the desktop
- Receive desktop notifications on status changes
- Automatic sign-in via Windows SSO

### For IT Agents & Supervisors
- Web-based dashboard to triage, assign, and resolve requests
- Real-time chat with requesters (typing indicators, message history)
- Request categorization, prioritization, and status workflows
- Reporting and analytics across business units and regions
- Role-based access: technician, supervisor, admin, super admin

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Requester App  │     │   Agent Portal    │     │   SignalR Hub   │
│  Tauri/SolidJS  │     │  Next.js 15/React │     │   .NET Core     │
│   (Windows)     │     │      (Web)        │     │  (Real-time)    │
└────────┬────────┘     └────────┬──────────┘     └────────┬────────┘
         │                       │                          │
         │              ┌────────▼──────────┐               │
         │              │  Next.js API Layer │               │
         │              │   (Auth Proxy)     │               │
         │              └────────┬──────────┘               │
         │                       │                          │
         └───────────┬───────────┘                          │
                     │                                      │
              ┌──────▼──────┐      ┌──────────┐            │
              │   FastAPI   │◄─────│  Redis    │◄───────────┘
              │   Backend   │      │ Streams   │
              └──────┬──────┘      └──────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼───┐ ┌─────▼────┐ ┌───▼───┐
    │PostgreSQL│ │  Redis   │ │ MinIO │
    │  (Data) │ │ (Cache)  │ │(Files)│
    └────────┘ └──────────┘ └───────┘
```

### Components

| Component | Stack | Purpose |
|-----------|-------|---------|
| **Backend** | FastAPI, SQLModel, Python 3.12+ | REST API, business logic, WebSocket |
| **Agent Portal** | Next.js 15, React 19, TypeScript, SWR | Web UI for IT staff |
| **Requester App** | Tauri v2, SolidJS | Windows desktop app for employees |
| **SignalR Service** | .NET Core, C# | Real-time event broadcasting |
| **Database** | PostgreSQL 18, Alembic | Persistent storage, migrations |
| **Cache** | Redis | Session cache, pub/sub, event streams |
| **Storage** | MinIO / SMB | File and attachment storage |

---

## Project Structure

```
support-center/
├── src/
│   ├── backend/              # FastAPI backend
│   │   ├── api/v1/endpoints/ # REST endpoints
│   │   ├── db/models.py      # Database models
│   │   ├── api/schemas/      # Request/response schemas
│   │   ├── core/             # Config, auth, dependencies
│   │   ├── crud/             # Data access layer
│   │   ├── tasks/            # Celery background tasks
│   │   └── alembic/          # Database migrations
│   │
│   ├── it-app/               # Next.js agent portal
│   │   ├── app/(it-pages)/   # Application pages
│   │   ├── app/api/          # API proxy routes
│   │   ├── lib/              # Hooks, actions, utilities
│   │   └── components/       # UI components (shadcn/ui)
│   │
│   ├── requester-app/        # Tauri desktop app
│   └── signalr-service/      # .NET SignalR service
│
├── docker/                   # Docker configs, monitoring, nginx
├── docker-compose.dev.yml    # Dev infrastructure
├── docker-compose.prod.yml   # Full production stack
└── docs/                     # Architecture documentation
```

---

## Getting Started

### Prerequisites

- Python 3.12+, [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/) (frontend)
- Docker & Docker Compose
- PostgreSQL 18, Redis

### 1. Start Infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts PostgreSQL (port 5433), Redis (port 6380), and MinIO (ports 9000/9001).

### 2. Backend

```bash
cd src/backend
cp .env.example .env          # configure database, redis, jwt secrets
uv sync                       # install dependencies
uv run alembic upgrade head   # run migrations
uvicorn main:app --reload     # start dev server (port 8000)
```

### 3. Agent Portal (Frontend)

```bash
cd src/it-app
bun install
bun run dev                   # start dev server (port 3010)
```

### 4. Requester App (Optional)

```bash
cd src/requester-app
npm install
npm run tauri dev             # launch Tauri desktop app
```

---

## Key Features

### Authentication
- Passwordless JWT authentication (access + refresh tokens)
- Active Directory / LDAP integration
- Session tracking with device fingerprinting
- httpOnly cookie-based token storage on the frontend

### Real-Time Communication
- WebSocket chat between requesters and agents
- SignalR hub for event broadcasting
- Redis Streams for low-latency event transport
- Typing indicators with server-side coalescing

### Request Lifecycle
- Create, categorize, prioritize, and assign requests
- Status workflow with mandatory resolution on close
- File attachments via SMB or MinIO
- Request notes and internal comments
- Business unit and region scoping

### Role-Based Access
| Role | Access |
|------|--------|
| Technician | Handle assigned requests, chat |
| Supervisor | System-wide metrics, team oversight |
| Admin | User management, system configuration |
| Super Admin | Full access override |

---

## API Overview

All backend endpoints live under `/api/v1/`:

| Route | Description |
|-------|-------------|
| `/auth` | Login, logout, token refresh, sessions |
| `/users` | User CRUD, profiles, blocking |
| `/requests` | Service request lifecycle |
| `/support/` | Categories, priorities, assignments |
| `/management/` | Admin operations |
| `/reporting/` | Dashboards and analytics |
| `/setting/` | System configuration |

The Next.js frontend proxies all client requests through `/api/*` routes — the browser never calls the backend directly.

---

## Production Deployment

### Backend (Docker)

```bash
docker compose -f docker-compose.prod.yml up -d
```

Runs 3 backend replicas behind PgBouncer, with Prometheus + Grafana monitoring and nginx reverse proxy.

### Frontend (Host)

```bash
cd src/it-app
bun run build
PORT=3010 bun run start
```

The Next.js app runs directly on the host (not containerized) on port 3010.

---

## Development

| Task | Command |
|------|---------|
| Run backend tests | `cd src/backend && pytest` |
| Run with coverage | `cd src/backend && pytest --cov` |
| Format backend | `cd src/backend && black .` |
| Lint backend | `cd src/backend && ruff check .` |
| Lint frontend | `cd src/it-app && bun run lint` |
| New migration | `cd src/backend && uv run alembic revision --autogenerate -m "description"` |
| Apply migrations | `cd src/backend && uv run alembic upgrade head` |

---

## License

Proprietary. Internal use only.
