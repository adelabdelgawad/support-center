# Research: Fix Assignees List Update Bug

**Date**: 2026-01-08
**Branch**: 001-fix-assignees-update

## Executive Summary

Two bugs identified in the assignees management feature:

1. **UI State Bug**: Frontend SWR mutation incorrectly handles state update when server returns assignee data
2. **Notification Bug**: Backend `is_first_assignment` check intentionally blocks notifications for subsequent assignees

## Bug 1: UI State - Assignees Disappear After Adding New One

### Symptoms
- Request has User1 and User2 assigned
- User3 is added
- UI shows only User2 and User3 (User1 disappears)
- Page reload shows all three users correctly

### Root Cause Analysis

**Location**: `src/it-app/lib/hooks/use-request-assignees.ts:255-267`

```typescript
// Current code - PROBLEM: Maps over currentData.assignees, replacing matching entry
await mutate(
  (currentData) => {
    if (!currentData || !Array.isArray(currentData.assignees))
      return currentData;
    return {
      ...currentData,
      assignees: currentData.assignees.map((a) =>
        a.userId === technicianId ? actualAssignee : a
      ),
    };
  },
  { revalidate: false }
);
```

**Issue**: This `.map()` call is intended to replace the optimistic entry with server data, but:
1. The optimistic entry was already **appended** to the array (lines 202-222)
2. `.map()` only transforms existing entries - it cannot change array length
3. If `currentData.assignees` doesn't contain the technicianId yet (race condition), the actualAssignee is **not added**

**Why it appears to work sometimes**: The issue occurs when:
- The optimistic update at lines 202-222 succeeds
- But `currentData` in the second mutate (lines 255-267) references stale data without the optimistic entry
- This happens because `mutate()` callbacks can have stale closures

### Solution

The second `mutate()` call should:
1. Check if the assignee already exists (from optimistic update)
2. If exists: replace with server data (current behavior, correct)
3. If not exists: append the server data (missing case)

**Fix**:
```typescript
await mutate(
  (currentData) => {
    if (!currentData || !Array.isArray(currentData.assignees))
      return currentData;

    const existingIndex = currentData.assignees.findIndex(
      (a) => a.userId === technicianId
    );

    if (existingIndex >= 0) {
      // Replace optimistic entry with server data
      const newAssignees = [...currentData.assignees];
      newAssignees[existingIndex] = actualAssignee;
      return { ...currentData, assignees: newAssignees };
    } else {
      // Optimistic entry missing - append server data
      return {
        ...currentData,
        assignees: [...currentData.assignees, actualAssignee],
        total: currentData.total + 1,
      };
    }
  },
  { revalidate: false }
);
```

### Alternative: Simpler Revalidation Approach

Instead of complex cache manipulation, force SWR to revalidate:
```typescript
await mutate(); // Revalidate from server after successful add
```

**Trade-off**: Extra network request but guaranteed consistency.

**Decision**: Use the fix approach (no extra network request) since the pattern is already established.

---

## Bug 2: Notification Not Triggered for Subsequent Assignees

### Symptoms
- First assignee added → receives `ticket_assigned` notification
- Second assignee added → does NOT receive notification
- Third assignee added → does NOT receive notification

### Root Cause Analysis

**Location**: `src/backend/api/v1/endpoints/requests.py:969-1001`

```python
assignee_count_before = await ServiceRequestRepository.count_assignees(db, request_id)
is_first_assignment = (assignee_count_before == 0)

# ... assign technician ...

# Trigger ticket_assigned system message ONLY on first assignment
if is_first_assignment:
    try:
        from services.event_trigger_service import EventTriggerService
        from repositories.user_repository import UserRepository

        technician = await UserRepository.find_by_id(db, assign_data.technician_id)
        if technician:
            await EventTriggerService.trigger_ticket_assigned(
                db=db, request_id=request_id, technician=technician
            )
    except Exception as e:
        logger.warning(f"Failed to trigger ticket_assigned event: {e}")
```

**Issue**: The `if is_first_assignment:` check intentionally prevents notification for subsequent assignees.

**Historical Context**: This was likely a design decision to:
- Avoid spam when multiple technicians are assigned
- Only notify "the team" once when ticket is picked up

**Current Requirement (from spec)**: Each newly added assignee MUST receive their own notification (FR-003).

### Solution

Remove the `is_first_assignment` condition and always trigger notification for the newly added technician.

**Fix**:
```python
assignee_count_before = await ServiceRequestRepository.count_assignees(db, request_id)

# ... assign technician ...

# Trigger ticket_assigned notification for the newly added technician
try:
    from services.event_trigger_service import EventTriggerService
    from repositories.user_repository import UserRepository

    technician = await UserRepository.find_by_id(db, assign_data.technician_id)
    if technician:
        await EventTriggerService.trigger_ticket_assigned(
            db=db, request_id=request_id, technician=technician
        )
except Exception as e:
    logger.warning(f"Failed to trigger ticket_assigned event: {e}")
```

**Note**: The `is_first_assignment` variable is still used for status update logic (changing Open → In Progress), so keep that calculation but remove its use for notification gating.

---

## Additional Finding: Dropdown Filter (FR-008)

**Requirement**: Dropdown MUST only show users not already assigned.

**Current Implementation Check**:

The `TicketMetadataSidebar` component should filter out already-assigned users from the technician dropdown.

**Location to verify**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/ticket-metadata-sidebar.tsx`

The component receives `technicians` and `assignees` from context and should filter:
```typescript
const availableTechnicians = technicians.filter(
  (t) => !assignees.some((a) => a.userId === t.id)
);
```

**Status**: Needs verification during implementation.

---

## Files to Modify

| File | Change | Risk Level |
|------|--------|------------|
| `src/it-app/lib/hooks/use-request-assignees.ts` | Fix state mutation in `addAssignee` | Low |
| `src/backend/api/v1/endpoints/requests.py` | Remove `is_first_assignment` condition for notification | Low |
| `src/it-app/.../ticket-metadata-sidebar.tsx` | Verify/fix dropdown filtering | Low |

## Testing Checklist

### UI State Bug
- [ ] Assign User1 to empty request → UI shows User1
- [ ] Assign User2 → UI shows User1 AND User2 (no page reload)
- [ ] Assign User3 → UI shows all three users (no page reload)
- [ ] Refresh page → still shows all three users

### Notification Bug
- [ ] Assign User1 to empty request → User1 receives notification
- [ ] Assign User2 → User2 receives notification
- [ ] Assign User3 → User3 receives notification
- [ ] User1 and User2 do NOT receive duplicate notifications when User3 added

### Dropdown Filter
- [ ] With User1 assigned, dropdown shows all technicians EXCEPT User1
- [ ] With User1 and User2 assigned, dropdown excludes both
