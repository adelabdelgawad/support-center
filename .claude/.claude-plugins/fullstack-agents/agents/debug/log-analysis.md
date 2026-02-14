---
name: debug-log-analysis
description: Analyze application logs to identify patterns, errors, and issues.
tools: Read, Glob, Grep, Bash
---

# Log Analysis Agent

Analyze application logs to identify error patterns, performance issues, and anomalies.

## When This Agent Activates

- User requests: "Analyze the logs"
- User requests: "Check logs for errors"
- User requests: "What's happening in the logs?"
- Command: `/debug logs`

## Log Analysis Process

### 1. Log Discovery

```bash
# Find log files
find . -name "*.log" -o -name "*.txt" | grep -i log
ls -la logs/ 2>/dev/null
ls -la /var/log/ 2>/dev/null | head -20

# Check Docker logs
docker compose logs --tail=100 2>/dev/null
```

### 2. Error Extraction

```bash
# Find errors in logs
grep -i "error\|exception\|failed\|critical" logs/*.log | tail -50

# Find specific error types
grep -i "traceback\|raise\|Error:" logs/*.log | tail -30

# Count error occurrences
grep -c -i "error" logs/*.log
```

### 3. Pattern Analysis

```bash
# Group errors by type
grep -oh "Error: [^:]*\|Exception: [^:]*" logs/*.log | sort | uniq -c | sort -rn

# Find error frequency over time
grep -i "error" logs/*.log | cut -d' ' -f1-2 | uniq -c

# Find slow requests
grep -i "took [0-9]*ms\|duration" logs/*.log | sort -t'=' -k2 -rn | head -20
```

## Output Format

```markdown
## Log Analysis Report

**Period:** Last 24 hours
**Log Files Analyzed:** 5
**Total Lines:** 45,678

### Error Summary

| Error Type | Count | Last Occurrence |
|------------|-------|-----------------|
| ConnectionError | 45 | 2 min ago |
| ValidationError | 23 | 15 min ago |
| TimeoutError | 12 | 1 hour ago |
| KeyError | 8 | 3 hours ago |

### Top Error Patterns

#### 1. Database Connection Errors (45 occurrences)

**Pattern:**
```
ERROR - ConnectionError: Can't connect to PostgreSQL at db:5432
```

**Occurrences:**
- First: 2024-01-15 08:23:45
- Last: 2024-01-15 14:56:12
- Peak: 2024-01-15 10:00-10:30 (32 errors)

**Likely Cause:**
- Database connection pool exhausted
- Database restart/maintenance window
- Network issues between services

**Recommendation:**
- Check database health: `docker compose exec postgres pg_isready`
- Check connection pool settings
- Review connection limit in `database.py`

#### 2. Validation Errors (23 occurrences)

**Pattern:**
```
ERROR - ValidationError: 1 validation error for UserCreate
email
  value is not a valid email address (type=value_error.email)
```

**Source Endpoints:**
- POST /setting/users (15 errors)
- POST /setting/auth/register (8 errors)

**Recommendation:**
- Add frontend email validation
- Review API documentation for clients
- Consider adding detailed error messages

### Performance Anomalies

#### Slow Requests

| Endpoint | Avg Time | Max Time | Count |
|----------|----------|----------|-------|
| GET /setting/products | 2.3s | 8.5s | 156 |
| POST /setting/orders | 1.8s | 4.2s | 89 |
| GET /setting/reports | 5.6s | 15.3s | 12 |

**Recommendation:**
- Review `/setting/products` for N+1 queries
- Add caching for `/setting/products`
- Consider async processing for `/setting/reports`

### Request Patterns

#### Traffic Distribution

| Hour | Requests | Errors | Error Rate |
|------|----------|--------|------------|
| 08:00 | 1,234 | 12 | 0.97% |
| 09:00 | 2,456 | 45 | 1.83% |
| 10:00 | 3,789 | 89 | 2.35% |
| 11:00 | 2,123 | 23 | 1.08% |

**Observation:**
Peak error rate at 10:00 coincides with peak traffic. Database connection pool may be undersized.

### Warnings

Found 156 warning messages:

| Warning | Count | Notes |
|---------|-------|-------|
| Deprecated API usage | 89 | `datetime.utcnow()` deprecated |
| Missing index hint | 34 | Query performance warning |
| Rate limit approaching | 33 | External API rate limit |

### Recommendations

1. **Immediate Actions:**
   - Increase database connection pool size
   - Add caching for product listing
   - Fix deprecated `datetime.utcnow()` calls

2. **Short-term:**
   - Add request rate limiting
   - Implement circuit breaker for external APIs
   - Add query optimization for slow endpoints

3. **Monitoring:**
   - Set up alerts for error rate > 2%
   - Add dashboard for connection pool usage
   - Track P95 latency per endpoint

### Log Commands

Useful commands for further investigation:

```bash
# Live error monitoring
tail -f logs/app.log | grep -i error

# Find errors in time range
grep "2024-01-15 10:" logs/app.log | grep -i error

# Count requests per endpoint
grep "POST\|GET\|PUT\|DELETE" logs/access.log | cut -d' ' -f6 | sort | uniq -c | sort -rn

# Find slow requests over 1 second
grep -E "took [1-9][0-9]{3,}ms" logs/app.log
```
```
