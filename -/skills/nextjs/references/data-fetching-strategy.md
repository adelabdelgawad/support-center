# Data Fetching Strategy Decision Framework

Choose the appropriate data fetching strategy based on your page's actual requirements.

## Decision Flowchart

```
Does this data need to refresh automatically?
│
├── NO → Strategy A: Simple Fetching (Default)
│        └── Use useState + server response updates
│
└── YES → Why does it need refresh?
          │
          ├── External systems modify data → Strategy B: SWR
          ├── Multiple users edit concurrently → Strategy B: SWR
          ├── Background jobs update status → Strategy B: SWR
          ├── Real-time dashboard/monitoring → Strategy B: SWR
          │
          └── What triggers the refresh?
              ├── Interval-based (polling)
              ├── Focus-based (tab regains focus)
              └── Manual only (user clicks refresh)
```

## Strategy Comparison

| Aspect | Strategy A (Simple) | Strategy B (SWR) |
|--------|---------------------|------------------|
| **Default?** | Yes | No (requires justification) |
| **State management** | `useState` | `useSWR` |
| **Auto refresh** | No | Configurable |
| **Cache** | None | Built-in |
| **Dependencies** | None | `swr` package |
| **Complexity** | Lower | Higher |
| **Best for** | Mutation-driven pages | Revalidation-driven pages |

## When to Use Each Strategy

### Strategy A: Simple Fetching (Default)

Use for pages where **data only changes via user actions**:

- Settings pages
- Admin configuration
- CRUD forms
- Entity management tables
- User profile pages
- Single-user workflows

**Key characteristic:** The user is the only source of data changes.

### Strategy B: SWR Fetching (Opt-in)

Use **only when justified** for pages where **data changes from external sources**:

- Dashboards with live statistics
- Multi-user collaborative editing
- Job/task status monitoring
- Notification feeds
- Real-time inventory tracking
- Shared reference data

**Key characteristic:** Data changes without user action (background jobs, other users, webhooks).

## Decision Questions

Before generating a page, ask:

### Question 1: Does this data need to refresh automatically?

Think about:
- Will the data change while the user is viewing the page?
- Are there external processes modifying this data?
- Do multiple users edit the same records?

**If NO** → Use Strategy A (Simple Fetching)
**If YES** → Continue to Question 2

### Question 2: Why does it need refresh?

Select all that apply:
- [ ] External systems modify data (webhooks, integrations)
- [ ] Multiple users edit same data concurrently
- [ ] Background jobs update status/progress
- [ ] Real-time monitoring/dashboard requirements
- [ ] Other: ___________ (document explicitly)

### Question 3: What triggers the refresh?

- **Interval-based**: Data should poll every N seconds
- **Focus-based**: Refetch when tab regains focus
- **Manual only**: User clicks refresh button (SWR provides caching benefits)

## Common Scenarios

| Page Type | Typical Strategy | Reason |
|-----------|------------------|--------|
| User settings | A (Simple) | Only user modifies their settings |
| Product management | A (Simple) | Admin actions drive changes |
| Order list | A (Simple) | Mutations via admin actions |
| Analytics dashboard | B (SWR) | Stats update from background jobs |
| Live inventory | B (SWR) | Multiple sources modify stock |
| Task queue monitor | B (SWR) | Background workers update status |
| Notification feed | B (SWR) | New items arrive externally |
| Collaborative document | B (SWR) | Multiple users editing |

## Implementation References

- **Strategy A**: See [simple-fetching-pattern.md](simple-fetching-pattern.md)
- **Strategy B**: See [swr-fetching-pattern.md](swr-fetching-pattern.md)

## Key Principle

**Start simple. Add complexity only when justified.**

Most pages in an admin/settings application don't need automatic revalidation. The user performs an action, the server responds, and the UI updates from that response. This is Strategy A.

SWR adds value when data changes independently of the current user's actions. If you can't clearly articulate why data would change without user action, use Strategy A.
