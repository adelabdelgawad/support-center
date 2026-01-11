using System.Text.Json.Serialization;

namespace SignalRService.Models.Events;

/// <summary>
/// Event for sending a notification to a specific user (desktop notification).
/// </summary>
public class NotificationEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("message")]
    public required NotificationMessagePayload Message { get; init; }

    [JsonPropertyName("sender_id")]
    public string? SenderId { get; init; }
}

public class NotificationMessagePayload
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }

    [JsonPropertyName("requestTitle")]
    public string? RequestTitle { get; init; }

    [JsonPropertyName("senderId")]
    public string? SenderId { get; init; }

    [JsonPropertyName("sender")]
    public SenderInfo? Sender { get; init; }

    [JsonPropertyName("content")]
    public required string Content { get; init; }

    [JsonPropertyName("sequenceNumber")]
    public int SequenceNumber { get; init; }

    [JsonPropertyName("isScreenshot")]
    public bool IsScreenshot { get; init; }

    [JsonPropertyName("screenshotFileName")]
    public string? ScreenshotFileName { get; init; }

    [JsonPropertyName("createdAt")]
    public required string CreatedAt { get; init; }
}

/// <summary>
/// Event for sending notification to specific user.
/// </summary>
public class UserNotificationEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("user_id")]
    public required string UserId { get; init; }

    [JsonPropertyName("notification")]
    public required object Notification { get; init; }
}

/// <summary>
/// Event for subscription added (user added to ticket).
/// </summary>
public class SubscriptionAddedEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("user_id")]
    public required string UserId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }
}

/// <summary>
/// Event for subscription removed (user removed from ticket).
/// </summary>
public class SubscriptionRemovedEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("user_id")]
    public required string UserId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }
}
