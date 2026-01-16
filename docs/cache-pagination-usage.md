# MessageCache Pagination API Reference

## Overview
The `MessageCache` class now supports paginated reads for efficient message loading. This document provides usage examples for the new pagination methods.

## Available Methods

### `getCachedMessagesPaginated()`
Load messages in chunks with offset/limit pagination.

```typescript
const cache = new MessageCache(userId);

// Load first 100 messages
const page1 = await cache.getCachedMessagesPaginated(requestId, 0, 100);

// Load next 100 messages
const page2 = await cache.getCachedMessagesPaginated(requestId, 100, 100);

// Load last 50 messages
const totalCount = await cache.getCachedMessageCount(requestId);
const lastPage = await cache.getCachedMessagesPaginated(
  requestId,
  Math.max(0, totalCount - 50),
  50
);
```

**Use Cases**:
- Initial page load with progressive loading
- "Load more" functionality
- Infinite scroll implementation

**Parameters**:
- `requestId`: Service request ID
- `offset`: Starting offset (default: 0)
- `limit`: Maximum messages to return (default: 100)

**Returns**: `Promise<CachedMessage[]>` sorted by sequence number

---

### `getCachedMessagesBySequenceRange()`
Load messages within a specific sequence number range using cursor-based queries.

```typescript
const cache = new MessageCache(userId);

// Load messages with sequence numbers 100-200
const messages = await cache.getCachedMessagesBySequenceRange(
  requestId,
  100,  // startSeq (inclusive)
  200,  // endSeq (inclusive)
  100   // limit (optional, default: 100)
);

// Fill a detected gap
const gap = { startSeq: 50, endSeq: 99 };
const gapMessages = await cache.getCachedMessagesBySequenceRange(
  requestId,
  gap.startSeq,
  gap.endSeq
);
```

**Use Cases**:
- Gap filling after detecting missing messages
- Delta sync with sequence number ranges
- Loading specific message ranges

**Parameters**:
- `requestId`: Service request ID
- `startSeq`: Starting sequence number (inclusive)
- `endSeq`: Ending sequence number (inclusive)
- `limit`: Maximum messages to return (default: 100)

**Returns**: `Promise<CachedMessage[]>` sorted by sequence number

**Performance**: Uses compound index `by_request_sequence` for efficient queries

---

### `getCachedMessageCount()`
Get the total number of cached messages for a chat.

```typescript
const cache = new MessageCache(userId);

const totalMessages = await cache.getCachedMessageCount(requestId);
console.log(`Total messages: ${totalMessages}`);

// Calculate number of pages
const pageSize = 100;
const totalPages = Math.ceil(totalMessages / pageSize);

// Show "showing 1-100 of ${totalMessages} messages"
```

**Use Cases**:
- Pagination UI (page indicators)
- "Load more" button visibility
- Progress indicators

**Parameters**:
- `requestId`: Service request ID

**Returns**: `Promise<number>` total message count

---

### `getNewestMessages()`
Load the most recent N messages from a chat.

```typescript
const cache = new MessageCache(userId);

// Load newest 50 messages (fast initial load)
const recentMessages = await cache.getNewestMessages(requestId, 50);

// Load newest 100 messages
const latestMessages = await cache.getNewestMessages(requestId, 100);

// Initialize chat with most recent messages
const initialMessages = await cache.getNewestMessages(requestId, 50);
setMessages(initialMessages);
```

**Use Cases**:
- Fast initial page load
- Show recent messages first
- Optimistic UI updates

**Parameters**:
- `requestId`: Service request ID
- `limit`: Number of messages to return (default: 50)

**Returns**: `Promise<CachedMessage[]>` sorted by sequence number (ascending)

---

### `getOldestMessages()`
Load the oldest N messages from a chat.

```typescript
const cache = new MessageCache(userId);

// Load oldest 50 messages
const oldMessages = await cache.getOldestMessages(requestId, 50);

// Load more history when scrolling to top
const handleScrollToTop = async () => {
  const currentOldestSeq = messages[0]?.sequenceNumber;
  const olderMessages = await cache.getCachedMessagesBySequenceRange(
    requestId,
    Math.max(1, currentOldestSeq - 50),
    currentOldestSeq - 1
  );
  setMessages([...olderMessages, ...messages]);
};
```

