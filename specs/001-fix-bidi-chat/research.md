# Research Report: Bidirectional Chat Text Rendering

**Feature**: 001-fix-bidi-chat
**Date**: 2025-01-14
**Status**: Complete

## Overview

This document summarizes research findings for fixing bidirectional text rendering in the chat interface. The issue affects mixed Arabic/English messages where text becomes visually broken due to improper RTL/LTR handling.

---

## R-1: Chat Message Component Location ✅

### Finding

**it-app (Next.js web app)**:

Two primary components render chat messages:

| Component | File Path | Role |
|-----------|-----------|------|
| **LeftChatMessage** | `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/left-chat-message.tsx` | Renders messages from other users (requesters) |
| **RightChatMessage** | `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/right-chat-message.tsx` | Renders messages from current user (technicians) |

**requester-app (Tauri + SolidJS desktop app)**:

| Component | File Path | Role |
|-----------|-----------|------|
| **MessageBubble** | `src/requester-app/src/src/routes/ticket-chat.tsx` (lines 121-416) | Renders all message types with dynamic styling |

**Key Characteristics (it-app)**:
- Both it-app components use identical text rendering logic
- Message text is rendered in a `<p>` tag (lines 299 and 377)
- Components support: text content, screenshots, file attachments, timestamps
- Mobile responsive with adjusted spacing

**Key Characteristics (requester-app)**:
- MessageBubble uses dynamic styling based on `isOwnMessage`
- Message text rendered in `<p>` tag (line 372)
- SolidJS reactive components with signals
- Supports text, screenshots, file attachments

---

## R-2: Current Direction Handling ✅

### Finding

**it-app Current Implementation**:

**LeftChatMessage** (line 299):
```tsx
<p className="whitespace-pre-line wrap-break text-foreground m-0 leading-tight">
  {content}
</p>
```

**RightChatMessage** (line 377):
```tsx
<p className="whitespace-pre-line break-words text-white m-0 leading-tight text-right">
  {content}
</p>
```

**requester-app Current Implementation**:

**MessageBubble** (line 372):
```tsx
<p class="whitespace-pre-wrap break-words text-sm" classList={{ "mt-2": props.message.isScreenshot || !!hasFileAttachment() }}>
  {props.message.content}
</p>
```

### Issues Identified

1. **No `dir` attribute** (all apps): None of the three components (LeftChatMessage, RightChatMessage, MessageBubble) apply any text direction attribute
2. **Forced alignment** (it-app only): RightChatMessage uses `text-right` which forces right alignment for ALL content, regardless of language
3. **Browser default fallback**: Both apps rely entirely on browser defaults, which is inconsistent

### Root Cause

When mixed Arabic/English text is rendered without `dir="auto"`:
- Browser guesses direction based on first character
- May incorrectly apply direction to entire message
- Mixed scripts appear broken with words in wrong order

---

## R-3: Bubble Alignment Logic ✅

### Finding

**LeftChatMessage Layout** (line 211):
```tsx
<div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'} flex-row`}>
```
- Uses `flex-row` (left-to-right layout)
- Avatar on left, message on right

**RightChatMessage Layout** (line 257):
```tsx
<div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'} flex-row-reverse`}>
```
- Uses `flex-row-reverse` (right-to-left layout)
- Avatar on right, message on left

### Alignment vs Direction Independence

**Container alignment** (bubble position):
- Controlled by `flex-row` vs `flex-row-reverse` on parent container
- Independent of text direction inside message
- **No changes needed** - alignment works correctly

**Text direction** (reading order):
- Should be controlled by `dir` attribute on text content
- Currently missing
- **Needs to be added** without affecting alignment

### Critical Insight

The `text-right` class on RightChatMessage (line 377) is **incorrect** - it forces text alignment right regardless of language. This should be removed and replaced with proper `dir` handling.

---

## R-4: Browser BiDi Support ✅

### Decision

**Use HTML `dir="auto"` attribute**

### Rationale

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `dir="auto"` | - Browser-native Unicode BiDi Algorithm<br>- Automatic detection per element<br>- No JavaScript needed<br>- 100% browser support | - May not handle complex embeddings | ✅ **CHOSEN** |
| JavaScript detection | - Full control over logic | - Adds complexity<br>- Performance overhead<br>- Maintenance burden | ❌ Rejected |
| CSS `direction` | - Simple declaration | - Hardcoded per element<br>- Can't auto-detect | ❌ Rejected |
| CSS `unicode-bidi: plaintext` | - Per-paragraph direction | - Less consistent than `dir="auto"` | ❌ Rejected |

### Browser Compatibility

`dir="auto"` is supported in all modern browsers:
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

### Edge Cases Handled

The Unicode Bidirectional Algorithm (UBA) with `dir="auto"` correctly handles:
1. **Mixed scripts**: Arabic → English → Arabic
2. **Numbers**: Embedded in RTL/LTR text
3. **URLs and paths**: Maintains correct order
4. **Punctuation**: Placement based on context
5. **Emojis**: Treated as neutral, positioned by surrounding text

---

## R-5: Testing Strategy ✅

### Decision

**Manual browser testing + visual regression**

### Approach

| Test Type | Tool | Purpose |
|-----------|------|---------|
| **Manual testing** | Browser DevTools | Primary verification |
| **Visual regression** | Screenshots | Before/after comparison |
| **Cross-browser** | Chrome, Firefox, Safari, Edge | Compatibility check |

### Test Cases

1. **Arabic-only messages**: Verify RTL rendering
2. **English-only messages**: Verify LTR rendering
3. **Arabic → English**: First char Arabic, verify correct flow
4. **English → Arabic**: First char English, verify correct flow
5. **Multiple switches**: Arabic → English → Arabic → English
6. **Numbers**: "تم الطلب #123 completed"
7. **URLs**: "الملف في C:\Users\file.txt"
8. **Emojis**: "مرحبا 😀 Hello"
9. **Empty messages**: Verify no rendering errors
10. **Text selection**: Verify selection across boundaries
11. **Cursor navigation**: Verify arrow key behavior

### Performance Validation

- Measure page load time before/after (should be identical)
- Check for layout shifts (should be zero)
- Verify no re-rendering issues

---

## Summary

### Implementation Plan

| Change | File | Line | Action |
|--------|------|------|--------|
| Add `dir="auto"` | `it-app/.../left-chat-message.tsx` | 299 | Add to `<p>` tag |
| Add `dir="auto"` | `it-app/.../right-chat-message.tsx` | 377 | Add to `<p>` tag |
| Remove `text-right` | `it-app/.../right-chat-message.tsx` | 377 | Remove forced alignment |
| Add `dir="auto"` | `requester-app/src/routes/ticket-chat.tsx` | 372 | Add to `<p>` tag |
| Test | Both apps | - | Manual browser testing |

### Expected Outcome

- Mixed Arabic/English messages render correctly with proper text order
- Single-language messages maintain current behavior
- Chat bubble alignment (left/right positioning) unchanged
- Zero performance impact
- No backend changes required

### Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing messages | Test with Arabic-only and English-only |
| Layout shifts | CSS `text-right` removal already planned |
| Browser inconsistencies | Cross-browser testing planned |

---

## References

- [MDN: dir attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir)
- [Unicode Bidirectional Algorithm](https://unicode.org/reports/tr9/)
- [CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties)
