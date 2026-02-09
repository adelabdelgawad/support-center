using System.Collections.Concurrent;
using StackExchange.Redis;

namespace SignalRService.Services;

/// <summary>
/// Tracks active SignalR connections and user-to-connection mappings.
/// Used for sending messages to specific users and monitoring connection state.
///
/// Also writes Redis presence keys for desktop sessions (Phase 3: SignalR presence).
/// Key schema matches Python backend presence_service.py:
///   presence:desktop:{sessionId} → userId (with TTL)
///   presence:user:{userId}       → SET of sessionIds (with TTL)
/// </summary>
public class ConnectionTracker
{
    private readonly ConcurrentDictionary<string, HashSet<string>> _userConnections = new();
    private readonly ConcurrentDictionary<string, string> _connectionToUser = new();
    private readonly ConcurrentDictionary<string, string> _connectionToSession = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _roomSubscriptions = new();
    private readonly ILogger<ConnectionTracker> _logger;
    private readonly IDatabase? _redisDb;
    private readonly object _lock = new();

    // Redis presence key schema (matches Python backend presence_service.py)
    private const string DesktopPresencePrefix = "presence:desktop:";
    private const string UserPresencePrefix = "presence:user:";
    private const int PresenceTtlSeconds = 660; // 11 min, matches backend PRESENCE_TTL_SECONDS

    public ConnectionTracker(ILogger<ConnectionTracker> logger, IServiceProvider serviceProvider)
    {
        _logger = logger;
        var redis = serviceProvider.GetService<IConnectionMultiplexer>();
        _redisDb = redis?.GetDatabase();

        if (_redisDb != null)
            _logger.LogInformation("ConnectionTracker: Redis presence tracking enabled");
        else
            _logger.LogInformation("ConnectionTracker: Redis not available, presence tracking disabled");
    }

    /// <summary>
    /// Register a new connection for a user (in-memory only).
    /// </summary>
    public void AddConnection(string userId, string connectionId)
    {
        lock (_lock)
        {
            _connectionToUser[connectionId] = userId;

            if (!_userConnections.TryGetValue(userId, out var connections))
            {
                connections = new HashSet<string>();
                _userConnections[userId] = connections;
            }

            connections.Add(connectionId);
        }

        _logger.LogInformation("Connection {ConnectionId} added for user {UserId}. Total connections: {Count}",
            connectionId, userId, GetConnectionCount(userId));
    }

    /// <summary>
    /// Register a new connection with optional desktop session for Redis presence.
    /// </summary>
    public async Task AddConnectionAsync(string userId, string connectionId, string? desktopSessionId = null)
    {
        AddConnection(userId, connectionId);

        if (!string.IsNullOrEmpty(desktopSessionId))
        {
            _connectionToSession[connectionId] = desktopSessionId;
            await SetPresenceAsync(userId, desktopSessionId);
        }
    }

    /// <summary>
    /// Remove a connection when disconnected (in-memory only).
    /// </summary>
    public void RemoveConnection(string connectionId)
    {
        lock (_lock)
        {
            if (_connectionToUser.TryRemove(connectionId, out var userId))
            {
                if (_userConnections.TryGetValue(userId, out var connections))
                {
                    connections.Remove(connectionId);

                    if (connections.Count == 0)
                    {
                        _userConnections.TryRemove(userId, out _);
                    }
                }

                // Remove from all room subscriptions
                foreach (var room in _roomSubscriptions.Values)
                {
                    room.Remove(connectionId);
                }

                _logger.LogInformation("Connection {ConnectionId} removed for user {UserId}", connectionId, userId);
            }
        }
    }

    /// <summary>
    /// Remove a connection and clean up Redis presence if user has no remaining connections.
    /// </summary>
    public async Task RemoveConnectionAsync(string connectionId)
    {
        // Capture userId and sessionId before in-memory removal
        string? userId = GetUserId(connectionId);
        _connectionToSession.TryRemove(connectionId, out var sessionId);

        RemoveConnection(connectionId);

        // Only remove Redis presence if user has NO remaining connections
        if (userId != null && !IsUserConnected(userId))
        {
            await RemovePresenceAsync(userId, sessionId);
        }
    }

    /// <summary>
    /// Get all connection IDs for a user.
    /// </summary>
    public IReadOnlyList<string> GetUserConnections(string userId)
    {
        lock (_lock)
        {
            if (_userConnections.TryGetValue(userId, out var connections))
            {
                return connections.ToList();
            }
            return Array.Empty<string>();
        }
    }

