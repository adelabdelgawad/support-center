using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SignalRService.Services;

namespace SignalRService.Hubs;

/// <summary>
/// Hub for desktop notifications across all user's tickets.
/// Used for notifying users of new messages when they're not viewing a specific chat.
/// </summary>
[Authorize]
public class NotificationHub : Hub
{
    private readonly ConnectionTracker _connectionTracker;
    private readonly ILogger<NotificationHub> _logger;

    // Track active chat per connection to suppress notifications
    private static readonly Dictionary<string, string?> _activeChats = new();
    private static readonly object _activeChatLock = new();

    public NotificationHub(ConnectionTracker connectionTracker, ILogger<NotificationHub> logger)
    {
        _connectionTracker = connectionTracker;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("NotificationHub: Connection attempt without user ID");
            Context.Abort();
            return;
        }

        _connectionTracker.AddConnection(userId, Context.ConnectionId);

        // Add user to their personal notification group
        var userGroup = GetUserNotificationGroup(userId);
        await Groups.AddToGroupAsync(Context.ConnectionId, userGroup);

        _logger.LogInformation("NotificationHub: User {UserId} connected with {ConnectionId}", userId, Context.ConnectionId);

        // Send connected confirmation
        await Clients.Caller.SendAsync("Connected", new { userId });

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        _connectionTracker.RemoveConnection(Context.ConnectionId);

        // Clean up active chat tracking
        lock (_activeChatLock)
        {
            _activeChats.Remove(Context.ConnectionId);
        }

        if (exception != null)
        {
            _logger.LogWarning(exception, "NotificationHub: User {UserId} disconnected with error", userId);
        }
        else
        {
            _logger.LogInformation("NotificationHub: User {UserId} disconnected", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Set the currently active chat to suppress notifications for it.
    /// </summary>
    public Task SetActiveChat(string? requestId)
    {
        lock (_activeChatLock)
        {
            _activeChats[Context.ConnectionId] = requestId;
        }

        _logger.LogDebug("User {UserId} set active chat to {RequestId}",
            Context.UserIdentifier, requestId ?? "none");

        return Clients.Caller.SendAsync("ActiveChatSet", requestId);
    }

    /// <summary>
    /// Get the currently active chat for a connection.
    /// </summary>
    public static string? GetActiveChat(string connectionId)
    {
        lock (_activeChatLock)
        {
            return _activeChats.TryGetValue(connectionId, out var requestId) ? requestId : null;
        }
    }

    /// <summary>
    /// Refresh subscriptions (e.g., after being added to a new ticket).
    /// </summary>
    public Task RefreshSubscriptions()
    {
        _logger.LogDebug("User {UserId} requested subscription refresh", Context.UserIdentifier);
        return Clients.Caller.SendAsync("SubscriptionsRefreshed");
    }

    /// <summary>
    /// Check if user has a connection viewing a specific chat.
    /// </summary>
    public static bool IsUserViewingChat(string connectionId, string requestId)
    {
        var activeChat = GetActiveChat(connectionId);
        return activeChat == requestId;
    }

    private static string GetUserNotificationGroup(string userId) => $"notifications:{userId}";
}
