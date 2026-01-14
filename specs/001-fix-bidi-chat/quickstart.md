# Quickstart Guide: Fix Bidirectional Chat Text Rendering

**Feature**: 001-fix-bidi-chat
**Date**: 2025-01-14

---

## Overview

This guide provides step-by-step instructions to implement the bidirectional text fix for mixed Arabic/English chat messages. The fix involves adding `dir="auto"` attributes to message text containers in both the **it-app** (Next.js web) and **requester-app** (Tauri desktop) applications.

---

## Files to Modify

### it-app (Next.js Web Application)

| File | Path | Line | Change |
|------|------|------|--------|
| LeftChatMessage | `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/left-chat-message.tsx` | 299 | Add `dir="auto"` |
| RightChatMessage | `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/right-chat-message.tsx` | 377 | Add `dir="auto"`, remove `text-right` |

### requester-app (Tauri Desktop Application)

| File | Path | Line | Change |
|------|------|------|--------|
| MessageBubble | `src/requester-app/src/src/routes/ticket-chat.tsx` | 372 | Add `dir="auto"` |

---

## Implementation Steps

### Step 1: Fix it-app LeftChatMessage

**File**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/left-chat-message.tsx`

**Locate** line 299:
```tsx
<p className="whitespace-pre-line wrap-break text-foreground m-0 leading-tight">
  {content}
</p>
```

**Replace with**:
```tsx
<p dir="auto" className="whitespace-pre-line wrap-break text-foreground m-0 leading-tight">
  {content}
</p>
```

**Change**: Added `dir="auto"` attribute

---

### Step 2: Fix it-app RightChatMessage

**File**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/right-chat-message.tsx`

**Locate** line 377:
```tsx
<p className="whitespace-pre-line break-words text-white m-0 leading-tight text-right">
  {content}
</p>
```

**Replace with**:
```tsx
<p dir="auto" className="whitespace-pre-line break-words text-white m-0 leading-tight">
  {content}
</p>
```

**Changes**:
1. Added `dir="auto"` attribute
2. **Removed `text-right`** class (this was forcing incorrect alignment for Arabic text)

---

### Step 3: Fix requester-app MessageBubble

**File**: `src/requester-app/src/src/routes/ticket-chat.tsx`

**Locate** line 372:
```tsx
<p class="whitespace-pre-wrap break-words text-sm" classList={{ "mt-2": props.message.isScreenshot || !!hasFileAttachment() }}>
  {props.message.content}
</p>
```

**Replace with**:
```tsx
<p dir="auto" class="whitespace-pre-wrap break-words text-sm" classList={{ "mt-2": props.message.isScreenshot || !!hasFileAttachment() }}>
  {props.message.content}
</p>
```

**Change**: Added `dir="auto"` attribute

---

## CSS Considerations

### Text Alignment vs Text Direction

**Important**: Text alignment (`text-left`, `text-right`) is separate from text direction (`dir`).

- **Alignment**: Controls the position of text within the container (left/right/center)
- **Direction**: Controls the reading order and character flow (LTR/RTL/auto)

**Why we removed `text-right`**:
- The `text-right` class was forcing ALL text in right-aligned bubbles to align right
- For Arabic text, this is correct (RTL text should align right)
- For English text, this is incorrect (LTR text should align left)
- The `dir="auto"` attribute allows the browser to determine appropriate alignment based on content

**Expected behavior after fix**:
- Arabic messages → text aligns right (natural RTL behavior)
- English messages → text aligns left (natural LTR behavior)
- Mixed messages → browser handles alignment based on first strong directional character

---

## Testing Checklist

### Test Cases

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 1 | Arabic-only message | Renders right-to-left, text aligns right | ☐ |
| 2 | English-only message | Renders left-to-right, text aligns left | ☐ |
| 3 | Arabic → English | First character Arabic, correct flow | ☐ |
| 4 | English → Arabic | First character English, correct flow | ☐ |
| 5 | Multiple switches (Ar→En→Ar→En) | Each segment flows correctly | ☐ |
| 6 | Numbers in RTL ("تم #123") | Numbers positioned correctly | ☐ |
| 7 | URL/Path ("C:\Users\file") | Path maintains correct order | ☐ |
| 8 | Emoji at boundary ("مرحبا 😀") | Emoji positioned correctly | ☐ |
| 9 | Empty message | No rendering errors | ☐ |
| 10 | Text selection | Selection highlights correct characters | ☐ |
| 11 | Cursor navigation | Arrow keys move through text correctly | ☐ |

### Cross-Browser Testing

Test in all supported browsers:
- ☐ Chrome/Edge (Chromium)
- ☐ Firefox
- ☐ Safari (if available)

### Application Testing

Test in both applications:
- ☐ **it-app**: Web browser at `http://localhost:3010`
- ☐ **requester-app**: Tauri desktop app

---

## Verification Commands

### Start it-app for testing

```bash
cd src/it-app
bun run dev
```

Navigate to: `http://localhost:3010/support-center/requests/[any-request-id]`

### Start requester-app for testing

```bash
cd src/requester-app
npm run tauri dev
```

---

## Rollback Procedure

If issues occur, revert changes:

```bash
git checkout src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/left-chat-message.tsx
git checkout src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/right-chat-message.tsx
git checkout src/requester-app/src/src/routes/ticket-chat.tsx
```

---

## Performance Validation

Before deployment, verify:

1. **Page load time**: Should be identical (measure with DevTools Performance tab)
2. **Layout shifts**: Should be zero (check for CLS in Lighthouse)
3. **Re-rendering**: No unnecessary component re-renders

---

## Success Criteria

Fix is successful when:
- ✅ 100% of mixed Arabic/English messages render with correct text order
- ✅ 100% of single-language messages display identically to before
- ✅ Zero increase in page load time
- ✅ Zero layout shifts
- ✅ All cross-browser tests pass
- ✅ Both applications (it-app and requester-app) work correctly

---

## Support

For issues or questions:
1. Check browser console for errors
2. Verify `dir="auto"` is present in DOM inspector
3. Test with simple mixed messages first (e.g., "Hello مرحبا")
4. Check for conflicting CSS that overrides direction

---

## References

- [MDN: dir attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir)
- [Unicode Bidirectional Algorithm](https://unicode.org/reports/tr9/)
- Feature Spec: [spec.md](spec.md)
- Research Report: [research.md](research.md)
