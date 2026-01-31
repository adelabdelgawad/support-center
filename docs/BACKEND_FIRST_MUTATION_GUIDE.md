# Backend-First Mutation Pattern Guide

## Overview

This guide explains how to replace optimistic updates with backend-first mutations for critical operations, improving data consistency and reducing bugs from failed optimistic updates.

## Current Pattern (Optimistic Updates)

**Current approach using SWR with optimistic updates:**

```typescript
// Current pattern - RISKY for critical operations
const { mutate } = useSWR('/api/users');

async function updateUser(userId: string, data: UserUpdate) {
  // Optimistically update UI before server confirms
  mutate(
    async (users) => {
      // Update local cache immediately
      const updated = users.map(u => u.id === userId ? { ...u, ...data } : u);

      // Call backend (might fail!)
      await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });

      return updated; // Return optimistic data
    },
    {
      optimisticData: /* ... */,
      rollbackOnError: true // Rollback if fails - but UI already showed success!
    }
  );
}
```

**Problems:**
- User sees success before server confirms
- If server fails, rollback looks like a bug
- Race conditions with concurrent updates
- Incorrect data shown during network issues
- Confusing UX when optimistic update is rolled back

## Backend-First Pattern (Recommended for Critical Operations)

**New approach - wait for server confirmation:**

```typescript
// Backend-first pattern - SAFE for critical operations
const { data: users, mutate, isValidating } = useSWR('/api/users');
const [isUpdating, setIsUpdating] = useState(false);

async function updateUser(userId: string, data: UserUpdate) {
  setIsUpdating(true);

  try {
    // 1. Call backend FIRST
    const response = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Update failed');
    }

    const updatedUser = await response.json();

    // 2. Update cache with SERVER response (not optimistic guess)
    mutate(
      (users) => users.map(u => u.id === userId ? updatedUser : u),
      { revalidate: false } // No need to revalidate - we have fresh data
    );

    // 3. Show success AFTER server confirms
    toast.success('User updated successfully');
  } catch (error) {
    // 4. Show error without confusing rollback
    toast.error('Failed to update user');
  } finally {
    setIsUpdating(false);
  }
}

// UI shows loading state
return (
  <button onClick={() => updateUser(user.id, data)} disabled={isUpdating}>
    {isUpdating ? 'Updating...' : 'Update User'}
  </button>
);
```

**Benefits:**
- User sees accurate loading state
- Success only shown when server confirms
- No confusing rollbacks
- Server data is source of truth
- Better error handling

## When to Use Each Pattern

### Use Backend-First (Conservative) ✅

**Critical operations that cannot fail silently:**
- User management (create, update, delete, block)
- Permission changes (roles, access control)
- Financial transactions
- Permanent deletions
- Status changes with workflow implications
- Configuration changes
- Audit-logged operations

**Example operations:**
```typescript
// User management
updateUser()           // ✅ Backend-first
deleteUser()          // ✅ Backend-first
blockUser()           // ✅ Backend-first
changeUserRole()      // ✅ Backend-first

// Permissions
updatePermissions()   // ✅ Backend-first
revokeAccess()       // ✅ Backend-first

// Service requests
closeRequest()        // ✅ Backend-first
reassignRequest()     // ✅ Backend-first
```

### Use Optimistic Updates (Aggressive) ⚠️

**Non-critical operations where instant feedback is important:**
- Toggling UI preferences (theme, language)
- Marking items as read/unread
- Adding/removing from favorites
- Reordering lists
- Typing indicators
- Presence status
- Chat messages (with proper retry)

**Example operations:**
```typescript
// UI preferences
toggleTheme()          // ⚠️ Optimistic OK
markAsRead()          // ⚠️ Optimistic OK
addToFavorites()      // ⚠️ Optimistic OK

// Chat (with retry logic)
sendMessage()         // ⚠️ Optimistic OK (with retry)
```

## Implementation Guide

### Step 1: Identify Critical Operations

Audit your codebase for mutations:

```bash
# Find all SWR mutate calls
grep -r "mutate(" src/it-app/lib

# Find all fetch calls with POST/PUT/PATCH/DELETE
grep -rE "fetch.*method.*['\"]P(OST|UT|ATCH)|DELETE" src/it-app
```

**Prioritize by risk:**
1. User/permission management
2. Request lifecycle changes
3. Configuration updates
4. Deletions

### Step 2: Create Backend-First Hooks

Create reusable hooks in `lib/hooks/`:

```typescript
// lib/hooks/use-backend-first-mutation.ts
import { useState } from 'react';
import { KeyedMutator } from 'swr';
import { toast } from 'sonner';

interface UseMutationOptions<T, R> {
  mutate: KeyedMutator<T[]>;
  mutationFn: (data: R) => Promise<T>;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
  updateCache?: (oldData: T[], newData: T) => T[];
}

export function useBackendFirstMutation<T, R>({
  mutate,
  mutationFn,
  onSuccess,
  onError,
  successMessage = 'Operation successful',
  errorMessage = 'Operation failed',
  updateCache,
}: UseMutationOptions<T, R>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const trigger = async (data: R) => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Call backend FIRST
      const result = await mutationFn(data);

      // 2. Update cache with server response
      if (updateCache) {
        mutate(
          (oldData) => updateCache(oldData || [], result),
          { revalidate: false }
        );
      } else {
        // Revalidate to get fresh data
        mutate();
      }

      // 3. Show success
      toast.success(successMessage);

      // 4. Callback
      onSuccess?.(result);

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      toast.error(errorMessage);
      onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { trigger, isLoading, error };
}
```

