using System.Text.Json.Serialization;

namespace SignalRService.Models.Events;

/// <summary>
/// Event for remote access session auto-start.
/// </summary>
public class RemoteSessionAutoStartEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("requester_id")]
    public required string RequesterId { get; init; }

    [JsonPropertyName("session")]
    public required RemoteSessionPayload Session { get; init; }
}

public class RemoteSessionPayload
{
    [JsonPropertyName("sessionId")]
    public required string SessionId { get; init; }

    [JsonPropertyName("agentId")]
    public required string AgentId { get; init; }

    [JsonPropertyName("agentName")]
    public string? AgentName { get; init; }

    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }

    [JsonPropertyName("requestTitle")]
    public string? RequestTitle { get; init; }

    [JsonPropertyName("mode")]
    public string Mode { get; init; } = "view";

    [JsonPropertyName("autoApproved")]
    public bool AutoApproved { get; init; } = true;

    [JsonPropertyName("isReconnection")]
    public bool IsReconnection { get; init; }
}

/// <summary>
/// Event for remote session ended.
/// </summary>
public class RemoteSessionEndedEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("session_id")]
    public required string SessionId { get; init; }

    [JsonPropertyName("reason")]
    public required string Reason { get; init; }

    [JsonPropertyName("ended_by")]
    public string? EndedBy { get; init; }
}

/// <summary>
/// Event for remote session reconnect.
/// </summary>
public class RemoteSessionReconnectEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("requester_id")]
    public required string RequesterId { get; init; }

    [JsonPropertyName("session")]
    public required RemoteSessionPayload Session { get; init; }
}

/// <summary>
/// WebRTC signaling events.
/// </summary>
public class WebRtcSignalEvent
{
    [JsonPropertyName("session_id")]
    public required string SessionId { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }  // sdp_offer, sdp_answer, ice_candidate

    [JsonPropertyName("payload")]
    public required object Payload { get; init; }

    [JsonPropertyName("from_participant")]
    public string? FromParticipant { get; init; }  // agent or requester
}

/// <summary>
/// UAC detected event.
/// </summary>
public class UacDetectedEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("session_id")]
    public required string SessionId { get; init; }

    [JsonPropertyName("agent_id")]
    public required string AgentId { get; init; }
}

/// <summary>
/// UAC dismissed event.
/// </summary>
public class UacDismissedEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("session_id")]
    public required string SessionId { get; init; }

    [JsonPropertyName("agent_id")]
    public required string AgentId { get; init; }
}

/// <summary>
/// Control enable/disable event.
/// </summary>
public class ControlEvent
{
    [JsonPropertyName("session_id")]
    public required string SessionId { get; init; }

    [JsonPropertyName("enabled")]
    public bool Enabled { get; init; }

    [JsonPropertyName("by_participant")]
    public string? ByParticipant { get; init; }
}
