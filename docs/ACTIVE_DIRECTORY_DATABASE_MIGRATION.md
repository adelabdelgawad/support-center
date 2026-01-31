# Active Directory Configuration Database Migration

## Overview
This document describes the migration of Active Directory configuration from environment variables to a database-backed system with encrypted password storage and admin UI.

## Motivation
- **Flexibility**: Support multiple AD configurations (primary, backup DCs)
- **Security**: Encrypted password storage using Fernet encryption
- **Manageability**: Admin UI for CRUD operations without deployment/restart
- **Testing**: Built-in connection testing before activation

## Architecture

### Backend Components

#### 1. Database Model (`models/database_models.py`)
```python
class ActiveDirectoryConfig(TableModel, table=True):
    id: UUID (PK)
    name: str (unique label, e.g. "Primary DC")
    path: str (LDAP server hostname)
    domain_name: str (e.g. "DOMAIN")
    port: int (default 389)
    use_ssl: bool (default True)
    ldap_username: str (service account)
    encrypted_password: str (Fernet-encrypted)
    base_dn: str (search base)
    desired_ous: JSON (list of OU names or ["*"])
    is_active: bool (only one active at a time)
    created_at: datetime
    updated_at: datetime
```

#### 2. Encryption (`core/encryption.py`)
- Uses `cryptography.fernet.Fernet` (already in dependencies)
- Derives encryption key from `settings.security.secret_key` via PBKDF2
- Functions:
  - `encrypt_value(plaintext: str) -> str`
  - `decrypt_value(ciphertext: str) -> str`

#### 3. Service Layer
- `active_directory_config_service.py`: CRUD operations with automatic encryption/decryption
- Modified `active_directory.py`:
  - `LdapService.from_db_config(config)`: Create instance from DB config
  - `get_ldap_service(db)`: Helper that loads active config from DB, falls back to env vars

#### 4. API Endpoints (`/api/v1/active-directory-configs`)
- `GET /` - List all configs
- `GET /active` - Get active config
- `POST /` - Create new config
- `PUT /{id}` - Update config
- `DELETE /{id}` - Delete config
- `POST /{id}/test` - Test connection
- All protected with `require_admin()` dependency

### Frontend Components

#### Page Structure
```
app/(it-pages)/admin/(admin-pages)/management/active-directory/
├── page.tsx                               # Server component (SSR)
├── _components/
│   ├── table/ad-configs-table.tsx        # Client state owner
│   ├── modal/add-ad-config-sheet.tsx     # Create form
│   └── modal/edit-ad-config-sheet.tsx    # Edit form
└── context/ad-config-actions-context.tsx # Actions provider
```

#### Features
- Create/Edit/Delete AD configurations
- Test connection before saving
- Toggle active config (only one active at a time)
- Password masking (shows placeholder when exists, only updates if changed)
- Form validation with zod

## Migration Strategy

### Phase 1: Add Database Support (Backward Compatible)
1. Add `ActiveDirectoryConfig` table via Alembic migration
2. Add encryption utilities
3. Keep `ActiveDirectorySettings` env vars as fallback
4. Seed initial config from env vars if present

### Phase 2: Update Service Layer
1. Modify `LdapService` to accept DB config or env vars
2. Update all callers:
   - `auth_service.py`
   - `domain_user_service.py`
   - `organizational_unit_service.py`
   - `ad_sync_tasks.py`

### Phase 3: Add Admin UI
1. Build frontend CRUD interface
2. Add connection testing feature

### Phase 4: Deprecate ENV (Future)
1. Document migration from env to DB
2. Eventually remove env fallback (breaking change)

## Security Considerations

### Encryption
- Password encrypted at rest using Fernet (symmetric encryption)
- Encryption key derived from `SECURITY_SECRET_KEY` (already required)
- Key derivation uses PBKDF2 with SHA256

### Access Control
- All endpoints require admin role (`require_admin()` dependency)
- Password never exposed in API responses (excluded from `Read` schema)
- Edit form only sends password if changed (frontend validation)

