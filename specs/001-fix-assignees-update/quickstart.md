# Quickstart: Testing Assignees Update Bug Fixes

**Date**: 2026-01-08
**Branch**: 001-fix-assignees-update

## Prerequisites

- Backend server running (`uvicorn main:app --reload`)
- Frontend dev server running (`bun run dev` in `src/it-app/`)
- At least 3 technician users in the system
- Access to a test service request

## Test Scenarios

### Test 1: UI State Bug - Multiple Assignees Display

**Purpose**: Verify all assignees display correctly after adding without page reload.

**Steps**:

1. Navigate to a service request with no assignees:
   ```
   https://supportcenter.andalusiagroup.net/support-center/requests/{request-id}
   ```

2. Open the assignee dropdown in the sidebar

3. **Add first assignee** (User1):
   - Select User1 from dropdown
   - Confirm assignment
   - **Expected**: User1 appears in assignee list

4. **Add second assignee** (User2):
   - Select User2 from dropdown
   - Confirm assignment
   - **Expected**: User1 AND User2 both visible (no page reload)

5. **Add third assignee** (User3):
   - Select User3 from dropdown
   - Confirm assignment
   - **Expected**: User1, User2, AND User3 all visible (no page reload)

6. **Verify persistence**:
   - Refresh the page (F5)
   - **Expected**: All three users still displayed

**Pass Criteria**: All assignees remain visible after each addition without requiring page reload.

---

### Test 2: Notification Bug - All New Assignees Receive Notification

**Purpose**: Verify `ticket_assigned` notification triggers for every new assignee.

**Steps**:

1. Navigate to a service request with no assignees

2. Open browser DevTools → Network tab (filter by WebSocket/SignalR)

3. **Assign first technician** (User1):
   - Add User1 as assignee
   - **Expected**: `ticket_assigned` system message appears in chat
   - **Expected**: User1 receives notification (check their session or notification bell)

4. **Assign second technician** (User2):
   - Add User2 as assignee
   - **Expected**: `ticket_assigned` system message appears in chat for User2
   - **Expected**: User2 receives notification
   - **Expected**: User1 does NOT receive a duplicate notification

5. **Assign third technician** (User3):
   - Add User3 as assignee
   - **Expected**: `ticket_assigned` system message appears in chat for User3
   - **Expected**: User3 receives notification
   - **Expected**: User1 and User2 do NOT receive duplicate notifications

**Pass Criteria**: Each newly added technician receives exactly one notification.

---

### Test 3: Dropdown Filter - Already Assigned Users Hidden

**Purpose**: Verify dropdown only shows users not yet assigned.

**Steps**:

1. Navigate to a service request with User1 already assigned

2. Open the assignee dropdown:
   - **Expected**: User1 is NOT in the dropdown list
   - **Expected**: User2, User3, and other technicians ARE in the list

3. Add User2 as assignee

4. Open the dropdown again:
   - **Expected**: User1 and User2 are NOT in the dropdown
   - **Expected**: User3 and other technicians ARE in the list

**Pass Criteria**: Dropdown never shows already-assigned users.

---

### Test 4: Re-assignment Notification

**Purpose**: Verify removed-then-re-added assignee receives new notification.

**Steps**:

1. Start with User1 assigned to a request

2. Remove User1 from assignees

3. Re-add User1 as assignee:
   - **Expected**: User1 receives a new `ticket_assigned` notification
   - **Expected**: System message appears in chat

**Pass Criteria**: Re-added assignee receives fresh notification.

---

### Test 5: Edge Case - Rapid Multiple Additions

**Purpose**: Verify UI handles rapid consecutive additions.

**Steps**:

1. Navigate to an empty request

2. Rapidly add 3 assignees in quick succession (don't wait for UI to update):
   - Add User1
   - Immediately add User2
   - Immediately add User3

3. Wait for all operations to complete

4. **Expected**: All three users visible in the assignee list
5. **Expected**: Each user received exactly one notification

**Pass Criteria**: No dropped assignees, no duplicate notifications.

---

## Verification Commands

### Check Backend Logs
```bash
# Watch for notification triggers
tail -f logs/app.log | grep -i "ticket_assigned"
```

### Check Database
```sql
-- Count assignees for a request
SELECT COUNT(*) FROM request_assignees
WHERE request_id = 'your-request-uuid' AND is_deleted = false;

-- View all assignees
SELECT ra.*, u.username, u.full_name
FROM request_assignees ra
JOIN users u ON ra.assignee_id = u.id
WHERE ra.request_id = 'your-request-uuid' AND ra.is_deleted = false;
```

### Check Chat Messages for System Notifications
```sql
-- View ticket_assigned system messages
SELECT * FROM chat_messages
WHERE request_id = 'your-request-uuid'
AND sender_id IS NULL  -- System messages have no sender
ORDER BY created_at DESC;
```

## Rollback Plan

If issues are discovered:

1. **Frontend**: Revert changes to `use-request-assignees.ts`
2. **Backend**: Restore `is_first_assignment` condition in `requests.py`
3. No database migrations to rollback
