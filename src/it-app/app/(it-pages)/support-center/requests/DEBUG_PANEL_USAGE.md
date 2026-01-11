# Layout Debug Panel - Usage Guide

## Overview

The Layout Debug Panel is now integrated into the **Support Center → Requests** page to help debug sidebar toggle layout issues in real-time.

## How to Access

1. **Navigate to:** `http://arc-webapp-01.andalusiagroup.net:3010/support-center/requests`
2. **Look for the button** in the bottom-right corner: **"Show Debug"**
3. **Click it** to open the debug panel

## Features

### Real-Time Measurements
- **Left Navigation Sidebar** width (from actual app layout)
- **Views Sidebar** width (274px ↔ 0px)
- **Main Content** width
- **Content Body** width
- **Table Wrapper** width
- **Table Container** width
- **Table Actual** width
- **Pagination** width
- **Viewport** width

### Automatic Issue Detection

The panel automatically detects and warns about:
- ⚠️ Table wider than container but no scrollbar
- ⚠️ Main content overflow
- ⚠️ Content body overflow
- ⚠️ Pagination overflow
- ❌ Table container has overflow-x: hidden (should be auto)
- ⚠️ Table wrapper missing overflow-x: hidden (should have it)

### Visual Indicators

- **Green borders** = Sidebar expanded/visible
- **Orange borders** = Sidebar collapsed/hidden
- **Red warning box** = Layout issues detected
- **Green success box** = No issues detected

### Buttons

- **"Show Debug"** / **"Hide Debug"** - Toggle panel visibility
- **"Measure"** - Force immediate remeasurement
- **X button** - Close the panel

## How to Use

### Testing Sidebar Toggles

1. **Open the debug panel** (click "Show Debug")
2. **Toggle the left navigation sidebar** using the hamburger icon (top-left)
   - Watch the "Left Nav (REAL)" value change (256px ↔ 48px)
3. **Toggle the views sidebar** (if there's a toggle button)
   - Watch the "Views Sidebar" value change (274px ↔ 0px)
4. **Check for issues** in the red warning box
5. **Verify scrollbar status**:
   - "Has Horizontal Scrollbar: YES ✓" = Good!
   - "Has Horizontal Scrollbar: NO ✗" = Problem!

### Reading the Measurements

**Sidebar States (Top Section):**
```
┌─────────────────────┐  ┌─────────────────────┐
│ Left Nav (REAL)     │  │ Views Sidebar       │
│ 256px               │  │ 274px               │
│ Expanded            │  │ Visible             │
└─────────────────────┘  └─────────────────────┘
```

**Container Widths:**
- Viewport: Total browser width
- Main Content: Available space after sidebars
- Content Body: Grid container width
- Table Wrapper: Wrapper with padding
- Table Container: Scrollable area
- **Table Actual: The actual table width (important!)**
- Pagination: Footer width

**Space Calculation:**
```
Viewport: 1920px
- Left Nav: -256px
- Views Sidebar: -274px
= Available: 1390px

Main Content Width: 1390px ✓ (should match!)
```

### Console Logging

When the panel is visible, measurements are logged to console on every toggle:

```
🔍 Production Layout Measurements
  Left Nav (REAL): 256 px
  Views Sidebar: 274 px
  Main Content: 1390 px
  ...
```

## Troubleshooting

### If scrollbar is missing:

1. Check "Has Horizontal Scrollbar: NO ✗"
2. Look for warning: "Table wider than container but no scrollbar!"
3. Check if "Table wrapper missing overflow-x: hidden!" appears
4. Verify Table Actual > Table Container (should be true for wide tables)

### If pagination is clipped:

1. Look for warning: "Pagination overflow: XXXpx > YYYpx body"
2. Check Pagination width vs Content Body width
3. Should have `min-w-0` class on pagination container

### If layout jumps during animation:

1. Check if Left Nav and Views Sidebar both transition at 200ms
2. Look for "Main content overflow" warnings during transition
3. Verify all containers have `min-w-0` where needed

## Implementation Details

### Data Attributes Added

The debug panel finds elements using `data-debug` attributes:

```tsx
data-debug="views-sidebar"     // TicketsSidebar component
data-debug="main-content"      // Main content grid
data-debug="content-body"      // Content body grid
data-debug="table-wrapper"     // Table wrapper div
data-debug="pagination"        // Pagination container
```

The table container is found using `.scrollbar-fluent-always` class.

### Files Modified

1. **`tickets-page-client.tsx`**
   - Added data-debug attributes
   - Imported and rendered LayoutDebugPanel

2. **`tickets-sidebar.tsx`**
   - Added data-debug="views-sidebar" to aside element

3. **`layout-debug-panel.tsx`** (NEW)
   - Debug panel component
   - Real-time measurements
   - Issue detection

## Removing the Debug Panel

If you want to remove it from production:

**Option 1: Environment-based (Recommended)**
```tsx
{process.env.NODE_ENV === 'development' && (
  <LayoutDebugPanel viewsSidebarVisible={sidebarVisible} />
)}
```

**Option 2: Complete removal**
Just delete/comment out this line in `tickets-page-client.tsx`:
```tsx
<LayoutDebugPanel viewsSidebarVisible={sidebarVisible} />
```

## Best Practices

1. **Always close the panel** when not debugging (to avoid confusion)
2. **Use "Measure" button** if measurements seem stale
3. **Check console** for detailed logs during troubleshooting
4. **Test both sidebars** together to catch interaction issues
5. **Verify after code changes** to ensure layout is still correct

## Related Documentation

- **Fix Summary:** `/SIDEBAR_TOGGLE_FIX_SUMMARY.md`
- **Scrolling Fix:** `src/it-app/SCROLLING_FIX_SUMMARY.md`
- **Test Page:** Navigate to `/test` for isolated testing

---

**Status:** ✅ Active on production page
**Location:** Bottom-right corner (floating button)
**Performance Impact:** Minimal (only measures when panel is open)
