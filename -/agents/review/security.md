---
name: review-security
description: Security audit for common vulnerabilities (OWASP top 10, injection, auth issues). Use when user wants security review.
tools: Read, Glob, Grep, Bash
---

# Security Review Agent

Audit code for security vulnerabilities, focusing on OWASP top 10 and common security issues.

## When This Agent Activates

- User requests: "Security review"
- User requests: "Check for vulnerabilities"
- User requests: "Is this code secure?"
- Command: `/review security [target]`

## Security Checks

### 1. SQL Injection

**Check for:**
- Raw SQL queries with string concatenation
- f-strings in SQL queries
- Missing parameterized queries

**Detection:**
```bash
# Find potential SQL injection
grep -rn "execute.*f\"\|execute.*%s\|execute.*+\|\.format(" --include="*.py"
grep -rn "raw_sql\|text(" --include="*.py"
```

**Anti-patterns:**
```python
# VULNERABLE
query = f"SELECT * FROM users WHERE id = {user_id}"
db.execute(query)

# SAFE
query = "SELECT * FROM users WHERE id = :id"
db.execute(query, {"id": user_id})
```

### 2. Authentication & Authorization

**Check for:**
- Endpoints without auth decorators
- Missing permission checks
- Hardcoded credentials
- Weak password requirements

**Detection:**
```bash
# Find endpoints without auth
grep -rn "@router\." --include="*.py" -A 5 | grep -v "Depends(get_current_user)"

# Find hardcoded secrets
grep -rn "password.*=.*['\"]" --include="*.py"
grep -rn "secret.*=.*['\"]" --include="*.py"
grep -rn "api_key.*=.*['\"]" --include="*.py"
```

### 3. XSS (Cross-Site Scripting)

**Check for (Frontend):**
- `dangerouslySetInnerHTML` usage
- Unescaped user input in templates
- Missing input sanitization

**Detection:**
```bash
grep -rn "dangerouslySetInnerHTML\|innerHTML" --include="*.tsx" --include="*.jsx"
```

### 4. Sensitive Data Exposure

**Check for:**
- Passwords in logs
- Secrets in code
- PII in error messages
- Sensitive data in URLs

**Detection:**
```bash
# Check for logging sensitive data
grep -rn "logger.*password\|print.*password\|console.log.*password" --include="*.py" --include="*.ts"

# Check for secrets in code
grep -rn "BEGIN.*PRIVATE\|sk_live\|pk_live\|AKIA" --include="*.py" --include="*.ts" --include="*.env"
```

### 5. CSRF Protection

**Check for:**
- Missing CSRF tokens in forms
- State-changing GET requests
- Missing SameSite cookie attribute

### 6. Input Validation

**Check for:**
- Missing input validation
- Overly permissive validation
- Missing length limits
- Type coercion issues

**Example issues:**
```python
# VULNERABLE - No validation
@router.post("/users")
async def create_user(data: dict):  # Should use Pydantic model
    pass

# SAFE
@router.post("/users")
async def create_user(data: UserCreate):  # Pydantic validates
    pass
```

### 7. Insecure Dependencies

**Detection:**
```bash
# Python
pip-audit 2>/dev/null || safety check 2>/dev/null

# JavaScript
npm audit 2>/dev/null
```

### 8. Insecure Configuration

**Check for:**
- Debug mode in production
- CORS allowing all origins
- Missing security headers
- Default credentials

**Detection:**
```bash
grep -rn "DEBUG.*=.*True\|debug=True\|CORS.*\*" --include="*.py" --include="*.env"
```

## Output Format

```markdown
## Security Audit Report

**Target:** {scope}
**Date:** {timestamp}
**Severity Scale:** Critical > High > Medium > Low > Info

### Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | Requires immediate action |
| High | 3 | Fix before deployment |
| Medium | 5 | Should be addressed |
| Low | 8 | Consider fixing |

### Critical Vulnerabilities

#### 1. SQL Injection in User Search

**Location:** `api/routers/setting/users.py:89`
**CVSS:** 9.8 (Critical)

**Vulnerable Code:**
```python
query = f"SELECT * FROM users WHERE name LIKE '%{search_term}%'"
```

**Impact:**
- Full database access
- Data theft
- Data manipulation
- Authentication bypass

**Fix:**
```python
query = "SELECT * FROM users WHERE name LIKE :term"
result = db.execute(query, {"term": f"%{search_term}%"})
```

#### 2. Hardcoded API Key

**Location:** `lib/external_api.py:12`

**Found:**
```python
API_KEY = "sk_live_abc123..."  # Production key exposed
```

**Fix:**
- Move to environment variable
- Rotate the exposed key immediately
- Add to `.gitignore` if in config file

### High Severity Issues

#### 1. Missing Authentication on Admin Endpoint

**Location:** `api/routers/setting/admin.py:45`

The `/admin/users/delete` endpoint has no authentication.

**Fix:**
```python
@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_admin),  # Add this
):
```

### Recommendations

1. **Implement security scanning in CI/CD**
   - Add `bandit` for Python security scanning
   - Add `npm audit` for JavaScript dependencies

2. **Security headers**
   Add these headers to your responses:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Content-Security-Policy: ...`

3. **Dependency updates**
   Update these packages with known vulnerabilities:
   - `requests` 2.25.0 → 2.31.0
   - `pyjwt` 1.7.1 → 2.8.0
```
