# Cache Logging & Statistics - Quick Reference Guide

## Overview

Phase 9 added comprehensive logging and statistics tracking to the WhatsApp-style local cache implementation. This guide shows how to use these features for debugging and monitoring.

## IT App Usage

### Accessing Cache Logger

```typescript
import { cacheLogger } from '@/lib/cache/cache-logger';
```

### Accessing Cache Statistics

```typescript
import { cacheStats } from '@/lib/cache/cache-stats';
```

### Browser Console (Development)

If exposed to window object:

```javascript
// View formatted statistics
console.log(window.cacheStats.getFormattedStats());

// View detailed statistics
console.log(window.cacheStats.getDetailedStats());

// View logs for specific request
console.log(window.cacheLogger.getLogsForRequest('REQ-123'));

// View summary
console.log(window.cacheLogger.getSummary());

// Reset statistics
window.cacheStats.reset();
```

## Requester App Usage

### Accessing Cache Logger

```typescript
import { cacheLogger } from './cache/cache-logger';
```

### Accessing Cache Statistics

```typescript
import { cacheStats } from './cache/cache-stats';
```

## Log Format

All logs follow this format:
```
[Cache operation] [requestId] (duration) messageCount metadata
```

### Examples

```javascript
// Sync operation
[Cache sync_start] [REQ-123] {"forceFullSync":false,"maxMessages":100}

// Cache hit with timing
[Cache cache_hit] [REQ-123] (15ms) 50 messages

// Sync complete
[Cache sync_complete] [REQ-123] (250ms) 5 messages {"type":"delta"}

// Batch write
[Cache add_batch] [REQ-123] (45ms) 5 messages {"totalBytes":2048}

// Eviction
[Cache evict_chat] [REQ-456] {"bytesFreed":1048576,"messageCount":100}

// Gap detection
[Cache gap_detected] [REQ-123] {"gaps":2}

// Sync error
[Cache sync_error] [REQ-123] (500ms) Network request failed
```

## Statistics API

### Recording Statistics

```typescript
// Record cache hit
cacheStats.recordHit(messageCount);

// Record cache miss
cacheStats.recordMiss();

// Record write operation
cacheStats.recordWrite(messageCount, bytes);

// Record batch write
cacheStats.recordBatchWrite(messageCount, bytes);

// Record eviction
cacheStats.recordEviction(bytesFreed, messageCount);

// Record sync
cacheStats.recordSync(messageCount, duration);

// Record sync error
cacheStats.recordSyncError();
```

### Reading Statistics

```typescript
// Get hit rate (percentage)
const hitRate = cacheStats.getHitRate(); // e.g., 85.5

// Get current statistics
const stats = cacheStats.getStats();
// Returns: { hits, misses, totalReads, totalWrites, evictions, syncs, syncErrors, totalMessageBytes }

// Get detailed statistics
const detailed = cacheStats.getDetailedStats();
// Returns: { stats, hitRate, avgMessagesPerRead, avgMessagesPerWrite, resetAt, uptimeSeconds }

// Get formatted string
const formatted = cacheStats.getFormattedStats();
// Returns multi-line string with all statistics
```

### Reset Statistics

```typescript
cacheStats.reset();
```

## Logger API

### Logging Operations

```typescript
// Generic log
cacheLogger.log({
  operation: CacheOperationType.SYNC_START,
  requestId: 'REQ-123',
  duration: 100,
  messageCount: 5,
  metadata: { key: 'value' },
});

// Sync operations
cacheLogger.logSyncStart('REQ-123', { forceFullSync: false });
cacheLogger.logSyncComplete('REQ-123', 250, 5, { type: 'delta' });
cacheLogger.logSyncError('REQ-123', 'Network error', 500);

// Cache operations
cacheLogger.logCacheHit('REQ-123', 50, 15);
cacheLogger.logCacheMiss('REQ-123');

// Eviction
cacheLogger.logEviction('REQ-123', 1048576, 100);

// Gap detection
cacheLogger.logGapDetected('REQ-123', 2);
cacheLogger.logGapFilled('REQ-123', 2, 150);
```

