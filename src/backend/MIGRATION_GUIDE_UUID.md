# UUID Migration Guide: Integer to UUID User References

## Overview

This migration converts all user foreign key references from `INTEGER` (referencing `users.id`) to `UUID` (referencing `users.uuid`) to support modern authentication system.

**Migration ID**: `ed06a1b6d932`
**Created**: 2025-12-04
**Type**: Breaking change - one-way migration
**Downtime**: Zero-downtime with temporary columns

## Affected Tables

| Table | Column(s) | Change |
|-------|-----------|--------|
| `chat_messages` | `sender_id` | int → UUID |
| `message_read_states` | `user_id` | int → UUID |
| `chat_read_monitors` | `user_id` | int → UUID |
| `user_sessions` | `user_id` | int → UUID |
| `service_requests` | `requester_id` | int → UUID |
| `user_roles` | `user_id` | int → UUID |
| `user_request_assigns` | `user_id` | int → UUID |
| `region_user_assigns` | `user_id` | int → UUID |
| `service_request_notes` | `created_by` | int → UUID |

## Pre-Migration Checklist

### 1. Create Database Backup

```bash
# Create full database backup
pg_dump -U servicecatalog -h localhost -p 5433 servicecatalog > backup_pre_uuid_migration_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file
ls -lh backup_pre_uuid_migration_*.sql
```

### 2. Run Pre-Migration Validation

```bash
psql -U servicecatalog -h localhost -p 5433 servicecatalog -f scripts/pre_migration_validation.sql
```

**Expected Results**:
- ✅ `users_without_uuid`: 0
- ✅ All `orphaned_*` counts: 0
- ✅ No duplicate constraint violations
- ⚠️ If `active_user_sessions > 0`: Consider maintenance window

### 3. Review Migration Script

```bash
# View the migration to understand what will happen
cat alembic/versions/2025_12_04_2215-ed06a1b6d932_migrate_user_references_to_uuid.py
```

### 4. Check Current Migration Status

```bash
uv run alembic current
# Should show: add_uuid_refresh_sessions (head)
```

## Running the Migration

### Development/Staging Environment

```bash
# Run migration
uv run alembic upgrade head

# Monitor output for any errors
# Migration includes progress prints for each table
```

### Production Environment

**Recommended Approach**: Blue-Green Deployment

```bash
# 1. Schedule maintenance window (optional but recommended)
# 2. Notify users of potential brief disruption
# 3. Run migration
uv run alembic upgrade head

# 4. Monitor logs
tail -f logs/app.log

# 5. Verify migration
psql -U servicecatalog -h localhost -p 5433 servicecatalog -f scripts/post_migration_validation.sql
```

## Post-Migration Validation

### 1. Run Validation Script

```bash
psql -U servicecatalog -h localhost -p 5433 servicecatalog -f scripts/post_migration_validation.sql
```

**Success Criteria**:
- ✅ All columns are UUID type
- ✅ All foreign keys reference `users.uuid`
- ✅ Record counts unchanged
- ✅ No NULL values
- ✅ All foreign key joins successful
- ✅ Unique constraints preserved
- ✅ Indexes recreated

### 2. Test Critical Functionality

```bash
# Start application
uvicorn main:app --reload

# Test chat functionality
curl -X POST http://localhost:8000/api/v1/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"request_id": "<uuid>", "content": "Test message"}'

# Test WebSocket connection
# Use WebSocket client to connect and verify user_id handling
```

### 3. Monitor Error Logs

```bash
# Check for any type-related errors
grep -i "operator does not exist.*uuid" logs/app.log
grep -i "ProgrammingError" logs/app.log
grep -i "type.*mismatch" logs/app.log
```

Expected: No errors

## Rollback Procedure

⚠️ **WARNING**: Downgrade is NOT supported for this migration.

**If migration fails mid-way**:

1. Check Alembic version:
   ```bash
   uv run alembic current
   ```

2. If stuck between versions:
   ```bash
   # Restore from backup
   psql -U servicecatalog -h localhost -p 5433 servicecatalog < backup_pre_uuid_migration_*.sql

   # Mark migration as not applied
   uv run alembic stamp add_uuid_refresh_sessions
   ```

3. Investigate error and fix before retrying

## Common Issues & Solutions

### Issue 1: Migration fails with "NULL user_uuid_temp"

