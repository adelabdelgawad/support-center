using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SignalRService.Services;

namespace SignalRService.Hubs;

/// <summary>
/// Hub for WebRTC signaling during remote access sessions.
/// Handles SDP offer/answer exchange, ICE candidates, and control events.
/// </summary>
[Authorize]
public class RemoteAccessHub : Hub
{
    private readonly ConnectionTracker _connectionTracker;
    private readonly ILogger<RemoteAccessHub> _logger;

    // Track session participants: sessionId -> (agentConnectionId, requesterConnectionId)
    private static readonly Dictionary<string, SessionParticipants> _sessions = new();
    private static readonly object _sessionLock = new();

    public RemoteAccessHub(ConnectionTracker connectionTracker, ILogger<RemoteAccessHub> logger)
    {
        _connectionTracker = connectionTracker;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("RemoteAccessHub: Connection attempt without user ID");
            Context.Abort();
            return;
        }

        _connectionTracker.AddConnection(userId, Context.ConnectionId);
        _logger.LogInformation("RemoteAccessHub: User {UserId} connected with {ConnectionId}", userId, Context.ConnectionId);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier ?? Context.User?.FindFirst("sub")?.Value;
        _connectionTracker.RemoveConnection(Context.ConnectionId);

        // Clean up session participation and notify other party
        await CleanupParticipant(Context.ConnectionId);

        if (exception != null)
        {
            _logger.LogWarning(exception, "RemoteAccessHub: User {UserId} disconnected with error", userId);
        }
        else
        {
            _logger.LogInformation("RemoteAccessHub: User {UserId} disconnected", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Join a remote access session as agent or requester.
    /// </summary>
    public async Task JoinSession(string sessionId, string participantType)
    {
        if (string.IsNullOrEmpty(sessionId))
        {
            _logger.LogWarning("JoinSession called with empty sessionId");
            return;
        }

        var userId = Context.UserIdentifier;
        var connectionId = Context.ConnectionId;
        var groupName = GetSessionGroupName(sessionId);

        // Add to session group
        await Groups.AddToGroupAsync(connectionId, groupName);

        // Track participant
        lock (_sessionLock)
        {
            if (!_sessions.TryGetValue(sessionId, out var participants))
            {
                participants = new SessionParticipants();
                _sessions[sessionId] = participants;
            }

            if (participantType.Equals("agent", StringComparison.OrdinalIgnoreCase))
            {
                participants.AgentConnectionId = connectionId;
                participants.AgentUserId = userId;
            }
            else
            {
                participants.RequesterConnectionId = connectionId;
                participants.RequesterUserId = userId;
            }
        }

        _logger.LogInformation("User {UserId} joined session {SessionId} as {Type}",
            userId, sessionId, participantType);

        // Notify the caller
        await Clients.Caller.SendAsync("SessionJoined", new { sessionId, participantType });

        // Notify other participant
        await Clients.OthersInGroup(groupName).SendAsync("ParticipantJoined", new
        {
            sessionId,
            participantType,
            userId
        });
    }

    /// <summary>
    /// Leave a remote access session.
    /// </summary>
    public async Task LeaveSession(string sessionId)
    {
        if (string.IsNullOrEmpty(sessionId)) return;

        var userId = Context.UserIdentifier;
        var groupName = GetSessionGroupName(sessionId);

        // Notify other participant before leaving
        await Clients.OthersInGroup(groupName).SendAsync("ParticipantLeft", new
        {
            sessionId,
            userId
        });

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);

        // Clean up session tracking
        lock (_sessionLock)
        {
            if (_sessions.TryGetValue(sessionId, out var participants))
            {
                if (participants.AgentConnectionId == Context.ConnectionId)
                {
                    participants.AgentConnectionId = null;
                    participants.AgentUserId = null;
                }
                else if (participants.RequesterConnectionId == Context.ConnectionId)
                {
                    participants.RequesterConnectionId = null;
                    participants.RequesterUserId = null;
                }

                // Remove session if no participants
                if (participants.AgentConnectionId == null && participants.RequesterConnectionId == null)
                {
                    _sessions.Remove(sessionId);
                }
            }
        }

        _logger.LogInformation("User {UserId} left session {SessionId}", userId, sessionId);

        await Clients.Caller.SendAsync("SessionLeft", sessionId);
    }

    /// <summary>
    /// Send WebRTC signal to other participant.
    /// </summary>
    public async Task SendSignal(string sessionId, string type, object payload)
    {
        if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(type)) return;

        var groupName = GetSessionGroupName(sessionId);
        var userId = Context.UserIdentifier;

        _logger.LogDebug("User {UserId} sending signal {Type} in session {SessionId}",
            userId, type, sessionId);

        // Send to other participant in the session
        await Clients.OthersInGroup(groupName).SendAsync(type, new
        {
            sessionId,
            payload,
            fromUserId = userId
        });
    }

