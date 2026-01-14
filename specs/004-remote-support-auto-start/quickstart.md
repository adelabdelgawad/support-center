# Quickstart: Remote Support Auto-Start with User Awareness

**Feature**: 004-remote-support-auto-start
**Date**: 2026-01-14

## Prerequisites

- Node.js 18+ and npm (for requester-app)
- Python 3.12+ with uv (for backend)
- Rust toolchain (for Tauri)
- Running PostgreSQL and Redis instances

## Development Setup

### 1. Backend (Audit Logging)

```bash
cd src/backend

# Activate virtual environment
source .venv/bin/activate  # or: uv sync

# No migrations needed - using existing tables

# Run backend
uvicorn main:app --reload --port 8000
```

### 2. Requester App (Banner UI)

```bash
cd src/requester-app

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

## Testing the Feature

### Manual Test Flow

1. **Start backend and requester app**
2. **Login as employee** in requester app
3. **Login as IT agent** in it-app (localhost:3010)
4. **Open a service request** as IT agent
5. **Click "Start Remote Access"** in IT portal
6. **Verify**: Employee sees top banner with:
   - "Remote support session active"
   - "Accessed by: [agent name]"
7. **End session** from IT portal
8. **Verify**: Banner disappears within 2 seconds

### Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Session starts | Banner appears within 1 second |
| Navigate pages | Banner stays visible |
| Refresh app | Banner reappears after reconnect |
| Session ends | Banner disappears within 2 seconds |
| Multiple sessions | Banner shows all agent names |
| Agent name missing | Banner shows "IT Support" |

## Key Files to Modify

### Backend
- `src/backend/services/remote_access_service.py` - Add audit logging

### Requester App
- `src/requester-app/src/src/components/remote-session-banner/` - New component
- `src/requester-app/src/src/stores/remote-access-store.ts` - Expose banner state
- `src/requester-app/src/src/App.tsx` - Mount banner

## Verification Commands

```bash
# Check backend logs for audit events
tail -f src/backend/logs/app.log | grep remote_session

# Check requester app console for SignalR events
# (visible in Tauri dev tools console)
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Banner not appearing | Check SignalR connection in dev tools |
| Agent name shows undefined | Verify backend sends agentName in SignalR payload |
| Banner persists after session end | Check SignalR RemoteSessionEnded handler |
| Logs not appearing | Verify logging config in backend |