**Cause**: Orphaned records exist (user_id references non-existent user)

**Solution**:
```sql
-- Find orphaned records
SELECT * FROM chat_messages cm
LEFT JOIN users u ON cm.sender_id = u.id
WHERE u.id IS NULL;

-- Delete or fix orphaned records before re-running migration
```

### Issue 2: Duplicate constraint violation

**Cause**: Duplicate records that violate unique constraints

**Solution**:
```sql
-- Find duplicates
SELECT user_id, role_id, COUNT(*)
FROM user_roles
GROUP BY user_id, role_id
HAVING COUNT(*) > 1;

-- Remove duplicates keeping most recent
DELETE FROM user_roles
WHERE id NOT IN (
    SELECT MIN(id)
    FROM user_roles
    GROUP BY user_id, role_id
);
```

### Issue 3: "PendingRollbackError" after migration

**Cause**: WebSocket sessions with failed transactions

**Solution**:
```python
# Already fixed in websocket/routes.py and websocket/chat_routes.py
# Update includes explicit session rollback on errors
```

## Code Changes Required

### ✅ Already Completed

1. **SQLModel Definitions** (`models/database_models.py`):
   - All affected models updated to use `UUID` type
   - Foreign keys now reference `users.uuid`

2. **WebSocket Error Handling** (`websocket/*.py`):
   - Added explicit rollback handling
   - Wrapped all `update_online_status` calls with try-except

### ⚠️ May Need Updates

1. **Service Layer Queries**:
   - Most queries should work automatically with SQLAlchemy
   - Check for any raw SQL queries using integer IDs

2. **API Responses**:
   - Check Pydantic schemas - should auto-convert UUID to string in JSON
   - Verify camelCase conversion in `HTTPSchemaModel`

3. **Frontend Code**:
   - Update any hardcoded type checks
   - Ensure UUID strings are properly handled

## Performance Considerations

### Index Performance

All indexes have been recreated on UUID columns. UUID indexes are:
- ✅ Equally fast for equality lookups
- ✅ Support for B-tree indexing
- ⚠️ Slightly larger storage (16 bytes vs 4 bytes per value)

### Query Performance

```sql
-- Before: Integer comparison
WHERE user_id = 123

-- After: UUID comparison
WHERE user_id = '288029b4-64d4-4ecd-9821-17338909cc8d'::UUID

-- Performance: Nearly identical for indexed columns
```

## Migration Timeline

| Step | Estimated Time | Downtime |
|------|---------------|----------|
| Pre-migration validation | 5 minutes | None |
| Migration execution | 5-30 minutes* | None** |
| Post-migration validation | 5 minutes | None |
| Testing | 15 minutes | None |

\* Depends on data volume
\** Zero downtime due to temporary column approach

## Success Metrics

After migration completion, verify:

- [ ] All validation queries pass
- [ ] WebSocket connections establish successfully
- [ ] Chat messages can be sent and received
- [ ] User authentication works with UUID
- [ ] No type mismatch errors in logs
- [ ] Application performance unchanged

## Support & Troubleshooting

**If you encounter issues**:

1. Check migration logs for specific error messages
2. Review validation script output
3. Check application logs for runtime errors
4. Verify all WebSocket error handlers are updated
5. Ensure frontend code handles UUID strings

**For critical production issues**:

1. Don't panic - migration uses temporary columns
2. Check if migration completed (using `alembic current`)
3. Review backup restoration procedure
4. Contact database admin if needed

## Post-Migration Cleanup

After confirming migration success (recommended: 7 days):

```sql
-- No cleanup needed - temporary columns automatically dropped during migration
-- All old integer columns removed as part of migration
```

## Documentation Updates

Update these docs after migration:

- [ ] API documentation (UUID instead of integer for user_id)
- [ ] Database schema diagrams
- [ ] Development setup guides
- [ ] Webhook/integration documentation

## Version Compatibility

- **Minimum Backend Version**: Current HEAD after migration
- **Database Version**: PostgreSQL 12+ (UUID support)
- **Python**: 3.12+ (no changes needed)
- **Frontend**: Update user_id handling if TypeScript strict mode enabled

---

**Migration Author**: Claude Code Assistant
**Review Required**: Database Administrator, Backend Lead
**Approval Required**: Technical Lead before production deployment
