# Batch Error Resolution Skill

Resolve runtime and compile-time errors as a batch operation, not iteratively.

## When to Use This Skill

Use this skill when:
- Build or compile fails with multiple errors
- Runtime crashes with multiple stack traces
- Test suite fails with multiple test failures
- Linter reports multiple violations
- Type checker reports multiple type errors

**Do NOT use for:** Single, isolated errors that can be fixed immediately.

## Core Principle

**Errors are batch operations, not iterative loops.**

Re-running compiler/tests after each fix wastes time and creates noise. Fix ALL errors first, then verify once.

## The Process

```
┌─────────────────────────────────────────────────────────────┐
│  1. COLLECT - Gather all errors from output                │
│     • List every error explicitly                          │
│     • Do NOT attempt fixes yet                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. ANALYZE - Study errors together                        │
│     • Identify shared root causes                          │
│     • Find dependency relationships between errors         │
│     • Spot opportunities for single-fix-multiple-errors    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. RESOLVE - Apply all fixes                              │
│     • Work on errors conceptually in parallel              │
│     • No partial or speculative fixes                      │
│     • Address every listed error                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. VERIFY - Single re-run after ALL fixes complete        │
│     • Only now run compiler/tests/linter                   │
│     • Confirm no new errors introduced                     │
└─────────────────────────────────────────────────────────────┘
```

## Strict Rules

### The Validation Rule

**Do NOT re-run:**
- Compiler
- Build tools
- Test suite
- Linter/type checker

**Until:** Every error in the collected list has been addressed.

### Prohibited Behaviors

| Don't Do | Why It's Wrong |
|----------|----------------|
| Fix one error, run tests, fix next | Wastes cycles, creates noise |
| Re-run checks after each fix | Same error cascade repeats |
| Ignore secondary/cascading errors | They may reveal root cause |
| Trial-and-error debugging | Undisciplined, slow |
| Speculative "maybe this fixes it" | Fix what you understand |

## Error Collection Format

When collecting errors, enumerate them explicitly:

```markdown
## Collected Errors (7 total)

1. **TypeError** at `src/utils.ts:45` - Cannot read property 'id' of undefined
2. **TypeError** at `src/utils.ts:52` - Same root cause (uses result from line 45)
3. **ImportError** at `src/index.ts:3` - Module './missing' not found
4. **SyntaxError** at `src/parser.ts:88` - Unexpected token '}'
5. **TypeError** at `src/api.ts:12` - Argument type mismatch
6. **TypeError** at `src/api.ts:34` - Related to #5 (same function signature)
7. **ESLint** at `src/helpers.ts:15` - 'unused' is defined but never used

### Analysis

- Errors #1 and #2: Same root cause - null check missing at line 45
- Errors #5 and #6: Same root cause - function signature changed
- Error #3: Independent - missing file
- Error #4: Independent - syntax issue
- Error #7: Independent - dead code
```

## Resolution Strategies

### Root Cause Grouping

Multiple errors often share a root cause:

```
10 type errors → 1 interface change
5 import errors → 1 renamed module
8 test failures → 1 broken fixture
```

Fix the root cause, not each symptom.

### Dependency Ordering

Some errors depend on others:

```
Error A: Function signature wrong
Error B: Call to function fails (depends on A)
Error C: Test of function fails (depends on A)
```

Fix A first. B and C may resolve automatically.

### Parallel Conceptualization

Work on independent errors mentally in parallel:

```
While fixing Error #1 in file A:
  - Note what Error #3 in file B needs
  - Note what Error #5 in file C needs

Then apply all fixes before re-running anything.
```

## Quick Reference

| Phase | Action | Output |
|-------|--------|--------|
| Collect | Run build/test once | Numbered error list |
| Analyze | Study relationships | Root causes identified |
| Resolve | Apply ALL fixes | All errors addressed |
| Verify | Single re-run | Clean or new error list |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| "Let me just run tests to see if that worked" | No. Complete all fixes first. |
| "This error might be related" | Don't guess. Analyze the full list. |
| "I'll fix the easy ones first" | Fix by root cause, not difficulty. |
| "The cascade is too long to read" | Read it. That's the job. |

## Benefits

- **Faster resolution** - No repeated build cycles
- **Reduced noise** - Cascading errors collapse when root cause fixed
- **Deterministic** - Same process every time
- **Disciplined** - No trial-and-error chaos
