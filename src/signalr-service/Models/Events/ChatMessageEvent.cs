using System.Text.Json.Serialization;

namespace SignalRService.Models.Events;

/// <summary>
/// Event for broadcasting a new chat message to a room.
/// </summary>
public class ChatMessageEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("message")]
    public required ChatMessagePayload Message { get; init; }
}

public class ChatMessagePayload
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }

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

    [JsonPropertyName("isRead")]
    public bool IsRead { get; init; }

    [JsonPropertyName("createdAt")]
    public required string CreatedAt { get; init; }

    [JsonPropertyName("updatedAt")]
    public string? UpdatedAt { get; init; }

    [JsonPropertyName("clientTempId")]
    public string? ClientTempId { get; init; }
}

public class SenderInfo
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("username")]
    public required string Username { get; init; }

    [JsonPropertyName("fullName")]
    public string? FullName { get; init; }

    [JsonPropertyName("email")]
    public string? Email { get; init; }
}

/// <summary>
/// Event for typing indicator.
/// </summary>
public class TypingIndicatorEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("user_id")]
    public required string UserId { get; init; }

    [JsonPropertyName("is_typing")]
    public bool IsTyping { get; init; }
}

/// <summary>
/// Event for read status update.
/// </summary>
public class ReadStatusEvent
{
    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("user_id")]
    public required string UserId { get; init; }

    [JsonPropertyName("message_ids")]
    public required List<string> MessageIds { get; init; }
}

/// <summary>
/// Event for initial state when joining a room.
/// </summary>
public class InitialStateEvent
{
    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("messages")]
    public required List<ChatMessagePayload> Messages { get; init; }

    [JsonPropertyName("metadata")]
    public object? Metadata { get; init; }
}
