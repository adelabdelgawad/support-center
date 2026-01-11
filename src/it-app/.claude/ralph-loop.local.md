# SignalR Investigation Report: RoomJoined Warning & Remote Session Race Condition

## Investigation Summary

**Date:** 2026-01-06
**Status:** FIXED

---

## Issue 1: `RoomJoined` Warning

### Root Cause
- **Server:** `ChatHub.cs:76` emits `RoomJoined` to the caller when they successfully join a room
- **Client:** `it-app/lib/signalr/signalr-manager.ts` did NOT register a handler for `RoomJoined`
- **Result:** SignalR SDK logs warning: `No client method with the name 'roomjoined' found`

### Fix Applied
Added handler in `signalr-manager.ts:348-355`:
```typescript
// Room join/leave confirmations from server
this.connection.on('RoomJoined', (requestId: string) => {
  console.log(`[SignalR:${this.hubType}] Room joined confirmation for ${requestId?.substring(0, 8)}...`);
});

this.connection.on('RoomLeft', (requestId: string) => {
  console.log(`[SignalR:${this.hubType}] Room left confirmation for ${requestId?.substring(0, 8)}...`);
});
```

---

## Issue 2: Remote Session Join Race Condition

### Root Cause Analysis

The race condition occurred due to multiple interrelated issues:

1. **Stale React state check in `joinSession`:**
   - Used `signalingState !== 'connected'` (React state)
   - React state updates are async and may not reflect actual hub state

2. **Unreliable `setTimeout(100)` hack:**
   - Original code: `await new Promise(resolve => setTimeout(resolve, 100))`
   - Fixed delay doesn't guarantee connection readiness
   - Connection establishment time varies based on network

3. **Early return in `connect()` based on React state:**
   - `if (signalingState === 'connected')` could return early
   - But actual hub might still be connecting

4. **`invoke()` failure on not-yet-ready connection:**
   - `signalRRemoteAccess.invoke()` checks `isConnected()` which validates BOTH:
     - Manager state: `this.state === SignalRState.CONNECTED`
     - Actual hub state: `this.connection?.state === HubConnectionState.Connected`
   - If either fails, throws `Error: Not connected to SignalR`

### Fix Applied

#### A. Added `waitForConnected()` method to `SignalRHubManager` (signalr-manager.ts:116-155):
```typescript
async waitForConnected(timeoutMs: number = 5000): Promise<boolean> {
  // Already connected
  if (this.isConnected()) {
    return true;
  }

  // If there's an ongoing connection, wait for it
  if (this.connectionPromise) {
    try {
      await this.connectionPromise;
      if (this.isConnected()) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Poll for connection state (handles edge case where state updates async)
  const startTime = Date.now();
  const pollInterval = 50;

  while (Date.now() - startTime < timeoutMs) {
    if (this.isConnected()) {
      return true;
    }
    if (this.state === SignalRState.DISCONNECTED) {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
}
```

#### B. Fixed `connect()` in `use-remote-access-signaling.ts`:
- Uses actual hub state (`signalRRemoteAccess.isConnected()`) instead of React state
- Handles concurrent connection attempts properly
- Verifies connection after `connect()` resolves

#### C. Fixed `joinSession()` in `use-remote-access-signaling.ts`:
- Uses actual hub state for connection check
- Replaced `setTimeout(100)` with `waitForConnected(5000)`
- Proper error handling if connection times out

---

## Files Modified

1. **`src/it-app/lib/signalr/signalr-manager.ts`**
   - Added `waitForConnected()` method (lines 116-155)
   - Added `RoomJoined` and `RoomLeft` handlers (lines 348-355)

2. **`src/it-app/lib/signalr/use-remote-access-signaling.ts`**
   - Rewrote `connect()` callback (lines 84-129)
   - Rewrote `joinSession()` callback (lines 312-339)
   - Removed `setTimeout` hack
   - Updated dependency arrays

---

## Validation Steps

1. **RoomJoined warning:**
   - Open any request details page
   - Expected: No console warnings about `roomjoined`
   - Console should show: `[SignalR:chat] Room joined confirmation for <id>...`

2. **Remote session join:**
   - Start a remote session as an agent
   - Expected: No `Not connected to SignalR` errors
   - Expected: No false `failed` state transitions
   - Console should show orderly:
     - `[RemoteAccessSignaling] Connecting to SignalR...`
     - `[RemoteAccessSignaling] Connected to SignalR`
     - `[RemoteAccessSignaling] Joining session <id> as agent`
     - `[RemoteAccessSignaling] Joined session successfully`

---

## Technical Notes

- The `waitForConnected()` method uses proper async/await with the existing `connectionPromise`
- Polling is only used as a fallback for edge cases where state updates asynchronously
- 5-second timeout is generous enough for any reasonable network condition
- No arbitrary delays - all waits are based on actual state changes
