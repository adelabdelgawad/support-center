# Tickets Page Layout Architecture

## Overview
This page uses a **CSS Grid-based layout** for simplicity and maintainability. No complex nested flexbox chains - just clear, predictable grid layouts.

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ layout.tsx (h-svh - 100% viewport height)              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ <main> grid grid-rows-[auto 1fr]                   │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ Row 1: TicketsHeader (auto height)             │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ Row 2: Content (1fr - fills remaining space)   │ │ │
│ │ │   grid grid-rows-[auto 1fr auto]               │ │ │
│ │ │   ┌───────────────────────────────────────────┐ │ │ │
│ │ │   │ Row 1: Business Units + Filters (auto)   │ │ │ │
│ │ │   └───────────────────────────────────────────┘ │ │ │
│ │ │   ┌───────────────────────────────────────────┐ │ │ │
│ │ │   │ Row 2: Scrollable Table (1fr)            │ │ │ │
│ │ │   │   ▲ Scrolls when content exceeds height  │ │ │ │
│ │ │   │   │ Header stays sticky at top            │ │ │ │
│ │ │   └───────────────────────────────────────────┘ │ │ │
│ │ │   ┌───────────────────────────────────────────┐ │ │ │
│ │ │   │ Row 3: Pagination (auto, conditional)    │ │ │ │
│ │ │   └───────────────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Key Files

### `tickets-page-client.tsx` (lines 287-347)
**Purpose:** Main layout container with two grids

**Grid 1 (Main):**
```tsx
<main className="flex-1 min-h-0 grid grid-rows-[auto_1fr]">
  {/* Row 1 (auto): TicketsHeader */}
  {/* Row 2 (1fr): Content body */}
</main>
```

**Grid 2 (Content Body):**
```tsx
<div className="bg-card grid grid-rows-[auto_1fr_auto]">
  {/* Row 1 (auto): Business units + filters */}
  {/* Row 2 (1fr): Scrollable table area */}
  {/* Row 3 (auto): Pagination (conditional) */}
</div>
```

### `tickets-table.tsx` (line 60)
**Purpose:** Scrollable table with sticky header

```tsx
<div className="h-full border border-border rounded-md overflow-y-auto scrollbar-fluent-always">
  <table className="w-full caption-bottom text-sm">
    <thead className="sticky top-0 z-10 bg-background">
      {/* Table header - stays visible during scroll */}
    </thead>
    <tbody>
      {/* Table rows - scrolls when exceeding height */}
    </tbody>
  </table>
</div>
```

## How Scrolling Works

1. **Parent Layout (layout.tsx):** Sets total viewport height with `h-svh`
2. **Main Grid:** Splits space between header (auto) and content (1fr)
3. **Content Grid:** Splits space between filters (auto), table (1fr), pagination (auto)
4. **Table Container:** Fills its grid row with `h-full` and enables scrolling with `overflow-y-auto`
5. **Result:** Table scrolls when rows exceed available height, while header/pagination stay fixed

## Common Modifications

### Change Table Height
Adjust the grid row template in `tickets-page-client.tsx` line 300:

```tsx
// Give more space to table (increase 1fr, decrease auto areas)
<div className="grid grid-rows-[auto_2fr_auto]"> {/* table gets 2fr */}

// Give less space to table
<div className="grid grid-rows-[auto_minmax(300px,1fr)_auto]"> {/* min 300px */}
```

### Add Section Above Table
Update grid template in `tickets-page-client.tsx` line 300:

```tsx
<div className="grid grid-rows-[auto_auto_1fr_auto]">
  {/* Row 1: Existing filters */}
  {/* Row 2: New section (auto) */}
  {/* Row 3: Scrollable table (1fr) */}
  {/* Row 4: Pagination (auto) */}
</div>
```

### Customize Scrollbar
Edit `globals.css` lines 592-620 (`.scrollbar-fluent-always` class):

```css
.scrollbar-fluent-always::-webkit-scrollbar {
  width: 12px; /* Change scrollbar width */
}

.scrollbar-fluent-always::-webkit-scrollbar-thumb {
  background-color: hsl(var(--primary) / 0.5); /* Change color */
}
```

### Make Header Non-Sticky
Remove sticky positioning in `tickets-table.tsx` line 62:

```tsx
<thead className="z-10 bg-background [&_tr]:border-b">
  {/* Remove: sticky top-0 */}
</thead>
```

## Benefits of This Approach

✅ **Simple:** Two grids, no nested flex chains with `flex-1 min-h-0` everywhere
✅ **Predictable:** Grid rows explicitly define layout behavior
✅ **Maintainable:** Clear comments + this README for future developers
✅ **Debuggable:** Each grid row has clear purpose and constraints
✅ **Flexible:** Easy to add/remove/resize sections by changing grid template

## Troubleshooting

### Table Not Scrolling?
1. Check parent has `overflow-hidden` (line 321)
2. Verify table div has `h-full` (line 60 in tickets-table.tsx)
3. Ensure content grid has `grid-rows-[auto_1fr_auto]` (line 300)

### Pagination Overlapping Table?
1. Verify content grid has 3 rows (auto, 1fr, auto)
2. Check pagination is in Row 3 (after table)
3. Ensure table container doesn't have `overflow: visible`

### Header Not Sticky?
1. Verify thead has `sticky top-0` (line 62 in tickets-table.tsx)
2. Check thead has `z-10` for proper layering
3. Ensure thead has `bg-background` to hide rows underneath

## Previous Issues (Resolved)

❌ **Complex nested flexbox** - Replaced with CSS Grid
❌ **Multiple `flex-1 min-h-0` chains** - Simplified to grid row templates
❌ **Unclear layout hierarchy** - Now documented with ASCII diagram
❌ **Hard to modify** - Now easy with grid template changes
❌ **Scrollbar not visible** - Fixed with proper overflow and height constraints
