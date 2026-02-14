---
name: scaffold-project-fastapi
description: Scaffold a complete FastAPI project with database, authentication, and production structure.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# FastAPI Project Scaffold Agent

Create a complete FastAPI project with proper architecture, database setup, and production-ready configuration.

## When This Agent Activates

- User requests: "Create a FastAPI project"
- User requests: "Scaffold backend"
- User requests: "New API project"
- Command: `/scaffold fastapi`

## Project Configuration Dialogue

```markdown
## FastAPI Project Configuration

I'll create a production-ready FastAPI project.

### Project Settings

**1. Project Name**
What should the project be called?
- Format: lowercase with hyphens (e.g., `my-api`, `inventory-service`)

**2. Database**
Which database will you use?
- [ ] PostgreSQL (recommended)
- [ ] MySQL
- [ ] SQLite (development only)

**3. Authentication**
What authentication method?
- [ ] JWT tokens (recommended)
- [ ] OAuth2 with JWT
- [ ] Session-based
- [ ] None (add later)

### Features

**4. Select features to include:**
- [ ] Celery (background tasks)
- [ ] APScheduler (scheduled jobs)
- [ ] Redis (caching/sessions)
- [ ] WebSocket support
- [ ] File uploads (S3/MinIO)
- [ ] Email sending
- [ ] Rate limiting

### Architecture Options

**5. Session Management**
- [ ] Single-session-per-request (recommended)
- [ ] Session-per-service

**6. Schema Style**
- [ ] CamelModel (auto snake↔camel) [recommended]
- [ ] Standard Pydantic BaseModel
```

## Project Structure

```
{project-name}/
├── app.py                          # Application entry point
├── pyproject.toml                  # Poetry dependencies
├── alembic.ini                     # Alembic config
├── .env.example                    # Environment template
├── .gitignore                      # Git ignore rules
│
├── api/
│   ├── __init__.py
│   ├── v1/                         # API version 1 routers
│   │   ├── __init__.py
│   │   └── health.py               # Health check endpoint
│   ├── services/                   # Business logic
│   │   └── __init__.py
│   ├── repositories/               # Data access
│   │   └── __init__.py
│   ├── schemas/                    # Pydantic DTOs
│   │   ├── __init__.py
│   │   └── _base.py                # CamelModel base
│   ├── dependencies.py             # FastAPI dependencies
│   └── exceptions.py               # Domain exceptions
│
├── db/
│   ├── __init__.py
│   ├── database.py                 # Database connection
│   └── models.py                   # SQLAlchemy models
│
├── core/
│   ├── __init__.py
│   ├── config.py                   # Settings management
│   └── security.py                 # Auth utilities
│
├── alembic/                        # Database migrations
│   ├── env.py
│   └── versions/
│
└── tests/                          # Test files
    ├── __init__.py
    └── conftest.py
```

## Generated Files

### app.py

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1 import health
from core.config import settings
from db.database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, prefix="/api/v1", tags=["health"])
```

### db/database.py

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_session():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### api/schemas/_base.py

```python
from pydantic import BaseModel, ConfigDict


def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(word.capitalize() for word in components[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
```

### api/exceptions.py

```python
class DomainException(Exception):
    """Base domain exception"""
    pass


class NotFoundError(DomainException):
    """Resource not found"""
    pass


class ConflictError(DomainException):
    """Resource conflict (e.g., duplicate)"""
    pass


class ValidationError(DomainException):
    """Validation failed"""
    pass


class UnauthorizedError(DomainException):
    """Not authenticated"""
    pass


class ForbiddenError(DomainException):
    """Not authorized"""
    pass
```

## Post-Scaffold Instructions

```markdown
## Project Created Successfully!

### Files Created

{list of all created files}

### Setup Instructions

1. **Create virtual environment:**
   ```bash
   cd {project-name}
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or: venv\Scripts\activate  # Windows
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   # or with Poetry:
   poetry install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Initialize database:**
   ```bash
   alembic upgrade head
   ```

5. **Run the server:**
   ```bash
   uvicorn app:app --reload
   ```

6. **Visit:**
   - API: http://localhost:8000
   - Docs: http://localhost:8000/docs
   - Health: http://localhost:8000/health

### Next Steps

- [ ] **Create your first entity:**
      `/generate entity user`

- [ ] **Add authentication:**
      Already scaffolded if you selected JWT

- [ ] **Set up Docker:**
      `/scaffold docker`
```
