# Network Detection Implementation

## Overview

The Tauri app now automatically detects whether the client is on a private network (inside corporate network) or public internet, and selects the appropriate backend endpoint accordingly.

## Architecture

### Components

1. **IP/CIDR Utilities** (`src/lib/ip-utils.ts`)
   - Parse IPv4 addresses to 32-bit integers
   - Parse CIDR notation (e.g., "10.0.0.0/8")
   - Check if IP is within CIDR range
   - Validates IP and CIDR formats

2. **Network Detection** (`src/lib/network-detection.ts`)
   - Retrieves local IP via Tauri `get_local_ip` command
   - Determines network location (PRIVATE | PUBLIC | UNKNOWN)
   - Generates appropriate backend URLs based on location
   - Supports both dynamic detection and static URL override

3. **Runtime Config** (`src/lib/runtime-config.ts`)
   - Manages backend endpoint URLs
   - Initializes network detection on app startup
   - Provides URLs to all components via singleton
   - Supports URL refresh if network changes

### Decision Logic

```
┌─────────────────────────────────────────────────┐
│ Static URLs configured? (Legacy Mode)          │
│ - VITE_API_URL                                  │
│ - VITE_SIGNALR_URL                             │
└──┬──────────────────────────────────────────────┘
   │
   ├─ YES → Use static URLs (backwards compatible)
   │
   └─ NO → Dynamic Network Detection
      │
      ├─ Get local IP via Tauri
      │
      ├─ Is IP in PRIVATE_IP_RANGE (10.0.0.0/8)?
      │
      ├──── YES (Private Network - Inside Office)
      │     └→ Use VITE_SUPPORTCENTER_DOMAIN_INTERNAL
      │        Example: http://supportcenter.andalusia.loc/api/v1
      │        Reason: Internal DNS for employees in office
      │
      └──── NO (Public Network - Remote/Home)
            └→ Use VITE_SUPPORTCENTER_DOMAIN_EXTERNAL
               Example: http://supportcenter.andalusiagroup.net/api/v1
               Reason: Public DNS for remote employees
```

## Configuration

### Environment Variables

Add these to `src/.env`:

```env
# Network Detection Configuration
VITE_SUPPORTCENTER_DOMAIN_INTERNAL=supportcenter.andalusia.loc
VITE_SUPPORTCENTER_DOMAIN_EXTERNAL=supportcenter.andalusiagroup.net
VITE_SUPPORTCENTER_PRIVATE_IP_RANGE=10.0.0.0/8
VITE_API_PROTOCOL=http
VITE_SIGNALR_PROTOCOL=https

# Optional: Override automatic detection (Legacy Mode)
# VITE_API_URL=http://10.25.10.50/api/v1
# VITE_SIGNALR_URL=https://supportcenter.andalusiagroup.net/signalr
```

### Configuration Modes

**Mode 1: Dynamic Detection (Recommended)**
- Leave `VITE_API_URL` and `VITE_SIGNALR_URL` commented out
- App auto-detects network location and selects endpoint
- Best for laptops that move between office and home

**Mode 2: Static URLs (Legacy)**
- Define `VITE_API_URL` and `VITE_SIGNALR_URL`
- Network detection is skipped
- Backwards compatible with existing setup
- Best for desktop PCs that don't move

## Testing

### Manual Test Scenarios

**Scenario 1: Private Network (Inside Office)**
```
Expected:
- Local IP: 10.x.x.x
- Detection: PRIVATE
- API URL: http://supportcenter.andalusia.loc/api/v1
- SignalR URL: https://supportcenter.andalusia.loc/signalr
- Reason: "Private network detected (IP: 10.x.x.x in 10.0.0.0/8) - using internal domain"
```

**Scenario 2: Public Network (Remote/Home)**
```
Expected:
- Local IP: 192.168.x.x or other non-10.x
- Detection: PUBLIC
- API URL: http://supportcenter.andalusiagroup.net/api/v1
- SignalR URL: https://supportcenter.andalusiagroup.net/signalr
- Reason: "Public network detected (IP: x.x.x.x not in 10.0.0.0/8) - using external domain"
```

**Scenario 3: Static URLs (Legacy Mode)**
```
Expected:
- Detection: UNKNOWN
- API URL: (from VITE_API_URL)
- Reason: "Static URLs configured in .env"
```

### Debugging

Check network detection in browser DevTools console:

```javascript
// After app initializes
const debug = RuntimeConfig.getDebugInfo();
console.log(debug);

// Expected output (Private Network):
{
  initialized: true,
  mode: 'dynamic',  // or 'static'
  location: 'private',
  localIP: '10.25.1.22',
  serverAddress: 'http://supportcenter.andalusia.loc/api/v1',
  signalRAddress: 'https://supportcenter.andalusia.loc/signalr',
  reason: 'Private network detected (IP: 10.25.1.22 in 10.0.0.0/8) - using internal domain'
}

// Expected output (Public Network):
{
  initialized: true,
  mode: 'dynamic',
  location: 'public',
  localIP: '192.168.1.100',
  serverAddress: 'http://supportcenter.andalusiagroup.net/api/v1',
  signalRAddress: 'https://supportcenter.andalusiagroup.net/signalr',
  reason: 'Public network detected (IP: 192.168.1.100 not in 10.0.0.0/8) - using external domain'
}
```

### Unit Tests (Future)

Create tests for IP utilities:

```typescript
// Test CIDR matching
isIPInCIDR('10.25.1.22', '10.0.0.0/8') → true
isIPInCIDR('192.168.1.1', '10.0.0.0/8') → false
isIPInCIDR('10.0.0.0', '10.0.0.0/8') → true (edge case)
isIPInCIDR('10.255.255.255', '10.0.0.0/8') → true (edge case)

// Test invalid inputs
isIPInCIDR('invalid', '10.0.0.0/8') → false
isIPInCIDR('10.25.1.22', 'invalid') → false
```

## Migration Guide

### From Static to Dynamic

1. **Backup current `.env`**:
   ```bash
   cp src/.env src/.env.backup
   ```

2. **Update `.env`** with new variables:
   ```env
   VITE_SUPPORTCENTER_DOMAIN_INTERNAL=supportcenter.andalusia.loc
   VITE_SUPPORTCENTER_DOMAIN_EXTERNAL=supportcenter.andalusiagroup.net
   VITE_SUPPORTCENTER_PRIVATE_IP_RANGE=10.0.0.0/8
   VITE_API_PROTOCOL=http
   VITE_SIGNALR_PROTOCOL=https
   ```

3. **Comment out static URLs**:
   ```env
   # VITE_API_URL=...
   # VITE_SIGNALR_URL=...
   ```

4. **Rebuild app**:
   ```bash
   npm run tauri build
   ```

5. **Test both scenarios**:
   - Test from office (private network)
   - Test from home (public network)

### Rollback to Static

1. **Uncomment static URLs** in `.env`:
   ```env
   VITE_API_URL=http://10.25.10.50/api/v1
   VITE_SIGNALR_URL=https://supportcenter.andalusiagroup.net/signalr
   ```

2. **Rebuild**:
   ```bash
   npm run tauri build
   ```

## Implementation Details

### Why This Matters

**The Problem:**
- External domain `supportcenter.andalusiagroup.net` may have HTTP→HTTPS redirect
- CORS preflight (OPTIONS) requests cannot follow redirects
- Result: "Redirect is not allowed for a preflight request" error

**The Solution:**
- **Private network** clients (10.x.x.x inside office) → Use internal domain: `supportcenter.andalusia.loc`
  - Internal DNS, no redirects, faster resolution
- **Public network** clients (remote/home) → Use external domain: `supportcenter.andalusiagroup.net`
  - Public DNS, accessible from anywhere

### Performance

- **First launch**: ~100-200ms for network detection
- **Subsequent launches**: Cached in RuntimeConfig
- **Network change**: Call `RuntimeConfig.refresh()` to re-detect

### Security Considerations

1. **IP Validation**: All IPs and CIDRs are validated before use
2. **No User Input**: IP detection uses Tauri's secure `get_local_ip` command
3. **Fail-Safe**: Invalid configs log errors and throw exceptions
4. **No Secrets**: All configuration is in .env (build-time, not runtime)

## Troubleshooting

### Issue: App shows "RuntimeConfig not initialized"

**Cause**: `RuntimeConfig.initialize()` not called or failed

**Fix**: Check App.tsx onMount - should call `await RuntimeConfig.initialize()`

### Issue: Wrong endpoint selected

**Cause**: Incorrect CIDR range or private IP configuration

**Fix**:
1. Check `.env` has correct values
2. Run `RuntimeConfig.getDebugInfo()` to see detection result
3. Verify local IP is correctly detected

### Issue: "CIDR format invalid"

**Cause**: Malformed CIDR notation

**Fix**: Use proper format: `10.0.0.0/8` (not `10.0.0.0-255`)

## Future Enhancements

1. **DNS Resolution**: Add Rust command to resolve domain to IP for validation
2. **Multi-Range Support**: Support multiple CIDR ranges (corporate + VPN)
3. **Cache Persistence**: Remember last detection across app restarts
4. **Auto-Refresh**: Detect network changes and auto-refresh URLs
5. **Fallback Chain**: Try primary domain, fallback to secondary on failure

## References

- IP Utils: `src/lib/ip-utils.ts`
- Network Detection: `src/lib/network-detection.ts`
- Runtime Config: `src/lib/runtime-config.ts`
- Rust IP Command: `src-tauri/src/lib.rs` (`get_local_ip`)