**Use Cases**:
- Load conversation history
- Scroll-to-top loading
- chronological browsing

**Parameters**:
- `requestId`: Service request ID
- `limit`: Number of messages to return (default: 50)

**Returns**: `Promise<CachedMessage[]>` sorted by sequence number (ascending)

---

## Usage Patterns

### Pattern 1: Progressive Initial Load
Load newest messages first, then load older messages in the background.

```typescript
const cache = new MessageCache(userId);

// Step 1: Load newest 50 messages immediately (fast)
const initialMessages = await cache.getNewestMessages(requestId, 50);
setMessages(initialMessages);
setIsLoading(false);

// Step 2: Load remaining messages in background
const totalCount = await cache.getCachedMessageCount(requestId);
if (totalCount > 50) {
  const remaining = await cache.getCachedMessagesPaginated(requestId, 0, totalCount - 50);
  setMessages([...remaining, ...initialMessages]);
}
```

### Pattern 2: Infinite Scroll
Load messages as user scrolls, starting from newest.

```typescript
const cache = new MessageCache(userId);
const [messages, setMessages] = useState<CachedMessage[]>([]);
const [hasOlder, setHasOlder] = useState(true);

// Initial load: newest 50 messages
useEffect(() => {
  cache.getNewestMessages(requestId, 50).then(setMessages);
}, [requestId]);

// Load older messages on scroll to top
const loadOlder = async () => {
  if (!hasOlder) return;

  const oldestSeq = messages[0]?.sequenceNumber;
  const olderMessages = await cache.getCachedMessagesBySequenceRange(
    requestId,
    Math.max(1, oldestSeq - 50),
    oldestSeq - 1,
    50
  );

  if (olderMessages.length === 0) {
    setHasOlder(false);
  } else {
    setMessages([...olderMessages, ...messages]);
  }
};
```

### Pattern 3: Gap Filling
Detect and fill sequence number gaps after loading.

```typescript
const cache = new MessageCache(userId);

// Load initial messages
const messages = await cache.getCachedMessages(requestId);

// Detect gaps
const gaps = await cache.detectGaps(requestId);

// Fill each gap
for (const gap of gaps) {
  const gapMessages = await cache.getCachedMessagesBySequenceRange(
    requestId,
    gap.startSeq,
    gap.endSeq
  );

  if (gapMessages.length > 0) {
    await cache.addMessagesBatch(gapMessages);
    await cache.clearGap(requestId, gap);
  }
}
```

### Pattern 4: Scroll Position Restoration
Combine pagination with scroll position restoration.

```typescript
const cache = new MessageCache(userId);

// Get saved scroll position
const savedPosition = loadScrollPosition(requestId);

if (savedPosition) {
  // Load messages around saved position
  const centerSeq = Math.floor(
    (savedPosition.scrollTop / savedPosition.scrollHeight) * totalCount
  );

  const [older, newer] = await Promise.all([
    cache.getCachedMessagesBySequenceRange(requestId, centerSeq - 50, centerSeq - 1, 50),
    cache.getCachedMessagesBySequenceRange(requestId, centerSeq, centerSeq + 50, 50),
  ]);

  setMessages([...older, ...newer]);
  restoreScrollPosition(savedPosition);
} else {
  // No saved position, load newest messages
  const messages = await cache.getNewestMessages(requestId, 100);
  setMessages(messages);
  scrollToBottom();
}
```

---

## Performance Considerations

### Chunk Size Recommendations

| Scenario | Recommended Chunk Size | Rationale |
|----------|----------------------|-----------|
| Initial load | 50 messages | Fast perceived load time |
| Infinite scroll | 50-100 messages | Balance speed vs. API calls |
| Gap filling | 100-500 messages | Minimize API calls for bulk operations |
| Background sync | 100-1000 messages | Maximize throughput |

