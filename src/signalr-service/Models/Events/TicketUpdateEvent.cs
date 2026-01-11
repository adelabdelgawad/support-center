using System.Text.Json.Serialization;

namespace SignalRService.Models.Events;

/// <summary>
/// Event for ticket field updates (status, priority, assignee, etc.).
/// </summary>
public class TicketUpdateEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("update")]
    public required TicketUpdatePayload Update { get; init; }
}

public class TicketUpdatePayload
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("data")]
    public required object Data { get; init; }

    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }
}

/// <summary>
/// Event for task status change.
/// </summary>
public class TaskStatusChangedEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("changed_by")]
    public string? ChangedBy { get; init; }
}

/// <summary>
/// Event for new ticket creation.
/// </summary>
public class NewTicketEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("ticket")]
    public required object Ticket { get; init; }

    [JsonPropertyName("requester_id")]
    public required string RequesterId { get; init; }

    [JsonPropertyName("assigned_to_id")]
    public string? AssignedToId { get; init; }
}

/// <summary>
/// Event for system-generated messages in ticket (status change, assignment, etc.).
/// </summary>
public class SystemMessageEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("message")]
    public required ChatMessagePayload Message { get; init; }
}
