# Environment Variables Structure

## Overview

This project uses **Docker Compose variable substitution** to maintain a **single source of truth** for shared secrets across all services.

## Architecture

```
Root .env (Single Source of Truth)
├── POSTGRES_DB             → Used by: postgres, backend
├── POSTGRES_USER           → Used by: postgres, backend
├── POSTGRES_PASSWORD       → Used by: postgres, backend
├── REDIS_PASSWORD          → Used by: backend, redis
├── JWT_SECRET_KEY          → Used by: backend, frontend, signalr
├── SESSION_SECRET          → Used by: backend, frontend
├── TURN_SECRET             → Used by: backend, coturn
└── SIGNALR_INTERNAL_API_KEY → Used by: backend, signalr

Service-Specific .env Files (docker/env/)
├── .env.backend            → Backend service variables
├── .env.frontend           → Frontend service variables
├── .env.postgres           → PostgreSQL variables
├── .env.redis              → Redis cache variables
├── .env.minio              → MinIO object storage variables
└── .env.coturn             → TURN server variables
```

## How It Works

1. **Root `.env`** contains all shared secrets
2. **Service `.env` files** reference shared variables using `${VARIABLE_NAME}`
3. **Docker Compose** reads root `.env` and substitutes variables before passing to containers

### Example Flow

```bash
# Root .env
REDIS_PASSWORD=oAUyrGGhDBaq9539u4nwjoUyTbbwC9Dr

# docker/env/.env.backend (uses reference)
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

# docker/env/.env.redis (uses reference)
REDIS_PASSWORD=${REDIS_PASSWORD}

# Docker Compose resolves to:
REDIS_URL=redis://:oAUyrGGhDBaq9539u4nwjoUyTbbwC9Dr@redis:6379/0
REDIS_PASSWORD=oAUyrGGhDBaq9539u4nwjoUyTbbwC9Dr
```

## Benefits

✅ **Single source of truth** - Change secrets in ONE place
✅ **No duplication** - Each secret stored only once
✅ **DRY principle** - Don't Repeat Yourself
✅ **Less error-prone** - Can't forget to update one location
✅ **Standard Docker practice** - Official Docker Compose pattern

## Shared Variables Reference

| Variable | Used By Services | Purpose |
|----------|-----------------|---------|
| `POSTGRES_DB` | postgres, backend | PostgreSQL database name |
| `POSTGRES_USER` | postgres, backend | PostgreSQL database user |
| `POSTGRES_PASSWORD` | postgres, backend | PostgreSQL database password |
| `REDIS_PASSWORD` | backend, redis | Redis authentication password |
| `JWT_SECRET_KEY` | backend, frontend, signalr | JWT token signing/verification |
| `SESSION_SECRET` | backend, frontend | Session management encryption |
| `TURN_SECRET` | backend, coturn | WebRTC/TURN server authentication |
| `SIGNALR_INTERNAL_API_KEY` | backend, signalr | SignalR internal API authentication |

## Adding New Shared Variables

When adding a variable that's used by **2 or more services**:

1. Add variable to **root `.env`**:
   ```bash
   NEW_SHARED_SECRET=value123
   ```

2. Reference in **service `.env` files**:
   ```bash
   NEW_SHARED_SECRET=${NEW_SHARED_SECRET}
   ```

3. Update this document with the new variable

## Service-Specific Variables

Variables used by **only one service** should remain in that service's `.env` file:
- Database credentials (`.env.postgres`)
- MinIO access keys (`.env.minio`)
- TURN network settings (`.env.coturn`)
- Backend/frontend-specific settings (`.env.backend`, `.env.frontend`)

## Security Notes

⚠️ **Never commit** actual `.env` files with real secrets to git
⚠️ **Use `.env.example.*` files** as templates
⚠️ **Rotate secrets** periodically by updating root `.env` only
⚠️ **Keep backups** of root `.env` in secure location

## Verification

To verify all shared variables are using references:

```bash
# Check root .env has all shared variables
cat .env | grep -E "^[A-Z_]+="

# Check service env files use ${VAR} references
grep -r "\${.*}" docker/env/.env.*
```