    /// <summary>
    /// Send SDP offer.
    /// </summary>
    public Task SendSdpOffer(string sessionId, object sdp)
        => SendSignal(sessionId, "SdpOffer", sdp);

    /// <summary>
    /// Send SDP answer.
    /// </summary>
    public Task SendSdpAnswer(string sessionId, object sdp)
        => SendSignal(sessionId, "SdpAnswer", sdp);

    /// <summary>
    /// Send ICE candidate.
    /// </summary>
    public Task SendIceCandidate(string sessionId, object candidate)
        => SendSignal(sessionId, "IceCandidate", candidate);

    /// <summary>
    /// Enable remote control.
    /// </summary>
    public async Task EnableControl(string sessionId)
    {
        var groupName = GetSessionGroupName(sessionId);
        await Clients.OthersInGroup(groupName).SendAsync("ControlEnabled", new { sessionId });
        _logger.LogInformation("Control enabled in session {SessionId} by {UserId}",
            sessionId, Context.UserIdentifier);
    }

    /// <summary>
    /// Disable remote control.
    /// </summary>
    public async Task DisableControl(string sessionId)
    {
        var groupName = GetSessionGroupName(sessionId);
        await Clients.OthersInGroup(groupName).SendAsync("ControlDisabled", new { sessionId });
        _logger.LogInformation("Control disabled in session {SessionId} by {UserId}",
            sessionId, Context.UserIdentifier);
    }

    /// <summary>
    /// Notify UAC detected on requester machine.
    /// </summary>
    public async Task NotifyUacDetected(string sessionId)
    {
        var groupName = GetSessionGroupName(sessionId);
        await Clients.OthersInGroup(groupName).SendAsync("UacDetected", new
        {
            sessionId,
            message = "Waiting for user to complete UAC prompt..."
        });
        _logger.LogInformation("UAC detected in session {SessionId}", sessionId);
    }

    /// <summary>
    /// Notify UAC dismissed on requester machine.
    /// </summary>
    public async Task NotifyUacDismissed(string sessionId)
    {
        var groupName = GetSessionGroupName(sessionId);
        await Clients.OthersInGroup(groupName).SendAsync("UacDismissed", new { sessionId });
        _logger.LogInformation("UAC dismissed in session {SessionId}", sessionId);
    }

    private async Task CleanupParticipant(string connectionId)
    {
        // Track sessions that need ParticipantLeft notification (outside lock)
        var notificationsToSend = new List<(string sessionId, string otherConnectionId, string userId)>();

        lock (_sessionLock)
        {
            var sessionsToRemove = new List<string>();

            foreach (var kvp in _sessions)
            {
                var sessionId = kvp.Key;
                var participants = kvp.Value;
                string? otherConnectionId = null;
                string? userId = null;

                if (participants.AgentConnectionId == connectionId)
                {
                    // Agent disconnected - notify requester
                    otherConnectionId = participants.RequesterConnectionId;
                    userId = participants.AgentUserId ?? "unknown";
                    participants.AgentConnectionId = null;
                    participants.AgentUserId = null;
                }
                else if (participants.RequesterConnectionId == connectionId)
                {
                    // Requester disconnected - notify agent
                    otherConnectionId = participants.AgentConnectionId;
                    userId = participants.RequesterUserId ?? "unknown";
                    participants.RequesterConnectionId = null;
                    participants.RequesterUserId = null;
                }

                // Track notification to send outside lock
                if (otherConnectionId != null)
                {
                    notificationsToSend.Add((sessionId, otherConnectionId, userId));
                }

                if (participants.AgentConnectionId == null && participants.RequesterConnectionId == null)
                {
                    sessionsToRemove.Add(sessionId);
                }
            }

            foreach (var sessionId in sessionsToRemove)
            {
                _sessions.Remove(sessionId);
                _logger.LogDebug("Session {SessionId} removed (no participants)", sessionId);
            }
        }

        // Send ParticipantLeft notifications OUTSIDE the lock to avoid deadlocks
        foreach (var (sessionId, otherConnectionId, userId) in notificationsToSend)
        {
            try
            {
                await Clients.Client(otherConnectionId).SendAsync("ParticipantLeft", new
                {
                    sessionId,
                    userId
                });
                _logger.LogInformation(
                    "Notified connection {ConnectionId} that participant {UserId} left session {SessionId}",
                    otherConnectionId, userId, sessionId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to send ParticipantLeft to connection {ConnectionId} for session {SessionId}",
                    otherConnectionId, sessionId);
            }
        }
    }

    private static string GetSessionGroupName(string sessionId) => $"remote-access:{sessionId}";

    private class SessionParticipants
    {
        public string? AgentConnectionId { get; set; }
        public string? AgentUserId { get; set; }
        public string? RequesterConnectionId { get; set; }
        public string? RequesterUserId { get; set; }
    }
}