### Audit
- Timestamps track creation and updates
- Consider adding audit logs for config changes (future enhancement)

## Data Flow

### Configuration Loading
```
Service needs AD config
  ↓
Call get_ldap_service(db)
  ↓
Load active config from DB
  ↓ (if not found)
Fallback to env vars (ActiveDirectorySettings)
  ↓
Decrypt password
  ↓
Create LdapService instance
  ↓
Use for LDAP operations
```

### Connection Testing
```
Admin submits test request
  ↓
POST /api/v1/active-directory-configs/{id}/test
  ↓
Backend creates temporary LdapService
  ↓
Attempts LDAP bind
  ↓
Returns success/failure + error message
```

## Database Schema

### Migration File
- Filename: `YYYY_MM_DD_HHMM-<hash>_add_active_directory_config_table.py`
- Creates `active_directory_config` table
- Adds unique index on `name`
- Adds partial unique index on `is_active` (WHERE is_active = true)

### Seed Data
- `database_setup.py` adds `setup_active_directory_config()`
- Seeds from current `AD_*` env vars (if set and non-default)
- Encrypts password before storing
- Only seeds if table is empty

## API Examples

### Create Configuration
```bash
POST /api/v1/active-directory-configs
{
  "name": "Primary DC",
  "path": "dc.example.com",
  "domainName": "DOMAIN",
  "port": 389,
  "useSsl": true,
  "ldapUsername": "service_account",
  "password": "secret123",
  "baseDn": "DC=example,DC=com",
  "desiredOus": ["Users", "Staff"],
  "isActive": true
}
```

### Test Connection
```bash
POST /api/v1/active-directory-configs/{id}/test
Response:
{
  "success": true,
  "message": "Connection successful"
}
```

### Get Active Configuration
```bash
GET /api/v1/active-directory-configs/active
Response:
{
  "id": "uuid",
  "name": "Primary DC",
  "path": "dc.example.com",
  "domainName": "DOMAIN",
  "port": 389,
  "useSsl": true,
  "ldapUsername": "service_account",
  "hasPassword": true,  # password field excluded
  "baseDn": "DC=example,DC=com",
  "desiredOus": ["Users", "Staff"],
  "isActive": true,
  "createdAt": "2026-01-31T10:00:00Z",
  "updatedAt": "2026-01-31T10:00:00Z"
}
```

## Testing

### Backend Tests
```bash
# Unit tests for encryption
pytest tests/unit/test_encryption.py

# Integration tests for AD config CRUD
pytest tests/integration/test_ad_config.py

# Test connection endpoint
pytest tests/integration/test_ad_connection.py
```

### Frontend Tests
```bash
# Component tests
bun run test

# Build verification
bun run build
```

### Manual Testing
1. Create AD config via UI
2. Verify password is encrypted in database (check PostgreSQL directly)
3. Test connection works
4. Toggle active config
5. Verify LDAP service uses DB config instead of env vars

## Rollback Plan

If issues arise:
1. Set `is_active = false` on all DB configs (forces env var fallback)
2. Or run migration rollback: `alembic downgrade -1`
3. Service will automatically fall back to `ActiveDirectorySettings` from env

## Future Enhancements

1. **Multiple Active Configs**: Support failover/load balancing
2. **Config Validation**: Validate LDAP connection before allowing activation
3. **Audit Logging**: Track who changed configs and when
4. **Secret Management**: Integrate with external secret managers (HashiCorp Vault, AWS Secrets Manager)
5. **Config History**: Track config changes over time
6. **Health Monitoring**: Monitor active LDAP connections and auto-failover

## References

- CLAUDE.md: Project coding standards
- `docs/page-refactoring-architecture.md`: Frontend page patterns
- `core/schema_base.py`: HTTPSchemaModel for camelCase conversion
- `crud/base_repository.py`: Generic CRUD patterns
