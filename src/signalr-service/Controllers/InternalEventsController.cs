using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SignalRService.Hubs;
using SignalRService.Models.Events;
using SignalRService.Services;

namespace SignalRService.Controllers;

/// <summary>
/// Internal API for FastAPI to broadcast events via SignalR.
/// Protected by API key middleware.
/// </summary>
[ApiController]
[Route("internal")]
public class InternalEventsController : ControllerBase
{
    private readonly IHubContext<ChatHub> _chatHub;
    private readonly IHubContext<TicketHub> _ticketHub;
    private readonly IHubContext<NotificationHub> _notificationHub;
    private readonly IHubContext<RemoteAccessHub> _remoteAccessHub;
    private readonly IdempotencyGuard _idempotencyGuard;
    private readonly ConnectionTracker _connectionTracker;
    private readonly ILogger<InternalEventsController> _logger;

    public InternalEventsController(
        IHubContext<ChatHub> chatHub,
        IHubContext<TicketHub> ticketHub,
        IHubContext<NotificationHub> notificationHub,
        IHubContext<RemoteAccessHub> remoteAccessHub,
        IdempotencyGuard idempotencyGuard,
        ConnectionTracker connectionTracker,
        ILogger<InternalEventsController> logger)
    {
        _chatHub = chatHub;
        _ticketHub = ticketHub;
        _notificationHub = notificationHub;
        _remoteAccessHub = remoteAccessHub;
        _idempotencyGuard = idempotencyGuard;
        _connectionTracker = connectionTracker;
        _logger = logger;
    }

    // ==================== Chat Events ====================

    /// <summary>
    /// Broadcast a new chat message to a room.
    /// </summary>
    [HttpPost("chat/message")]
    public async Task<IActionResult> BroadcastChatMessage([FromBody] ChatMessageEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            _logger.LogDebug("Duplicate chat message event: {EventId}", evt.EventId);
            return Ok(new { duplicate = true });
        }

        var groupName = $"request:{evt.RequestId}";
        await _chatHub.Clients.Group(groupName).SendAsync("ReceiveMessage", evt.Message);