**Usage:**
```typescript
// components/user-form.tsx
import { useBackendFirstMutation } from '@/lib/hooks/use-backend-first-mutation';

function UserForm({ user }: { user: User }) {
  const { data: users, mutate } = useSWR('/api/users');

  const { trigger: updateUser, isLoading } = useBackendFirstMutation({
    mutate,
    mutationFn: async (data: UserUpdate) => {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Update failed');
      return await response.json();
    },
    successMessage: 'User updated successfully',
    errorMessage: 'Failed to update user',
    updateCache: (users, updatedUser) =>
      users.map(u => u.id === updatedUser.id ? updatedUser : u),
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      updateUser({ email: 'new@email.com' });
    }}>
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Updating...' : 'Update User'}
      </button>
    </form>
  );
}
```

### Step 3: Update Existing Components

**Before (Optimistic):**
```typescript
// ❌ OLD: Optimistic update
const { mutate } = useSWR('/api/users');

const deleteUser = async (userId: string) => {
  mutate(
    async (users) => {
      const filtered = users.filter(u => u.id !== userId);
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      return filtered; // Optimistic
    },
    {
      optimisticData: (users) => users.filter(u => u.id !== userId),
      rollbackOnError: true,
    }
  );
};
```

**After (Backend-First):**
```typescript
// ✅ NEW: Backend-first
const { data: users, mutate } = useSWR('/api/users');
const [isDelet, setIsDeleting] = useState(false);

const deleteUser = async (userId: string) => {
  setIsDeleting(true);

  try {
    // 1. Call backend FIRST
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Delete failed');

    // 2. Update cache AFTER success
    mutate(
      (users) => users.filter(u => u.id !== userId),
      { revalidate: false }
    );

    // 3. Show success
    toast.success('User deleted successfully');
  } catch (error) {
    toast.error('Failed to delete user');
  } finally {
    setIsDeleting(false);
  }
};
```

### Step 4: Update UI Components

Add loading states to all mutation buttons:

```typescript
// Before: No loading state
<button onClick={updateUser}>Update</button>

// After: Clear loading state
<button onClick={updateUser} disabled={isUpdating}>
  {isUpdating ? (
    <>
      <LoadingSpinner className="mr-2" />
      Updating...
    </>
  ) : (
    'Update'
  )}
</button>
```

### Step 5: Add Confirmation Dialogs

For destructive operations:

```typescript
import { AlertDialog } from '@/components/ui/alert-dialog';

const { trigger: deleteUser, isLoading } = useBackendFirstMutation({
  // ... config ...
});

return (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant="destructive">Delete User</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete the user.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => deleteUser(userId)}
          disabled={isLoading}
        >
          {isLoading ? 'Deleting...' : 'Delete'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
```

## Migration Checklist

### Critical Operations to Update

- [ ] User management
  - [ ] Create user
  - [ ] Update user
  - [ ] Delete user
  - [ ] Block/unblock user
  - [ ] Change roles

- [ ] Permission management
  - [ ] Update permissions
  - [ ] Revoke access
  - [ ] Change role assignments

- [ ] Service requests
  - [ ] Close request
  - [ ] Reassign request
  - [ ] Change status
  - [ ] Update priority

- [ ] Configuration
  - [ ] Update settings
  - [ ] Change SLA configs
  - [ ] Modify business units

## Testing Strategy

1. **Manual testing:**
   - Test with network throttling
   - Test with backend errors
   - Test concurrent updates
   - Test navigation during updates

2. **Automated tests:**
   - Unit test mutation hooks
   - Integration test mutation flows
   - E2E test critical operations

3. **Error scenarios:**
   - Network timeout
   - Server 500 error
   - Validation error
   - Concurrent modification

## Performance Considerations

**Backend-first is slightly slower (perceived):**
- Optimistic: ~50ms (instant feedback)
- Backend-first: ~200-500ms (network + server)

**Mitigation strategies:**
1. Show skeleton loaders during mutations
2. Disable buttons during updates
3. Use progress indicators
4. Pre-validate on client side

## Documentation Updates

Update `docs/SWR_MIGRATION_AND_STATE_MANAGEMENT_GUIDE.md`:

```markdown
## Mutation Patterns

### Backend-First (Critical Operations)
Use for user management, permissions, deletions.

### Optimistic Updates (Non-Critical)
Use for UI preferences, read status, favorites.
```

## Summary

**Backend-first pattern provides:**
- Better data consistency
- Clearer error handling
- No confusing rollbacks
- More predictable UX
- Safer for critical operations

**Tradeoff:**
- Slightly slower perceived performance
- More code (loading states, error handling)

**Recommendation:**
Use backend-first for critical operations, optimistic for UI enhancements.
