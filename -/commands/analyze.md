---
description: Analyze codebase, architecture, dependencies, or patterns
allowed-tools: Read, Glob, Grep, Bash
---

# Analyze Command

Analyze various aspects of your codebase.

## Usage

```
/analyze [target]
```

## Targets

| Target | Agent | Description |
|--------|-------|-------------|
| `codebase` | analyze/codebase | Full codebase analysis - structure, entities, health |
| `architecture` | analyze/architecture | System architecture, component relationships, data flow |
| `dependencies` | analyze/dependencies | Dependencies, versions, vulnerabilities |
| `patterns` | analyze/patterns | Coding patterns, conventions, styles |

## Examples

```bash
# Full codebase overview
/analyze codebase

# Architecture analysis
/analyze architecture

# Check for outdated/vulnerable dependencies
/analyze dependencies

# Document coding patterns
/analyze patterns
```

## Default Behavior

If no target specified, runs codebase analysis:

```bash
/analyze
# Equivalent to: /analyze codebase
```

## Process

1. **Detect project type** - FastAPI, Next.js, Docker, etc.
2. **Gather information** - Structure, files, patterns
3. **Analyze** - Based on target type
4. **Report** - Generate detailed report with recommendations

## Output

Each analysis produces a detailed markdown report including:
- Summary statistics
- Findings
- Recommendations
- Next steps