        _logger.LogInformation("Broadcast chat message to room {RequestId}, event={EventId}",
            evt.RequestId, evt.EventId);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Broadcast typing indicator.
    /// </summary>
    [HttpPost("chat/typing")]
    public async Task<IActionResult> BroadcastTyping([FromBody] TypingIndicatorEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var groupName = $"request:{evt.RequestId}";
        await _chatHub.Clients.Group(groupName).SendAsync("TypingIndicator", new
        {
            requestId = evt.RequestId,
            userId = evt.UserId,
            isTyping = evt.IsTyping
        });

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Broadcast read status update.
    /// </summary>
    [HttpPost("chat/read-status")]
    public async Task<IActionResult> BroadcastReadStatus([FromBody] ReadStatusEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var groupName = $"request:{evt.RequestId}";
        await _chatHub.Clients.Group(groupName).SendAsync("ReadStatusUpdate", new
        {
            requestId = evt.RequestId,
            userId = evt.UserId,
            messageIds = evt.MessageIds
        });

        return Ok(new { broadcast = true });
    }

    // ==================== Ticket Events ====================

    /// <summary>
    /// Broadcast ticket update (status, priority, assignee, etc.).
    /// </summary>
    [HttpPost("ticket/update")]
    public async Task<IActionResult> BroadcastTicketUpdate([FromBody] TicketUpdateEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        // Broadcast to both chat room and ticket subscribers
        var chatGroup = $"request:{evt.RequestId}";
        var ticketGroup = $"ticket:{evt.RequestId}";

        await Task.WhenAll(
            _chatHub.Clients.Group(chatGroup).SendAsync("TicketUpdate", evt.Update),
            _ticketHub.Clients.Group(ticketGroup).SendAsync("TicketUpdate", evt.Update)
        );

        _logger.LogInformation("Broadcast ticket update to {RequestId}, type={Type}",
            evt.RequestId, evt.Update.Type);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Broadcast task status changed.
    /// </summary>
    [HttpPost("ticket/task-status")]
    public async Task<IActionResult> BroadcastTaskStatus([FromBody] TaskStatusChangedEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var chatGroup = $"request:{evt.RequestId}";
        var ticketGroup = $"ticket:{evt.RequestId}";

        await Task.WhenAll(
            _chatHub.Clients.Group(chatGroup).SendAsync("TaskStatusChanged", new
            {
                requestId = evt.RequestId,
                status = evt.Status,
                changedBy = evt.ChangedBy
            }),
            _ticketHub.Clients.Group(ticketGroup).SendAsync("TaskStatusChanged", new
            {
                requestId = evt.RequestId,
                status = evt.Status,
                changedBy = evt.ChangedBy
            })
        );

        _logger.LogInformation("Broadcast task status to {RequestId}: {Status}",
            evt.RequestId, evt.Status);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Broadcast new ticket to relevant users.
    /// </summary>
    [HttpPost("ticket/new")]
    public async Task<IActionResult> BroadcastNewTicket([FromBody] NewTicketEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var tasks = new List<Task>();

        // Notify requester
        var requesterGroup = $"user-tickets:{evt.RequesterId}";
        tasks.Add(_ticketHub.Clients.Group(requesterGroup).SendAsync("NewTicket", evt.Ticket));

        // Notify assigned agent if any
        if (!string.IsNullOrEmpty(evt.AssignedToId))
        {
            var agentGroup = $"user-tickets:{evt.AssignedToId}";
            tasks.Add(_ticketHub.Clients.Group(agentGroup).SendAsync("NewTicket", evt.Ticket));
        }

        await Task.WhenAll(tasks);

        _logger.LogInformation("Broadcast new ticket, requester={RequesterId}, assignee={AssigneeId}",
            evt.RequesterId, evt.AssignedToId ?? "none");

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Broadcast system message (status change, assignment, etc.).
    /// </summary>
    [HttpPost("ticket/system-message")]
    public async Task<IActionResult> BroadcastSystemMessage([FromBody] SystemMessageEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var groupName = $"request:{evt.RequestId}";
        await _chatHub.Clients.Group(groupName).SendAsync("ReceiveMessage", evt.Message);

        _logger.LogInformation("Broadcast system message to {RequestId}, type={Type}",
            evt.RequestId, evt.Type);

        return Ok(new { broadcast = true });
    }

    // ==================== Notification Events ====================

    /// <summary>
    /// Broadcast new message notification to users.
    /// </summary>
    [HttpPost("notification/new-message")]
    public async Task<IActionResult> BroadcastNotification([FromBody] NotificationEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        // Get all connections for users subscribed to this request
        // Note: In production, this would query which users should receive the notification
        // For now, broadcast to the request's notification group
        var groupName = $"request-notifications:{evt.RequestId}";

        await _notificationHub.Clients.Group(groupName).SendAsync("NewMessageNotification", evt.Message);

        _logger.LogInformation("Broadcast notification for {RequestId}", evt.RequestId);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Send notification to specific user.
    /// </summary>
    [HttpPost("notification/send")]
    public async Task<IActionResult> SendUserNotification([FromBody] UserNotificationEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var userGroup = $"notifications:{evt.UserId}";
        await _notificationHub.Clients.Group(userGroup).SendAsync("Notification", evt.Notification);

        _logger.LogInformation("Sent notification to user {UserId}", evt.UserId);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Notify user of subscription added.
    /// </summary>
    [HttpPost("notification/subscription-added")]
    public async Task<IActionResult> NotifySubscriptionAdded([FromBody] SubscriptionAddedEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var userGroup = $"notifications:{evt.UserId}";
        await _notificationHub.Clients.Group(userGroup).SendAsync("SubscriptionAdded", new
        {
            requestId = evt.RequestId
        });

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Notify user of subscription removed.
    /// </summary>
    [HttpPost("notification/subscription-removed")]
    public async Task<IActionResult> NotifySubscriptionRemoved([FromBody] SubscriptionRemovedEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var userGroup = $"notifications:{evt.UserId}";
        await _notificationHub.Clients.Group(userGroup).SendAsync("SubscriptionRemoved", new
        {
            requestId = evt.RequestId
        });

        return Ok(new { broadcast = true });
    }

    // ==================== Remote Access Events ====================

    /// <summary>
    /// Notify requester to auto-start remote access session.
    /// </summary>
    [HttpPost("remote-access/auto-start")]
    public async Task<IActionResult> NotifyAutoStart([FromBody] RemoteSessionAutoStartEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        // Send to user's notification group and global connection
        var userNotifGroup = $"notifications:{evt.RequesterId}";

        await Task.WhenAll(
            _notificationHub.Clients.Group(userNotifGroup).SendAsync("RemoteSessionAutoStart", evt.Session),
            _chatHub.Clients.Group($"user:{evt.RequesterId}").SendAsync("RemoteSessionAutoStart", evt.Session)
        );

        _logger.LogInformation("Sent remote session auto-start to {RequesterId}, session={SessionId}",
            evt.RequesterId, evt.Session.SessionId);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Notify participants that session has ended.
    /// </summary>
    [HttpPost("remote-access/ended")]
    public async Task<IActionResult> NotifySessionEnded([FromBody] RemoteSessionEndedEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var sessionGroup = $"remote-access:{evt.SessionId}";
        await _remoteAccessHub.Clients.Group(sessionGroup).SendAsync("SessionEnded", new
        {
            sessionId = evt.SessionId,
            reason = evt.Reason,
            endedBy = evt.EndedBy
        });

        _logger.LogInformation("Broadcast session ended: {SessionId}, reason={Reason}",
            evt.SessionId, evt.Reason);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Notify requester to reconnect to session.
    /// </summary>
    [HttpPost("remote-access/reconnect")]
    public async Task<IActionResult> NotifyReconnect([FromBody] RemoteSessionReconnectEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var userNotifGroup = $"notifications:{evt.RequesterId}";
        await _notificationHub.Clients.Group(userNotifGroup).SendAsync("RemoteSessionReconnect", evt.Session);

        _logger.LogInformation("Sent remote session reconnect to {RequesterId}, session={SessionId}",
            evt.RequesterId, evt.Session.SessionId);

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Notify agent of UAC detected.
    /// </summary>
    [HttpPost("remote-access/uac-detected")]
    public async Task<IActionResult> NotifyUacDetected([FromBody] UacDetectedEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var sessionGroup = $"remote-access:{evt.SessionId}";
        await _remoteAccessHub.Clients.Group(sessionGroup).SendAsync("UacDetected", new
        {
            sessionId = evt.SessionId,
            message = "Waiting for user to complete UAC prompt..."
        });

        return Ok(new { broadcast = true });
    }

    /// <summary>
    /// Notify agent of UAC dismissed.
    /// </summary>
    [HttpPost("remote-access/uac-dismissed")]
    public async Task<IActionResult> NotifyUacDismissed([FromBody] UacDismissedEvent evt)
    {
        if (_idempotencyGuard.IsDuplicate(evt.EventId))
        {
            return Ok(new { duplicate = true });
        }

        var sessionGroup = $"remote-access:{evt.SessionId}";
        await _remoteAccessHub.Clients.Group(sessionGroup).SendAsync("UacDismissed", new
        {
            sessionId = evt.SessionId
        });

        return Ok(new { broadcast = true });
    }

    // ==================== Stats ====================

    /// <summary>
    /// Get connection statistics.
    /// </summary>
    [HttpGet("stats")]
    public IActionResult GetStats()
    {
        var stats = _connectionTracker.GetStats();
        return Ok(new
        {
            connections = stats.TotalConnections,
            users = stats.UniqueUsers,
            rooms = stats.ActiveRooms,
            idempotencyEntries = _idempotencyGuard.GetActiveCount()
        });
    }

    /// <summary>
    /// Check if a user is currently connected (online).
    /// </summary>
    [HttpGet("users/{userId}/online")]
    public IActionResult IsUserOnline(string userId)
    {
        var isOnline = _connectionTracker.IsUserConnected(userId);
        var connectionCount = _connectionTracker.GetConnectionCount(userId);

        _logger.LogDebug("Online check for user {UserId}: {IsOnline} ({Count} connections)",
            userId, isOnline, connectionCount);

        return Ok(new
        {
            userId,
            isOnline,
            connectionCount
        });
    }
}
