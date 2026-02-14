---
description: Analyze codebase, architecture, dependencies, or patterns
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, task, skill
---

# Analyze Command

Analyze various aspects of your codebase.

## User Input

```text
$ARGUMENTS
```

Parse arguments: `/analyze [target]`

## Execution Flow

1. **Parse arguments**: Extract `target` from `$ARGUMENTS` (default: `codebase`)
2. **Load appropriate skill**:
   - `codebase` → `/skill project-architecture`
   - `architecture` → `/skill project-architecture`
   - `dependencies` → No specific skill needed
   - `patterns` → `/skill review-patterns`
3. **Execute analysis** with the loaded skill context

## Targets & Skills

| Target | Skill to Load | Description |
|--------|---------------|-------------|
| `codebase` | `project-architecture` | Full codebase analysis - structure, entities, health |
| `architecture` | `project-architecture` | System architecture, component relationships, data flow |
| `dependencies` | None | Dependencies, versions, vulnerabilities |
| `patterns` | `review-patterns` | Coding patterns, conventions, styles |

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
