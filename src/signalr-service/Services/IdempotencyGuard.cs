using System.Collections.Concurrent;

namespace SignalRService.Services;

/// <summary>
/// In-memory TTL cache for idempotency checking.
/// Prevents duplicate event processing when FastAPI retries.
/// </summary>
public class IdempotencyGuard : IDisposable
{
    private readonly ConcurrentDictionary<string, DateTime> _processedEvents = new();
    private readonly TimeSpan _ttl;
    private readonly Timer _cleanupTimer;
    private readonly ILogger<IdempotencyGuard> _logger;
    private bool _disposed;

    public IdempotencyGuard(IConfiguration configuration, ILogger<IdempotencyGuard> logger)
    {
        _logger = logger;
        var ttlMinutes = configuration.GetValue<int>("IdempotencyTtlMinutes", 5);
        _ttl = TimeSpan.FromMinutes(ttlMinutes);

        // Cleanup expired entries every minute
        _cleanupTimer = new Timer(CleanupExpired, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));

        _logger.LogInformation("IdempotencyGuard initialized with TTL of {TtlMinutes} minutes", ttlMinutes);
    }

    /// <summary>
    /// Check if an event has already been processed.
    /// If not, marks it as processed and returns false.
    /// If already processed, returns true (duplicate).
    /// </summary>
    public bool IsDuplicate(string eventId)
    {
        if (string.IsNullOrEmpty(eventId))
        {
            _logger.LogWarning("Empty event ID received, treating as non-duplicate");
            return false;
        }

        var now = DateTime.UtcNow;

        // Try to add the event ID
        if (_processedEvents.TryAdd(eventId, now))
        {
            _logger.LogDebug("Event {EventId} registered as new", eventId);
            return false;
        }

        // Event already exists - check if it's expired
        if (_processedEvents.TryGetValue(eventId, out var timestamp))
        {
            if (now - timestamp > _ttl)
            {
                // Expired, update timestamp and treat as new
                _processedEvents[eventId] = now;
                _logger.LogDebug("Event {EventId} expired, treating as new", eventId);
                return false;
            }
        }

        _logger.LogInformation("Duplicate event {EventId} detected", eventId);
        return true;
    }

    /// <summary>
    /// Manually mark an event as processed.
    /// </summary>
    public void MarkProcessed(string eventId)
    {
        _processedEvents[eventId] = DateTime.UtcNow;
    }

    private void CleanupExpired(object? state)
    {
        var now = DateTime.UtcNow;
        var expiredKeys = _processedEvents
            .Where(kvp => now - kvp.Value > _ttl)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var key in expiredKeys)
        {
            _processedEvents.TryRemove(key, out _);
        }

        if (expiredKeys.Count > 0)
        {
            _logger.LogDebug("Cleaned up {Count} expired idempotency entries", expiredKeys.Count);
        }
    }

    public int GetActiveCount() => _processedEvents.Count;

    public void Dispose()
    {
        if (_disposed) return;
        _cleanupTimer.Dispose();
        _processedEvents.Clear();
        _disposed = true;
    }
}