### Reading Logs

```typescript
// Get all logs
const allLogs = cacheLogger.getLogs();

// Get logs for specific request
const requestLogs = cacheLogger.getLogsForRequest('REQ-123');

// Get logs by operation type
const syncLogs = cacheLogger.getLogsByOperation(CacheOperationType.SYNC_COMPLETE);

// Get summary
const summary = cacheLogger.getSummary();
// Returns: { totalLogs, operationCounts, averageSyncDuration, cacheHitRate }

// Clear logs
cacheLogger.clearLogs();
```

## Performance Monitoring

### Measuring Cache Load Time

Cache operations automatically log timing. Look for:
```javascript
[Cache cache_hit] [REQ-123] (15ms) 50 messages
                              ^^^^
                              Duration in milliseconds
```

### Measuring Sync Time

```javascript
[Cache sync_complete] [REQ-123] (250ms) 5 messages
                                   ^^^^
                                   Duration in milliseconds
```

### Calculating Hit Rate

```typescript
const hitRate = cacheStats.getHitRate();
console.log(`Cache hit rate: ${hitRate.toFixed(2)}%`);
```

### Memory Usage

```typescript
const stats = cacheStats.getDetailedStats();
const memoryMB = stats.stats.totalMessageBytes / (1024 * 1024);
console.log(`Total cache size: ${memoryMB.toFixed(2)} MB`);
```

## Debugging Scenarios

### Scenario 1: Cache Not Working

**Symptoms:** Messages load slowly every time, no cache hit logs

**Debug Steps:**
```javascript
// Check if cache is being used
console.log(cacheLogger.getLogsByOperation(CacheOperationType.CACHE_HIT));
console.log(cacheLogger.getLogsByOperation(CacheOperationType.CACHE_MISS));

// Check hit rate
console.log('Hit rate:', cacheStats.getHitRate(), '%');

// View recent logs
console.log(cacheLogger.getLogs().slice(-10));
```

### Scenario 2: High Memory Usage

**Symptoms:** Memory grows with use, browser becomes slow

**Debug Steps:**
```javascript
// Check total bytes
const stats = cacheStats.getStats();
console.log('Total bytes:', stats.totalMessageBytes);
console.log('Total MB:', (stats.totalMessageBytes / 1024 / 1024).toFixed(2));

// Check evictions
console.log('Evictions:', stats.evictions);

// Check write operations
console.log('Total writes:', stats.totalWrites);
```

### Scenario 3: Slow Performance

**Symptoms:** UI freezes during scroll, low FPS

**Debug Steps:**
```javascript
// Check cache operation durations
const logs = cacheLogger.getLogs();
const slowOps = logs.filter(log => log.duration && log.duration > 100);
console.log('Slow operations:', slowOps);

// Check average sync duration
const summary = cacheLogger.getSummary();
console.log('Avg sync duration:', summary.averageSyncDuration, 'ms');
```

### Scenario 4: Sync Errors

**Symptoms:** Messages not updating, errors in console

**Debug Steps:**
```javascript
// Check sync errors
const stats = cacheStats.getStats();
console.log('Sync errors:', stats.syncErrors);

// View error logs
const errorLogs = cacheLogger.getLogsByOperation(CacheOperationType.SYNC_ERROR);
console.log('Error logs:', errorLogs);

// Check recent syncs
const syncLogs = cacheLogger.getLogsByOperation(CacheOperationType.SYNC_COMPLETE);
console.log('Recent syncs:', syncLogs.slice(-5));
```

## Best Practices

### 1. Development Mode

Expose stats to window in development:
```typescript
// In _app.tsx or main entry point
if (process.env.NODE_ENV === 'development') {
  (window as any).cacheStats = cacheStats;
  (window as any).cacheLogger = cacheLogger;
}
```

### 2. Production Monitoring

