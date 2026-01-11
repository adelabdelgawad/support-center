# Feature Specification: Fix Assignees List Update Bug

**Feature Branch**: `001-fix-assignees-update`
**Created**: 2026-01-08
**Status**: Complete
**Input**: User description: "Looking into support ticket - if Assignees contains User1 and User2, if User3 is added to the list it shows only User3 and User2 - User1 is removed. When the page is reloaded it shows all 3 users correctly. Additionally, the system ticket_assigned notification is not triggered when the Assignees list is updated with a new added technician - it is working only for the first time."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct Assignees Display After Update (Priority: P1)

As a supervisor or agent viewing a service request, when I add a new technician to the assignees list, I need to see all assigned technicians (both existing and newly added) displayed correctly without having to reload the page.

**Why this priority**: This is a data integrity issue from the user's perspective. Users see incorrect data (missing assignee) which undermines trust in the system and could lead to confusion about who is actually assigned to a ticket.

**Independent Test**: Can be fully tested by assigning multiple technicians to a request and verifying all names appear in the UI immediately after each update.

**Acceptance Scenarios**:

1. **Given** a service request with User1 and User2 already assigned, **When** I add User3 to the assignees list, **Then** the UI displays all three users (User1, User2, and User3) immediately without requiring a page reload.

2. **Given** a service request with multiple assignees displayed, **When** I add another assignee, **Then** the newly added assignee appears in the list alongside all existing assignees.

3. **Given** a service request with one assignee, **When** I add a second assignee, **Then** both assignees are displayed correctly in the list.

---

### User Story 2 - Notification for All New Assignees (Priority: P1)

As a technician being newly assigned to a service request, I need to receive a notification when I am added as an assignee, regardless of whether I am the first assignee or a subsequent addition.

**Why this priority**: Technicians who don't receive assignment notifications may miss tickets assigned to them, leading to delayed responses and poor customer service.

**Independent Test**: Can be fully tested by assigning a technician to a request that already has other assignees and verifying the notification is triggered.

**Acceptance Scenarios**:

1. **Given** a service request with no assignees, **When** User1 is added as the first assignee, **Then** User1 receives a ticket_assigned notification.

2. **Given** a service request with User1 already assigned, **When** User2 is added as a new assignee, **Then** User2 receives a ticket_assigned notification.

3. **Given** a service request with User1 and User2 already assigned, **When** User3 is added as a new assignee, **Then** only User3 receives a ticket_assigned notification (existing assignees do not receive duplicate notifications).

---

### Edge Cases

- Duplicate assignment prevention: The assignee selection dropdown MUST only display users who are not already assigned to the request.
- When an assignee is removed and then re-added, they MUST receive a new ticket_assigned notification (treated as fresh assignment).
- What happens when multiple assignees are added simultaneously (bulk assignment)? All new assignees should appear in the list and each should receive a notification.
- What happens if the user adding assignees loses network connection mid-update? The UI should reflect the actual server state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all assigned technicians in the assignees list immediately after any update operation, without requiring a page reload.
- **FR-002**: System MUST preserve existing assignees when adding new assignees to a service request.
- **FR-003**: System MUST trigger the ticket_assigned notification for each newly added technician, regardless of whether other technicians are already assigned.
- **FR-004**: System MUST only send ticket_assigned notifications to newly added assignees, not to existing assignees who were already assigned.
- **FR-005**: System MUST maintain UI state consistency with the server-side data after assignee list updates.
- **FR-006**: System MUST update the local state/cache to reflect all assignees after a successful update operation.
- **FR-007**: System MUST send a ticket_assigned notification when a previously removed technician is re-added to a request (treat as fresh assignment).
- **FR-008**: System MUST filter the assignee selection dropdown to only show users who are not currently assigned to the request.

### Key Entities

- **Service Request**: The support ticket that has an assignees list; can have zero or more assigned technicians.
- **Assignee**: A technician (user with AGENT role) who is assigned to handle a service request.
- **Notification (ticket_assigned)**: A system notification sent to users when they are assigned to a ticket.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of assignee additions result in correct display of all assignees without page reload.
- **SC-002**: 100% of newly added assignees receive ticket_assigned notification within 5 seconds of assignment.
- **SC-003**: Zero instances of existing assignees disappearing from the UI after adding new assignees.
- **SC-004**: Zero duplicate notifications sent to existing assignees when new assignees are added.
- **SC-005**: Assignee list accurately reflects server state at all times after update operations.

## Clarifications

### Session 2026-01-08

- Q: Should a technician receive a new ticket_assigned notification when they are removed and later re-added? → A: Yes, send notification on re-add (treat as fresh assignment)
- Q: How should the system handle attempts to add an already-assigned technician? → A: Dropdown menu only shows not-yet-assigned users (prevent at UI level)

## Assumptions

- The ticket_assigned notification system is already implemented and working for first-time assignments.
- The assignees list update endpoint returns the complete updated list of assignees.
- Users have appropriate permissions to modify assignee lists (supervisor or agent role).
- WebSocket or polling mechanism exists for real-time notification delivery.
