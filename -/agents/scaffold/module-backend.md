---
name: scaffold-module-backend
description: Scaffold a backend module (auth, file upload, email, etc.) in an existing FastAPI project.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Backend Module Scaffold Agent

Add pre-built modules to an existing FastAPI project (authentication, file uploads, email, etc.).

## When This Agent Activates

- User requests: "Add authentication to backend"
- User requests: "Scaffold file upload module"
- User requests: "Add email sending"
- Command: `/scaffold backend-module [module]`

## Available Modules

### Authentication Module

```markdown
## Authentication Module Configuration

**Module:** JWT Authentication

### Options

**1. Token Storage**
- [ ] HTTP-only cookies (recommended)
- [ ] Bearer token in header

**2. Token Expiry**
- Access token: ___ minutes (default: 15)
- Refresh token: ___ days (default: 7)

**3. Features**
- [ ] Email verification
- [ ] Password reset
- [ ] OAuth2 providers (Google, GitHub)
- [ ] Rate limiting on auth endpoints

### Files to Create

| File | Purpose |
|------|---------|
| `api/routers/setting/auth_router.py` | Auth endpoints (login, register, refresh) |
| `api/services/auth_service.py` | Auth business logic |
| `api/schemas/auth_schema.py` | Auth DTOs |
| `core/security.py` | JWT utilities |
| `api/dependencies.py` | get_current_user dependency |
```

### File Upload Module

```markdown
## File Upload Module Configuration

**Module:** File Uploads

### Storage Backend

- [ ] Local filesystem
- [ ] AWS S3
- [ ] MinIO (S3-compatible)
- [ ] Google Cloud Storage

### Options

**1. Allowed Types**
- [ ] Images only (jpg, png, gif, webp)
- [ ] Documents (pdf, doc, docx)
- [ ] All files
- [ ] Custom: ___________

**2. Size Limits**
- Max file size: ___ MB (default: 10)
- Max total upload: ___ MB (default: 50)

**3. Features**
- [ ] Image resizing
- [ ] Thumbnail generation
- [ ] Virus scanning
- [ ] Pre-signed URLs

### Files to Create

| File | Purpose |
|------|---------|
| `api/routers/setting/file_router.py` | Upload/download endpoints |
| `api/services/file_service.py` | File handling logic |
| `api/schemas/file_schema.py` | File DTOs |
| `core/storage.py` | Storage backend abstraction |
```

### Email Module

```markdown
## Email Module Configuration

**Module:** Email Sending

### Provider

- [ ] SMTP (generic)
- [ ] SendGrid
- [ ] AWS SES
- [ ] Mailgun
- [ ] Resend

### Options

**1. Template Engine**
- [ ] Jinja2 templates (recommended)
- [ ] Plain text only

**2. Features**
- [ ] HTML emails
- [ ] Attachments
- [ ] Template management
- [ ] Email queue (Celery)

### Files to Create

| File | Purpose |
|------|---------|
| `api/services/email_service.py` | Email sending logic |
| `core/email.py` | Email provider abstraction |
| `templates/email/` | Email templates |
```

### Pagination Module

```markdown
## Pagination Module

**Module:** Pagination Utilities

### Files to Create

| File | Purpose |
|------|---------|
| `api/schemas/pagination.py` | Pagination schemas |
| `api/utils/pagination.py` | Pagination helpers |

### Generated Code

```python
# api/schemas/pagination.py
from typing import Generic, TypeVar, List
from pydantic import BaseModel

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    limit: int
    pages: int

    @classmethod
    def create(cls, items: List[T], total: int, page: int, limit: int):
        return cls(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=(total + limit - 1) // limit,
        )
```
```

### Logging Module

```markdown
## Logging Module

**Module:** Structured Logging

### Options

**1. Format**
- [ ] JSON (recommended for production)
- [ ] Plain text (development)

**2. Outputs**
- [ ] Console
- [ ] File
- [ ] External service (Datadog, etc.)

**3. Features**
- [ ] Request ID tracking
- [ ] User ID in logs
- [ ] Performance timing

### Files to Create

| File | Purpose |
|------|---------|
| `core/logging.py` | Logging configuration |
| `api/middleware/logging.py` | Request logging middleware |
```

## Module Generation

After configuration, generate the module files following the patterns from skills and include proper integration with the existing codebase.

## Post-Scaffold Instructions

```markdown
## Module Added Successfully!

### Files Created

{list of created files}

### Integration

The module has been integrated with your existing project:
- Dependencies added to requirements.txt
- Environment variables documented in .env.example
- Router registered in `core/app_setup/routers_group/setting_routers.py` (if applicable)

### Next Steps

{module-specific instructions}
```