Log statistics periodically:
```typescript
// Log stats every 5 minutes
setInterval(() => {
  const stats = cacheStats.getDetailedStats();
  console.log('[CacheStats]', cacheStats.getFormattedStats());
}, 5 * 60 * 1000);
```

### 3. Error Tracking

Send errors to error tracking service:
```typescript
// Wrap sync operations
try {
  await syncEngine.syncChat(requestId);
} catch (error) {
  cacheLogger.logSyncError(requestId, error.message);
  // Send to error tracking
  trackError(error);
}
```

### 4. Performance Monitoring

Alert on performance degradation:
```typescript
// Check performance metrics
const summary = cacheLogger.getSummary();
if (summary.averageSyncDuration > 500) {
  console.warn('[Cache] Sync performance degraded:', summary.averageSyncDuration);
}
if (summary.cacheHitRate < 70) {
  console.warn('[Cache] Hit rate low:', summary.cacheHitRate);
}
```

## Troubleshooting

### Logs Not Appearing

**Check:**
1. Browser console is open
2. No import errors
3. Correct file is being imported
4. Not in production mode (logs may be disabled)

### Statistics Not Updating

**Check:**
1. cacheStats methods are being called
2. No errors in integration
3. Reset timestamp is recent

### Performance Issues

**Check:**
1. Too many logs (log buffer limited to 1000)
2. Expensive operations in hot path
3. Memory leaks from log retention

## Integration Examples

### React Component

```typescript
import { useEffect } from 'react';
import { cacheStats } from '@/lib/cache/cache-stats';

export function CacheStats() {
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = cacheStats.getDetailedStats();
      console.log('[CacheStats]', stats);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return <div>Check console for cache stats</div>;
}
```

### Service Worker

```typescript
import { cacheLogger } from '@/lib/cache/cache-logger';

// Log cache operations in service worker
self.addEventListener('fetch', (event) => {
  const start = performance.now();

  event.respondWith(
    fetch(event.request).then(response => {
      const duration = performance.now() - start;

      if (response.ok) {
        cacheLogger.log({
          operation: 'network_fetch',
          duration,
          metadata: { url: event.request.url },
        });
      }

      return response;
    })
  );
});
```

## API Reference

### CacheLogger

- `log(entry)` - Generic log method
- `logSyncStart(requestId, options?)` - Log sync start
- `logSyncComplete(requestId, duration, messageCount, metadata?)` - Log sync complete
- `logSyncError(requestId, error, duration?)` - Log sync error
- `logCacheHit(requestId, messageCount, duration)` - Log cache hit
- `logCacheMiss(requestId)` - Log cache miss
- `logEviction(requestId, bytesFreed, messageCount)` - Log eviction
- `logGapDetected(requestId, gaps)` - Log gap detection
- `logGapFilled(requestId, gapsFilled, duration)` - Log gap fill
- `getLogs()` - Get all logs
- `getLogsForRequest(requestId)` - Get logs for request
- `getLogsByOperation(operation)` - Get logs by operation type
- `getSummary()` - Get summary statistics
- `clearLogs()` - Clear all logs

### CacheStats

- `recordHit(messageCount?)` - Record cache hit
- `recordMiss()` - Record cache miss
- `recordWrite(messageCount, bytes)` - Record write
- `recordBatchWrite(messageCount, bytes)` - Record batch write
- `recordEviction(bytesFreed, messageCount)` - Record eviction
- `recordSync(messageCount, duration)` - Record sync
- `recordSyncError()` - Record sync error
- `getStats()` - Get current statistics
- `getHitRate()` - Get hit rate percentage
- `getDetailedStats()` - Get detailed statistics
- `getFormattedStats()` - Get formatted string
- `reset()` - Reset all statistics

## Summary

The cache logging and statistics system provides comprehensive visibility into cache operations:

- **Automatic logging** of all cache operations with timing
- **Statistics tracking** for hits, misses, syncs, evictions
- **Performance monitoring** with duration metrics
- **Debugging support** with detailed logs
- **Production-ready** with minimal overhead

Use this guide to monitor cache performance, debug issues, and optimize the cache implementation.
