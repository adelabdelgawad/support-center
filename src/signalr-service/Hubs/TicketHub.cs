using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SignalRService.Services;

namespace SignalRService.Hubs;

/// <summary>
/// Hub for ticket status updates and notifications.
/// Handles ticket field changes, status updates, and new ticket notifications.
/// </summary>
[Authorize]
public class TicketHub : Hub
{
    private readonly ConnectionTracker _connectionTracker;
    private readonly ILogger<TicketHub> _logger;

    public TicketHub(ConnectionTracker connectionTracker, ILogger<TicketHub> logger)
    {
        _connectionTracker = connectionTracker;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("TicketHub: Connection attempt without user ID");
            Context.Abort();
            return;
        }

        _connectionTracker.AddConnection(userId, Context.ConnectionId);
        _logger.LogInformation("TicketHub: User {UserId} connected with {ConnectionId}", userId, Context.ConnectionId);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        _connectionTracker.RemoveConnection(Context.ConnectionId);

        if (exception != null)
        {
            _logger.LogWarning(exception, "TicketHub: User {UserId} disconnected with error", userId);
        }
        else
        {
            _logger.LogInformation("TicketHub: User {UserId} disconnected", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Subscribe to updates for a specific ticket.
    /// </summary>
    public async Task SubscribeToTicket(string requestId)
    {
        if (string.IsNullOrEmpty(requestId))
        {
            _logger.LogWarning("SubscribeToTicket called with empty requestId");
            return;
        }

        var groupName = GetTicketGroupName(requestId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        _connectionTracker.SubscribeToRoom(requestId, Context.ConnectionId);

        _logger.LogInformation("User {UserId} subscribed to ticket {RequestId}",
            Context.UserIdentifier, requestId);

        await Clients.Caller.SendAsync("TicketSubscribed", requestId);
    }

    /// <summary>
    /// Unsubscribe from updates for a specific ticket.
    /// </summary>
    public async Task UnsubscribeFromTicket(string requestId)
    {
        if (string.IsNullOrEmpty(requestId))
        {
            _logger.LogWarning("UnsubscribeFromTicket called with empty requestId");
            return;
        }

        var groupName = GetTicketGroupName(requestId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        _connectionTracker.UnsubscribeFromRoom(requestId, Context.ConnectionId);

        _logger.LogInformation("User {UserId} unsubscribed from ticket {RequestId}",
            Context.UserIdentifier, requestId);

        await Clients.Caller.SendAsync("TicketUnsubscribed", requestId);
    }

    /// <summary>
    /// Subscribe to user's ticket list updates.
    /// </summary>
    public async Task SubscribeToUserTickets()
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId)) return;

        var userGroupName = GetUserGroupName(userId);
        await Groups.AddToGroupAsync(Context.ConnectionId, userGroupName);

        _logger.LogInformation("User {UserId} subscribed to their ticket list", userId);

        await Clients.Caller.SendAsync("UserTicketsSubscribed");
    }

    /// <summary>
    /// Unsubscribe from user's ticket list updates.
    /// </summary>
    public async Task UnsubscribeFromUserTickets()
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId)) return;

        var userGroupName = GetUserGroupName(userId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, userGroupName);

        _logger.LogInformation("User {UserId} unsubscribed from their ticket list", userId);

        await Clients.Caller.SendAsync("UserTicketsUnsubscribed");
    }

    private static string GetTicketGroupName(string requestId) => $"ticket:{requestId}";
    private static string GetUserGroupName(string userId) => $"user-tickets:{userId}";
}
