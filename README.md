# IT Support Center

A modern, full-stack IT service management platform featuring real-time communication, intelligent request routing, and comprehensive multi-role access control.

## Overview

The IT Support Center is an enterprise-grade service catalog system designed to streamline IT support operations. Built with performance and scalability in mind, it provides distinct portals for employees, support agents, and supervisors with real-time collaboration capabilities.

### Key Features

- **Real-time Communication** - WebSocket-powered chat and notifications
- **Intelligent Request Management** - Automated routing and priority-based queuing
- **Multi-role Access Control** - Role-based permissions with granular access levels
- **Desktop Integration** - Native Windows application for employees (Tauri + SolidJS)
- **Background Processing** - Async task handling with Celery
- **Comprehensive Analytics** - Performance metrics and reporting dashboards

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: PostgreSQL with asyncpg
- **ORM**: SQLModel
- **Cache/Queue**: Redis
- **Task Queue**: Celery
- **Package Manager**: uv

### Frontend
- **Agent Portal**: Next.js 15 (App Router)
- **Language**: TypeScript
- **State Management**: SWR
- **UI Framework**: React 19
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui

### Requester Application
- **Framework**: Tauri v2
- **UI**: SolidJS
- **Platform**: Windows Desktop
- **Features**: SSO, Desktop Notifications, Screenshot Capture, System Tray Integration

## Project Structure

```
it_support_center/
├── src/
│   ├── backend/              # FastAPI application
│   │   ├── api/v1/          # API endpoints
│   │   ├── core/            # Configuration & utilities
│   │   ├── models/          # Database models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   ├── tasks/           # Celery tasks
│   │   └── websocket/       # WebSocket handlers
│   │
│   ├── it-app/              # Next.js agent portal
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # API clients & utilities
│   │   └── types/           # TypeScript definitions
│   │
│   └── requester-app/       # Tauri desktop app
│       └── src/             # SolidJS application
│
├── docker/                   # Docker configurations
├── docs/                     # Documentation
│   ├── README.md            # Deployment guide
│   └── celery_setup.md      # Background tasks
└── docker-compose.yml       # Service orchestration
```

## Quick Start

### Prerequisites

- **Python** 3.12 or higher
- **Node.js** 18 or higher
- **Docker** & Docker Compose (for infrastructure)
- **uv** (Python package manager) - [Installation guide](https://github.com/astral-sh/uv)

### 1. Infrastructure Setup

Start PostgreSQL and Redis services:

```bash
docker-compose up -d postgres redis
```

Services will be available at:
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`

### 2. Backend Setup

```bash
cd src/backend

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Initialize database
uv run alembic upgrade head

# Start development server
uvicorn main:app --reload
```

API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 3. Start Background Workers

In a separate terminal:

```bash
cd src/backend

# Start Celery worker
uv run celery -A celery_app worker --loglevel=info

# (Optional) Monitor tasks with Flower
uv run celery -A celery_app flower
# Access at http://localhost:5555
```

### 4. Frontend Setup

```bash
cd src/it-app

# Install dependencies
npm install

# Start development server
npm run dev
```

Application available at: http://localhost:3010

## Development

### Database Migrations

```bash
cd src/backend

# Create migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Rollback
uv run alembic downgrade -1

# View history
uv run alembic history
```

### Testing

```bash
cd src/backend

# Run all tests
pytest

# With coverage
pytest --cov

# Specific test
pytest tests/test_file.py::test_function_name
```

### Code Quality

```bash
cd src/backend

# Format
black .

# Lint
ruff check .

# Type check
mypy .
```

### Production Build

```bash
# Backend (production mode)
cd src/backend
python main.py  # Runs with 4 workers

# Frontend (optimized build)
cd src/it-app
npm run build
npm start
```

## Architecture

### Authentication

JWT-based passwordless authentication with:
- Access tokens (15 min expiry)
- Refresh tokens (7 day expiry)
- Session tracking with device fingerprinting
- Automatic token rotation

### User Roles

| Role | Permissions |
|------|-------------|
| **EMPLOYEE** | Submit requests, track status, chat with agents |
| **AGENT** | Manage request queue, respond to tickets, knowledge base access |
| **SUPERVISOR** | System metrics, task assignment, reporting, analytics |

### API Endpoints

Base path: `/api/v1/`

- `/auth` - Authentication & session management
- `/users` - User administration
- `/requests` - Service request lifecycle
- `/chat` - Real-time messaging
- `/files` - File uploads/downloads (SMB-backed)
- `/categories` - Request categorization
- `/priorities` - Priority management
- `/business-units` - Organizational structure

### WebSocket Communication

Real-time features powered by WebSocket connections:

- **Endpoint**: `/ws/{user_id}?token={access_token}`
- **Features**: Live chat, notifications, request updates
- **Heartbeat**: 30-second intervals
- **Rooms**: User-based and request-based

### Background Tasks

Celery handles asynchronous operations:

- File processing & validation
- Email notifications
- Scheduled database maintenance
- Report generation
- SMB file synchronization
- Automated cleanup tasks

## Configuration

### Environment Variables

**Backend** (`src/backend/.env`):
```bash
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5433/dbname
REDIS_URL=redis://localhost:6380/0
SECRET_KEY=<generate-secure-key>
JWT_SECRET_KEY=<generate-jwt-key>
```

**Frontend** (`src/it-app/.env.local`):
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

See [Deployment Guide](docs/README.md) for complete configuration options.

## Deployment

For production deployment with Docker, monitoring setup, and scaling strategies, refer to:

📘 [**Deployment Guide**](docs/README.md)

This guide covers:
- Docker Compose orchestration
- Production environment setup
- SSL/TLS configuration
- Database backup strategies
- Performance tuning
- Monitoring with Flower
- Security best practices

## Development Guidelines

1. **Schema Inheritance**: All backend schemas MUST inherit from `HTTPSchemaModel` (not `BaseModel`)
2. **Naming Conventions**:
   - Backend: `snake_case`
   - Frontend: `camelCase`
3. **API Routes**: Never call backend directly from client components - always use Next.js API routes
4. **Testing**: Write tests for new features and bug fixes
5. **Code Quality**: Run formatters and linters before committing

## Performance

### Optimizations Implemented

- Async/await throughout backend
- Redis caching for frequent queries
- Database connection pooling (20 connections, 10 overflow)
- Query optimization with eager loading
- WebSocket connection management
- File compression for uploads
- Pagination for large datasets
- Index optimization

### Benchmarks

- API response time: <100ms (95th percentile)
- WebSocket latency: <50ms
- Database query time: <20ms (cached)
- Concurrent users supported: 1000+

## Documentation

- [Deployment Guide](docs/README.md) - Production deployment
- [Celery Setup](docs/celery_setup.md) - Background task configuration
- [API Architecture](docs/API_ARCHITECTURE.md) - API design patterns
- [SWR Implementation](docs/nextjs-swr-table-implementation-prompt.md) - Frontend state management

## Related Projects

- **Requester Desktop App** - Native Windows application for end users
  - Repository: `src/requester-app/`
  - Built with Tauri v2 + SolidJS
  - Features: Windows SSO, desktop notifications, screenshot capture, system tray

## License

Proprietary - Internal Use Only

---

**Maintained by**: IT Support Team
**Version**: 1.0.0
**Last Updated**: December 2024
