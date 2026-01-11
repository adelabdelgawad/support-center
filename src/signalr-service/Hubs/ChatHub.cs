using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SignalRService.Models.Events;
using SignalRService.Services;

namespace SignalRService.Hubs;

/// <summary>
/// Hub for real-time chat functionality.
/// Handles message delivery, typing indicators, and read receipts.
/// </summary>
[Authorize]
public class ChatHub : Hub
{
    private readonly ConnectionTracker _connectionTracker;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(ConnectionTracker connectionTracker, ILogger<ChatHub> logger)
    {
        _connectionTracker = connectionTracker;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("Connection attempt without user ID");
            Context.Abort();
            return;
        }

        _connectionTracker.AddConnection(userId, Context.ConnectionId);
        _logger.LogInformation("ChatHub: User {UserId} connected with {ConnectionId}", userId, Context.ConnectionId);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        _connectionTracker.RemoveConnection(Context.ConnectionId);

        if (exception != null)
        {
            _logger.LogWarning(exception, "ChatHub: User {UserId} disconnected with error", userId);
        }
        else
        {
            _logger.LogInformation("ChatHub: User {UserId} disconnected", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Join a chat room (subscribe to a request's messages).
    /// </summary>
    public async Task JoinRoom(string requestId)
    {
        if (string.IsNullOrEmpty(requestId))
        {
            _logger.LogWarning("JoinRoom called with empty requestId");
            return;
        }

        var roomName = GetRoomName(requestId);
        await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
        _connectionTracker.SubscribeToRoom(requestId, Context.ConnectionId);

        _logger.LogInformation("User {UserId} joined room {RoomName}",
            Context.UserIdentifier, roomName);

        // Notify the client that join was successful
        await Clients.Caller.SendAsync("RoomJoined", requestId);
    }

    /// <summary>
    /// Leave a chat room (unsubscribe from a request's messages).
    /// </summary>
    public async Task LeaveRoom(string requestId)
    {
        if (string.IsNullOrEmpty(requestId))
        {
            _logger.LogWarning("LeaveRoom called with empty requestId");
            return;
        }

        var roomName = GetRoomName(requestId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomName);
        _connectionTracker.UnsubscribeFromRoom(requestId, Context.ConnectionId);

        _logger.LogInformation("User {UserId} left room {RoomName}",
            Context.UserIdentifier, roomName);

        await Clients.Caller.SendAsync("RoomLeft", requestId);
    }

    /// <summary>
    /// Send typing indicator to room.
    /// Note: Messages are sent via HTTP API → Internal Controller → Broadcast
    /// This is only for real-time typing status from client.
    /// </summary>
    public async Task SendTyping(string requestId, bool isTyping)
    {
        if (string.IsNullOrEmpty(requestId)) return;

        var userId = Context.UserIdentifier;
        var roomName = GetRoomName(requestId);

        await Clients.OthersInGroup(roomName).SendAsync("TypingIndicator", new
        {
            requestId,
            userId,
            isTyping
        });

        _logger.LogDebug("User {UserId} typing={IsTyping} in room {RoomName}",
            userId, isTyping, roomName);
    }

    /// <summary>
    /// Mark messages as read.
    /// Note: Actual persistence is done via HTTP API. This broadcasts the read status.
    /// </summary>
    public async Task MarkRead(string requestId, List<string> messageIds)
    {
        if (string.IsNullOrEmpty(requestId) || messageIds == null || messageIds.Count == 0) return;

        var userId = Context.UserIdentifier;
        var roomName = GetRoomName(requestId);

        await Clients.OthersInGroup(roomName).SendAsync("ReadStatusUpdate", new
        {
            requestId,
            userId,
            messageIds
        });

        _logger.LogDebug("User {UserId} marked {Count} messages as read in room {RoomName}",
            userId, messageIds.Count, roomName);
    }

    private static string GetRoomName(string requestId) => $"request:{requestId}";
}