    /// <summary>
    /// Get the user ID for a connection.
    /// </summary>
    public string? GetUserId(string connectionId)
    {
        return _connectionToUser.TryGetValue(connectionId, out var userId) ? userId : null;
    }

    /// <summary>
    /// Check if a user is connected.
    /// </summary>
    public bool IsUserConnected(string userId)
    {
        return _userConnections.ContainsKey(userId) && _userConnections[userId].Count > 0;
    }

    /// <summary>
    /// Get connection count for a user.
    /// </summary>
    public int GetConnectionCount(string userId)
    {
        return _userConnections.TryGetValue(userId, out var connections) ? connections.Count : 0;
    }

    /// <summary>
    /// Subscribe a connection to a room (e.g., chat room).
    /// </summary>
    public void SubscribeToRoom(string roomId, string connectionId)
    {
        lock (_lock)
        {
            if (!_roomSubscriptions.TryGetValue(roomId, out var connections))
            {
                connections = new HashSet<string>();
                _roomSubscriptions[roomId] = connections;
            }
            connections.Add(connectionId);
        }

        _logger.LogDebug("Connection {ConnectionId} subscribed to room {RoomId}", connectionId, roomId);
    }

    /// <summary>
    /// Unsubscribe a connection from a room.
    /// </summary>
    public void UnsubscribeFromRoom(string roomId, string connectionId)
    {
        lock (_lock)
        {
            if (_roomSubscriptions.TryGetValue(roomId, out var connections))
            {
                connections.Remove(connectionId);
                if (connections.Count == 0)
                {
                    _roomSubscriptions.TryRemove(roomId, out _);
                }
            }
        }

        _logger.LogDebug("Connection {ConnectionId} unsubscribed from room {RoomId}", connectionId, roomId);
    }

    /// <summary>
    /// Get all connections subscribed to a room.
    /// </summary>
    public IReadOnlyList<string> GetRoomConnections(string roomId)
    {
        lock (_lock)
        {
            if (_roomSubscriptions.TryGetValue(roomId, out var connections))
            {
                return connections.ToList();
            }
            return Array.Empty<string>();
        }
    }

    /// <summary>
    /// Get statistics about current connections.
    /// </summary>
    public ConnectionStats GetStats()
    {
        lock (_lock)
        {
            return new ConnectionStats
            {
                TotalConnections = _connectionToUser.Count,
                UniqueUsers = _userConnections.Count,
                ActiveRooms = _roomSubscriptions.Count
            };
        }
    }

    /// <summary>
    /// Write Redis presence keys for a desktop session.
    /// Uses same key schema as Python backend presence_service.py.
    /// </summary>
    private async Task SetPresenceAsync(string userId, string sessionId)
    {
        if (_redisDb == null) return;

        try
        {
            var ttl = TimeSpan.FromSeconds(PresenceTtlSeconds);

            await Task.WhenAll(
                _redisDb.StringSetAsync($"{DesktopPresencePrefix}{sessionId}", userId, ttl),
                _redisDb.SetAddAsync($"{UserPresencePrefix}{userId}", sessionId),
                _redisDb.KeyExpireAsync($"{UserPresencePrefix}{userId}", ttl)
            );

            _logger.LogDebug("Presence SET for session {SessionId} user {UserId} (TTL={Ttl}s)",
                sessionId, userId, PresenceTtlSeconds);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Presence Redis SET failed (non-fatal)");
        }
    }

    /// <summary>
    /// Remove Redis presence keys for a desktop session.
    /// </summary>
    private async Task RemovePresenceAsync(string userId, string? sessionId)
    {
        if (_redisDb == null || string.IsNullOrEmpty(sessionId)) return;

        try
        {
            await Task.WhenAll(
                _redisDb.KeyDeleteAsync($"{DesktopPresencePrefix}{sessionId}"),
                _redisDb.SetRemoveAsync($"{UserPresencePrefix}{userId}", sessionId)
            );

            _logger.LogDebug("Presence DEL for session {SessionId} user {UserId}",
                sessionId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Presence Redis DEL failed (non-fatal)");
        }
    }
}

public class ConnectionStats
{
    public int TotalConnections { get; init; }
    public int UniqueUsers { get; init; }
    public int ActiveRooms { get; init; }
}
