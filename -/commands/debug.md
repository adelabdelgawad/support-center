---
description: Debug errors, analyze logs, or profile performance
allowed-tools: Read, Glob, Grep, Bash
---

# Debug Command

Debug various issues in your application.

## Usage

```
/debug [type]
```

## Types

| Type | Agent | Description |
|------|-------|-------------|
| `error` | debug/error-diagnosis | Diagnose errors and stack traces |
| `logs` | debug/log-analysis | Analyze application logs |
| `performance` | debug/performance-profiling | Profile performance bottlenecks |
| `api` | debug/api-debugging | Debug API requests/responses |

## Examples

```bash
# Diagnose an error (paste error after command)
/debug error
# Then paste your error/stack trace

# Analyze logs
/debug logs

# Profile performance
/debug performance

# Debug API issues
/debug api
```

## Debug Process

### Error Diagnosis

1. **Parse** - Extract error type, message, location
2. **Analyze** - Read related code
3. **Identify** - Find root cause
4. **Suggest** - Provide fix options

### Log Analysis

1. **Discover** - Find log files
2. **Extract** - Find errors, warnings, patterns
3. **Analyze** - Group by type, frequency, time
4. **Report** - Provide insights and recommendations

### Performance Profiling

1. **Identify** - Target endpoint or function
2. **Profile** - Add timing, analyze queries
3. **Measure** - Break down time by component
4. **Optimize** - Suggest improvements

### API Debugging

1. **Capture** - Request and response details
2. **Analyze** - Status codes, headers, body
3. **Diagnose** - Find issue (auth, CORS, validation, etc.)
4. **Fix** - Provide solution

## Debug Output

Each debug session produces:
- Problem identification
- Root cause analysis
- Code context
- Solution options
- Prevention recommendations

## Quick Debug Commands

```bash
# Check recent errors
/debug logs | grep error

# Profile specific endpoint
/debug performance GET /setting/products

# Debug CORS issue
/debug api cors

# Debug 500 error
/debug api 500
```