### IndexedDB Query Optimization

1. **Use compound indexes** for range queries:
   ```typescript
   // Fast: Uses index
   cache.getCachedMessagesBySequenceRange(requestId, 100, 200);

   // Slow: Scans all messages
   (await cache.getCachedMessages(requestId))
     .filter(m => m.sequenceNumber >= 100 && m.sequenceNumber <= 200);
   ```

2. **Cursor-based pagination** for large datasets:
   ```typescript
   // Efficient: Cursor-based
   cache.getCachedMessagesBySequenceRange(requestId, startSeq, endSeq, limit);

   // Inefficient: Offset-based
   cache.getCachedMessagesPaginated(requestId, offset, limit);
   ```

3. **Batch operations** for writes:
   ```typescript
   // Fast: Single transaction
   await cache.addMessagesBatch(messages);

   // Slow: Multiple transactions
   for (const msg of messages) {
     await cache.addMessage(msg);
   }
   ```

---

## Migration Guide

### Before: Loading All Messages
```typescript
// Old way: Blocks main thread with 1000+ messages
const allMessages = await cache.getCachedMessages(requestId);
setMessages(allMessages);
```

### After: Progressive Loading
```typescript
// New way: Fast initial load, background completion
const initial = await cache.getNewestMessages(requestId, 50);
setMessages(initial);

// Load rest in background
setTimeout(async () => {
  const remaining = await cache.getCachedMessagesPaginated(requestId, 50, 1000);
  setMessages(prev => [...prev, ...remaining]);
}, 100);
```

---

## Type Safety

All methods are fully typed with TypeScript:

```typescript
import type { CachedMessage } from '@/lib/cache/schemas';

const cache = new MessageCache(userId);

const messages: CachedMessage[] = await cache.getNewestMessages(requestId, 50);

// Type-safe access
messages.forEach(msg => {
  console.log(msg.sequenceNumber); // number
  console.log(msg.content); // string
  console.log(msg.sender?.fullName); // string | null
});
```

---

## Error Handling

```typescript
const cache = new MessageCache(userId);

try {
  const messages = await cache.getNewestMessages(requestId, 50);
  setMessages(messages);
} catch (error) {
  console.error('Failed to load messages:', error);

  // Fallback: Load from API
  const apiMessages = await fetchMessagesFromAPI(requestId);
  await cache.addMessagesBatch(apiMessages);
  setMessages(apiMessages);
}
```

---

## Testing

```typescript
import { MessageCache } from '@/lib/cache/message-cache';

describe('MessageCache Pagination', () => {
  const cache = new MessageCache('test-user');
  const requestId = 'test-request';

  beforeEach(async () => {
    await cache.clearAll();
    // Add test messages...
  });

  test('paginates messages correctly', async () => {
    const page1 = await cache.getCachedMessagesPaginated(requestId, 0, 10);
    const page2 = await cache.getCachedMessagesPaginated(requestId, 10, 10);

    expect(page1).toHaveLength(10);
    expect(page2).toHaveLength(10);
    expect(page1[0].sequenceNumber).toBeLessThan(page2[0].sequenceNumber);
  });

  test('loads newest messages', async () => {
    const newest = await cache.getNewestMessages(requestId, 5);

    expect(newest).toHaveLength(5);
    expect(newest[0].sequenceNumber).toBeGreaterThan(newest[4].sequenceNumber);
  });
});
```

---

## Summary

The new pagination API provides:
- **Performance**: Chunked loads prevent main thread blocking
- **Flexibility**: Multiple methods for different use cases
- **Efficiency**: Cursor-based queries use compound indexes
- **Type Safety**: Full TypeScript support
- **Backward Compatibility**: Original `getCachedMessages()` still works

Choose the right method based on your use case:
- Initial load: `getNewestMessages()`
- Infinite scroll: `getCachedMessagesPaginated()`
- Gap filling: `getCachedMessagesBySequenceRange()`
- Pagination UI: `getCachedMessageCount()`
- History load: `getOldestMessages()`
