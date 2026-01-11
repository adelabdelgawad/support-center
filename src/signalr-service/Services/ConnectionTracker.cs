using System.Collections.Concurrent;

namespace SignalRService.Services;

/// <summary>
/// Tracks active SignalR connections and user-to-connection mappings.
/// Used for sending messages to specific users and monitoring connection state.
/// </summary>
public class ConnectionTracker
{
    private readonly ConcurrentDictionary<string, HashSet<string>> _userConnections = new();
    private readonly ConcurrentDictionary<string, string> _connectionToUser = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _roomSubscriptions = new();
    private readonly ILogger<ConnectionTracker> _logger;
    private readonly object _lock = new();

    public ConnectionTracker(ILogger<ConnectionTracker> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Register a new connection for a user.
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
    /// Remove a connection when disconnected.
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
}

public class ConnectionStats
{
    public int TotalConnections { get; init; }
    public int UniqueUsers { get; init; }
    public int ActiveRooms { get; init; }
}
