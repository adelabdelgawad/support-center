---
name: analyze-dependencies
description: Analyze project dependencies, versions, vulnerabilities, and upgrade recommendations.
tools: Read, Glob, Grep, Bash
---

# Dependency Analysis Agent

Analyze project dependencies including versions, vulnerabilities, and upgrade paths.

## When This Agent Activates

- User requests: "Check dependencies"
- User requests: "Are there any outdated packages?"
- User requests: "Security vulnerabilities in dependencies?"
- Command: `/analyze dependencies`

## Analysis Process

### 1. Dependency Inventory

**Python dependencies:**

```bash
# From requirements.txt
cat requirements.txt 2>/dev/null | grep -v "^#" | grep -v "^$"

# From pyproject.toml
cat pyproject.toml 2>/dev/null | grep -A 100 "\[tool.poetry.dependencies\]" | grep -B 100 "\[" | head -50

# Currently installed
pip freeze 2>/dev/null | head -30
```

**Node dependencies:**

```bash
# From package.json
cat package.json 2>/dev/null | jq '.dependencies, .devDependencies'

# Currently installed
npm list --depth=0 2>/dev/null | head -30
```

### 2. Version Check

**Check for outdated packages:**

```bash
# Python
pip list --outdated 2>/dev/null

# Node
npm outdated 2>/dev/null
```

### 3. Vulnerability Scan

```bash
# Python
pip-audit 2>/dev/null || safety check 2>/dev/null

# Node
npm audit 2>/dev/null
```

### 4. License Check

```bash
# Python
pip-licenses 2>/dev/null | head -30

# Node
npx license-checker --summary 2>/dev/null
```

## Output Format

```markdown
## Dependency Analysis Report

**Generated:** {timestamp}

### Summary

| Category | Python | Node |
|----------|--------|------|
| Total Dependencies | 45 | 78 |
| Direct Dependencies | 15 | 25 |
| Outdated | 8 | 12 |
| Vulnerabilities | 2 | 1 |
| License Issues | 0 | 0 |

### Python Dependencies

#### Core Dependencies

| Package | Current | Latest | Status |
|---------|---------|--------|--------|
| fastapi | 0.109.0 | 0.110.0 | Minor update |
| sqlalchemy | 2.0.25 | 2.0.28 | Patch update |
| pydantic | 2.5.3 | 2.6.1 | Minor update |
| celery | 5.3.6 | 5.3.6 | Up to date |
| alembic | 1.13.1 | 1.13.1 | Up to date |

#### Security Vulnerabilities

| Package | Version | Vulnerability | Severity | Fix |
|---------|---------|--------------|----------|-----|
| requests | 2.25.0 | CVE-2023-32681 | Medium | Upgrade to 2.31.0 |
| cryptography | 3.4.8 | CVE-2023-49083 | High | Upgrade to 41.0.6 |

### Node Dependencies

#### Core Dependencies

| Package | Current | Latest | Status |
|---------|---------|--------|--------|
| next | 15.0.0 | 15.0.2 | Patch update |
| react | 19.0.0 | 19.0.0 | Up to date |
| @tanstack/react-table | 8.11.0 | 8.12.0 | Minor update |
| swr | 2.2.4 | 2.2.4 | Up to date |
| nuqs | 1.17.0 | 1.19.0 | Minor update |

#### Security Vulnerabilities

| Package | Version | Vulnerability | Severity | Fix |
|---------|---------|--------------|----------|-----|
| postcss | 8.4.21 | Prototype pollution | Moderate | Upgrade to 8.4.31 |

### Dependency Graph

```
fastapi
├── starlette (0.36.3)
├── pydantic (2.5.3)
│   └── pydantic-core (2.14.6)
└── uvicorn (0.27.0)

sqlalchemy
├── greenlet (3.0.3)
└── typing-extensions (4.9.0)

next
├── react (19.0.0)
├── react-dom (19.0.0)
└── styled-jsx (5.1.6)
```

### Recommendations

#### High Priority (Security)

1. **Upgrade requests**
   ```bash
   pip install requests==2.31.0
   ```
   Fixes: CVE-2023-32681 (CRLF injection)

2. **Upgrade cryptography**
   ```bash
   pip install cryptography==41.0.6
   ```
   Fixes: CVE-2023-49083 (NULL pointer dereference)

3. **Upgrade postcss**
   ```bash
   npm install postcss@8.4.31
   ```
   Fixes: Prototype pollution

#### Medium Priority (Updates)

4. **Upgrade FastAPI**
   ```bash
   pip install fastapi==0.110.0
   ```
   New features: Improved OpenAPI docs, bug fixes

5. **Upgrade Next.js**
   ```bash
   npm install next@15.0.2
   ```
   Bug fixes and performance improvements

### Upgrade Commands

**Python (all safe updates):**
```bash
pip install --upgrade requests==2.31.0 cryptography==41.0.6 fastapi==0.110.0 sqlalchemy==2.0.28 pydantic==2.6.1
```

**Node (all safe updates):**
```bash
npm install postcss@8.4.31 next@15.0.2 @tanstack/react-table@8.12.0 nuqs@1.19.0
```

### Breaking Changes Warning

The following upgrades may have breaking changes:

| Package | From | To | Breaking Changes |
|---------|------|-----|------------------|
| pydantic | 2.5 → 2.6 | Minor | New validation behavior |

**Recommendation:** Review changelog before upgrading.

### License Summary

| License | Python | Node |
|---------|--------|------|
| MIT | 35 | 65 |
| Apache 2.0 | 8 | 10 |
| BSD | 2 | 3 |
| ISC | 0 | 0 |

No license conflicts detected.
```
