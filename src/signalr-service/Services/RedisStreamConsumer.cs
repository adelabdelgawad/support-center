using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using SignalRService.Hubs;
using SignalRService.Models.Events;

namespace SignalRService.Services;

/// <summary>
/// Background service that consumes events from Redis Streams and broadcasts to SignalR clients.
///
/// Feature 001: Real-Time Messaging Latency Optimization
/// This replaces the HTTP bridge with Redis Streams for low-latency event delivery.
///
/// Streams consumed:
/// - events:chat - Chat messages, typing indicators, read receipts
/// - events:ticket - Ticket status changes, assignments
/// - events:notification - Generic notifications
/// - events:remote - Remote access session events
/// </summary>
public class RedisStreamConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<RedisStreamConsumer> _logger;
    private readonly IConnectionMultiplexer _redis;
    private readonly IConfiguration _configuration;

    // Consumer group name (must match backend config)
    private const string ConsumerGroupName = "signalr-consumers";

    // Consumer name for this instance
    private readonly string _consumerName;

    // Stream configuration
    private readonly Dictionary<string, StreamConfig> _streams = new()
    {
        ["events:chat"] = new("events:chat", 10000),
        ["events:ticket"] = new("events:ticket", 5000),
        ["events:notification"] = new("events:notification", 5000),
        ["events:remote"] = new("events:remote", 1000),
    };

    // For tracking pending deliveries (XACK after successful broadcast)
    private readonly ConcurrentDictionary<string, PendingDelivery> _pendingDeliveries = new();

    public RedisStreamConsumer(
        IServiceProvider serviceProvider,
        ILogger<RedisStreamConsumer> logger,
        IConnectionMultiplexer redis,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _redis = redis;
        _configuration = configuration;
        _consumerName = Environment.MachineName;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("RedisStreamConsumer starting on {MachineName}", _consumerName);

        // Initialize consumer groups
        await InitializeConsumerGroupsAsync(stoppingToken);

        // Start consumption loop for each stream
        var consumptionTasks = _streams.Values.Select(stream =>
            ConsumeStreamAsync(stream, stoppingToken)
        );

        await Task.WhenAll(consumptionTasks);
    }

    /// <summary>
    /// Initialize consumer groups for all streams if they don't exist.
    /// </summary>
    private async Task InitializeConsumerGroupsAsync(CancellationToken cancellationToken)
    {
        var db = _redis.GetDatabase();

        foreach (var stream in _streams.Values)
        {
            try
            {
                // Try to create consumer group starting at $ (new messages only)
                // This will fail if group already exists, which is fine
                await db.StreamCreateConsumerGroupAsync(
                    stream.Name,
                    ConsumerGroupName,
                    "0",  // Start from beginning for new groups (existing messages)
                    createStream: true
                );

                _logger.LogInformation("Created consumer group {GroupName} for stream {StreamName}",
                    ConsumerGroupName, stream.Name);
            }
            catch (RedisException ex) when (ex.Message.Contains("BUSYGROUP"))
            {
                // Group already exists, which is expected
                _logger.LogDebug("Consumer group {GroupName} already exists for stream {StreamName}",
                    ConsumerGroupName, stream.Name);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create consumer group for stream {StreamName}", stream.Name);
            }
        }
    }

    /// <summary>
    /// Consume events from a single Redis Stream.
    /// </summary>
    private async Task ConsumeStreamAsync(StreamConfig streamConfig, CancellationToken cancellationToken)
    {
        var db = _redis.GetDatabase();
        var streamName = streamConfig.Name;

        _logger.LogInformation("Starting consumption of stream {StreamName} as consumer {ConsumerName}",
            streamName, _consumerName);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                // XREADGROUP: Blocking read from consumer group
                // Note: StackExchange.Redis doesn't support blocking reads directly
                // We'll poll with a delay instead
                var entries = await db.StreamReadGroupAsync(
                    streamName,
                    ConsumerGroupName,
                    _consumerName,
                    ">",  // Only new messages not yet delivered
                    count: 100  // Batch size
                );

                // If no entries, wait before polling again
                // CRITICAL FIX: Reduced from 5000ms to 100ms for low-latency message delivery
                // Prevents 0-5 second delay in real-time message broadcast
                if (entries.Length == 0)
                {
                    await Task.Delay(100, cancellationToken);
                    continue;
                }

                _logger.LogDebug("Received {Count} entries from stream {StreamName}",
                    entries.Length, streamName);

                // Process each entry
                foreach (var entry in entries)
                {
                    await ProcessStreamEntryAsync(streamName, entry, cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                // Graceful shutdown
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consuming from stream {StreamName}", streamName);

                // Brief delay before retrying
                try
                {
                    await Task.Delay(1000, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        _logger.LogInformation("Stopped consuming stream {StreamName}", streamName);
    }

    /// <summary>
    /// Process a single stream entry.
    /// </summary>
    private async Task ProcessStreamEntryAsync(
        string streamName,
        StreamEntry entry,
        CancellationToken cancellationToken)
    {
        try
        {
            // Deserialize the event
            var streamEvent = DeserializeStreamEvent(entry);
            if (streamEvent == null)
            {
                _logger.LogWarning("Failed to deserialize entry {EntryId} from stream {StreamName}",
                    entry.Id, streamName);
                await AckEntryAsync(streamName, entry.Id);
                return;
            }

            _logger.LogDebug("Processing event {EventType} for room {RoomId} from stream {StreamName}",
                streamEvent.EventType, streamEvent.RoomId, streamName);

            // Broadcast to appropriate hub
            var success = await BroadcastEventAsync(streamEvent, cancellationToken);

            // Acknowledge after successful broadcast
            if (success)
            {
                await AckEntryAsync(streamName, entry.Id);
            }
            else
            {
                _logger.LogWarning("Failed to broadcast event {EventType} for room {RoomId}",
                    streamEvent.EventType, streamEvent.RoomId);

                // Still acknowledge to prevent redelivery (or could implement retry logic)
                await AckEntryAsync(streamName, entry.Id);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing entry {EntryId} from stream {StreamName}",
                entry.Id, streamName);

            // Acknowledge to prevent poison pill
            await AckEntryAsync(streamName, entry.Id);
        }
    }

    /// <summary>
    /// Deserialize Redis Stream entry to StreamEvent.
    /// </summary>
    private StreamEvent? DeserializeStreamEvent(StreamEntry entry)
    {
        try
        {
            var eventDict = new Dictionary<string, string>();

            // CRITICAL FIX: StreamEntry.Values is NameValueEntry[], not alternating key-value pairs
            // Each entry has .Name and .Value properties
            // Previous code incorrectly treated it as flat array causing all events to fail deserialization
            foreach (var nameValue in entry.Values)
            {
                eventDict[nameValue.Name.ToString()] = nameValue.Value.ToString();
            }

            // Extract required fields
            if (!eventDict.TryGetValue("event_id", out var eventId) ||
                !eventDict.TryGetValue("event_type", out var eventType) ||
                !eventDict.TryGetValue("room_id", out var roomId) ||
                !eventDict.TryGetValue("payload", out var payloadStr))
            {
                _logger.LogWarning("Stream entry missing required fields: {Keys}", string.Join(", ", eventDict.Keys));
                return null;
            }

            // Deserialize payload
            var payload = JsonSerializer.Deserialize<Dictionary<string, object>>(payloadStr);
            if (payload == null)
            {
                _logger.LogWarning("Failed to deserialize payload for event {EventType}", eventType);
                return null;
            }

            // Parse metadata if present
            EventMetadata? metadata = null;
            if (eventDict.TryGetValue("metadata", out var metadataStr) && !string.IsNullOrEmpty(metadataStr))
            {
                metadata = JsonSerializer.Deserialize<EventMetadata>(metadataStr);
            }

            return new StreamEvent
            {
                EventId = eventId,
                EventType = eventType,
                Timestamp = eventDict.GetValueOrDefault("timestamp", DateTime.UtcNow.ToString("O")),
                RoomId = roomId,
                Payload = payload,
                Metadata = metadata
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deserializing stream entry");
            return null;
        }
    }

    /// <summary>
    /// Broadcast event to the appropriate SignalR hub.
    /// </summary>
    private async Task<bool> BroadcastEventAsync(StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();

        try
        {
            // Route to appropriate hub based on event type
            switch (streamEvent.EventType)
            {
                case "chat_message":
                    await BroadcastChatMessageAsync(scope, streamEvent, cancellationToken);
                    return true;

                case "typing_start":
                case "typing_stop":
                    await BroadcastTypingIndicatorAsync(scope, streamEvent, cancellationToken);
                    return true;

                case "read_receipt":
                    await BroadcastReadReceiptAsync(scope, streamEvent, cancellationToken);
                    return true;

                case "status_change":
                case "assignment_change":
                    await BroadcastTicketUpdateAsync(scope, streamEvent, cancellationToken);
                    return true;

                case "ticket_list_update":
                    await BroadcastUserTicketListUpdateAsync(scope, streamEvent, cancellationToken);
                    return true;

                case "notification":
                    await BroadcastNotificationAsync(scope, streamEvent, cancellationToken);
                    return true;

                case "remote_session_start":
                case "remote_session_end":
                    await BroadcastRemoteAccessEventAsync(scope, streamEvent, cancellationToken);
                    return true;

                default:
                    _logger.LogWarning("Unknown event type: {EventType}", streamEvent.EventType);
                    return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error broadcasting event {EventType}", streamEvent.EventType);
            return false;
        }
    }

    /// <summary>
    /// Converts JsonElement values to primitives for SignalR transmission.
    /// When deserializing from Redis, Dictionary<string, object> values become JsonElement.
    /// SignalR can't serialize JsonElement correctly, so we extract primitive values.
    /// </summary>
    private static object ConvertJsonElementToObject(object value)
    {
        if (value is JsonElement jsonElement)
        {
            return jsonElement.ValueKind switch
            {
                JsonValueKind.String => jsonElement.GetString() ?? string.Empty,
                JsonValueKind.Number => jsonElement.TryGetInt64(out var l) ? l : jsonElement.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                JsonValueKind.Array => jsonElement.EnumerateArray().Select(e => ConvertJsonElementToObject(e)).ToArray(),
                JsonValueKind.Object => jsonElement.EnumerateObject()
                    .ToDictionary(prop => prop.Name, prop => ConvertJsonElementToObject(prop.Value)),
                _ => value
            };
        }
        return value;
    }

    /// <summary>
    /// Converts a dictionary with JsonElement values to one with primitive values.
    /// </summary>
    private static Dictionary<string, object> ConvertPayloadDictionary(Dictionary<string, object> payload)
    {
        return payload.ToDictionary(
            kvp => kvp.Key,
            kvp => ConvertJsonElementToObject(kvp.Value)
        );
    }

    /// <summary>
    /// Safely gets a string value from a payload, handling JsonElement values.
    /// </summary>
    private static string? GetPayloadString(Dictionary<string, object> payload, string key)
    {
        if (payload.TryGetValue(key, out var value))
        {
            var converted = ConvertJsonElementToObject(value);
            return converted?.ToString();
        }
        return null;
    }

    /// <summary>
    /// Safely gets an int value from a payload, handling JsonElement values.
    /// </summary>
    private static int GetPayloadInt(Dictionary<string, object> payload, string key, int defaultValue = 0)
    {
        if (payload.TryGetValue(key, out var value))
        {
            var converted = ConvertJsonElementToObject(value);
            if (converted is long l) return (int)l;
            if (converted is double d) return (int)d;
            if (converted is int i) return i;
        }
        return defaultValue;
    }

    /// <summary>
    /// Safely gets a bool value from a payload, handling JsonElement values.
    /// </summary>
    private static bool GetPayloadBool(Dictionary<string, object> payload, string key, bool defaultValue = false)
    {
        if (payload.TryGetValue(key, out var value))
        {
            var converted = ConvertJsonElementToObject(value);
            if (converted is bool b) return b;
        }
        return defaultValue;
    }

    /// <summary>
    /// Safely gets a SenderInfo from a payload, handling JsonElement nested objects.
    /// </summary>
    private static SenderInfo? GetPayloadSenderInfo(Dictionary<string, object> payload, string key)
    {
        if (payload.TryGetValue(key, out var value))
        {
            var converted = ConvertJsonElementToObject(value);
            if (converted is Dictionary<string, object> senderDict)
            {
                return new SenderInfo
                {
                    Id = GetPayloadString(senderDict, "id") ?? string.Empty,
                    Username = GetPayloadString(senderDict, "username") ?? string.Empty,
                    FullName = GetPayloadString(senderDict, "fullName"),
                    Email = GetPayloadString(senderDict, "email")
                };
            }
        }
        return null;
    }

    /// <summary>
    /// Broadcast chat message to ChatHub.
    /// </summary>
    private async Task BroadcastChatMessageAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var chatHub = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();
        var roomName = $"request:{streamEvent.RoomId}";

        // Convert JsonElement values to primitives for SignalR transmission
        var payload = new ChatMessagePayload
        {
            Id = GetPayloadString(streamEvent.Payload, "id") ?? string.Empty,
            RequestId = GetPayloadString(streamEvent.Payload, "requestId") ?? streamEvent.RoomId,
            SenderId = GetPayloadString(streamEvent.Payload, "senderId"),
            Sender = GetPayloadSenderInfo(streamEvent.Payload, "sender"),
            Content = GetPayloadString(streamEvent.Payload, "content") ?? string.Empty,
            SequenceNumber = GetPayloadInt(streamEvent.Payload, "sequenceNumber"),
            IsScreenshot = GetPayloadBool(streamEvent.Payload, "isScreenshot"),
            ScreenshotFileName = GetPayloadString(streamEvent.Payload, "screenshotFileName"),
            IsRead = GetPayloadBool(streamEvent.Payload, "isRead"),
            CreatedAt = GetPayloadString(streamEvent.Payload, "createdAt") ?? DateTime.UtcNow.ToString("O"),
            UpdatedAt = GetPayloadString(streamEvent.Payload, "updatedAt"),
            ClientTempId = GetPayloadString(streamEvent.Payload, "clientTempId")
        };

        if (string.IsNullOrEmpty(payload.Id)) return;

        // CRITICAL FIX: Send message payload directly, not wrapped in { eventId, requestId, message }
        // Clients expect ReceiveMessage to receive ChatMessage directly
        await chatHub.Clients.Group(roomName).SendAsync("ReceiveMessage", payload, cancellationToken);

        _logger.LogInformation("Broadcast chat message {MessageId} to room {RoomName}", payload.Id, roomName);
    }

    /// <summary>
    /// Broadcast typing indicator to ChatHub.
    /// </summary>
    private async Task BroadcastTypingIndicatorAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var chatHub = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();
        var roomName = $"request:{streamEvent.RoomId}";

        var isTyping = streamEvent.EventType == "typing_start";
        var userId = streamEvent.Payload.GetValueOrDefault("user_id", "")?.ToString();
        var username = streamEvent.Payload.GetValueOrDefault("username", "")?.ToString();

        await chatHub.Clients.Group(roomName).SendAsync("TypingIndicator", new
        {
            requestId = streamEvent.RoomId,
            userId,
            username,
            isTyping
        }, cancellationToken);

        _logger.LogDebug("Broadcast typing indicator to room {RoomName}", roomName);
    }

    /// <summary>
    /// Broadcast read receipt to ChatHub.
    /// </summary>
    private async Task BroadcastReadReceiptAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var chatHub = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();
        var roomName = $"request:{streamEvent.RoomId}";

        var userId = streamEvent.Payload.GetValueOrDefault("user_id", "")?.ToString();

        // Extract message IDs from payload
        var messageIds = new List<string>();
        if (streamEvent.Payload.TryGetValue("message_ids", out var msgIdsObj) && msgIdsObj is JsonElement msgIdsElem)
        {
            foreach (var item in msgIdsElem.EnumerateArray())
            {
                messageIds.Add(item.ToString()!);
            }
        }

        await chatHub.Clients.Group(roomName).SendAsync("ReadStatusUpdate", new
        {
            requestId = streamEvent.RoomId,
            userId,
            messageIds
        }, cancellationToken);

        _logger.LogDebug("Broadcast read receipt to room {RoomName}", roomName);
    }

    /// <summary>
    /// Broadcast ticket update to TicketHub.
    /// </summary>
    private async Task BroadcastTicketUpdateAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var ticketHub = scope.ServiceProvider.GetRequiredService<IHubContext<TicketHub>>();
        var groupName = $"ticket:{streamEvent.RoomId}";

        await ticketHub.Clients.Group(groupName).SendAsync("TicketUpdated", new
        {
            eventId = streamEvent.EventId,
            requestId = streamEvent.RoomId,
            eventType = streamEvent.EventType,
            data = streamEvent.Payload
        }, cancellationToken);

        _logger.LogDebug("Broadcast ticket update to group {GroupName}", groupName);
    }

    /// <summary>
    /// Broadcast user ticket list update to TicketHub.
    /// Used to notify users subscribed to their ticket list when tickets change.
    /// </summary>
    private async Task BroadcastUserTicketListUpdateAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var ticketHub = scope.ServiceProvider.GetRequiredService<IHubContext<TicketHub>>();

        // RoomId is already in format "user-tickets:{userId}" from Python backend
        var groupName = streamEvent.RoomId;

        // Convert JsonElement values to primitives for SignalR transmission
        var payload = ConvertPayloadDictionary(streamEvent.Payload);

        await ticketHub.Clients.Group(groupName).SendAsync("TicketListUpdated", new
        {
            eventId = streamEvent.EventId,
            updateType = GetPayloadString(streamEvent.Payload, "update_type") ?? "unknown",
            requestId = GetPayloadString(streamEvent.Payload, "request_id"),
            data = payload
        }, cancellationToken);

        _logger.LogInformation("Broadcast ticket list update to group {GroupName}, updateType: {UpdateType}",
            groupName, GetPayloadString(streamEvent.Payload, "update_type") ?? "unknown");
    }

    /// <summary>
    /// Broadcast notification to NotificationHub and ChatHub.
    /// </summary>
    private async Task BroadcastNotificationAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var notificationHub = scope.ServiceProvider.GetRequiredService<IHubContext<NotificationHub>>();
        var chatHub = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();

        // Convert JsonElement values to primitives for SignalR transmission
        var payload = ConvertPayloadDictionary(streamEvent.Payload);

        // BUGFIX: Send to specific user groups on BOTH hubs (like HTTP controller does)
        // streamEvent.RoomId contains the target user's ID
        // Requester app listens on ChatHub (user:{userId} group), IT app on NotificationHub
        var userNotifGroup = $"notifications:{streamEvent.RoomId}";
        var userChatGroup = $"user:{streamEvent.RoomId}";

        await Task.WhenAll(
            notificationHub.Clients.Group(userNotifGroup).SendAsync("Notification", payload, cancellationToken),
            chatHub.Clients.Group(userChatGroup).SendAsync("Notification", payload, cancellationToken)
        );

        _logger.LogInformation("Broadcast notification type: {NotificationType}, user: {UserId}",
            GetPayloadString(streamEvent.Payload, "type") ?? "unknown", streamEvent.RoomId);
    }

    /// <summary>
    /// Broadcast remote access event to NotificationHub.
    /// </summary>
    private async Task BroadcastRemoteAccessEventAsync(IServiceScope scope, StreamEvent streamEvent, CancellationToken cancellationToken)
    {
        var notificationHub = scope.ServiceProvider.GetRequiredService<IHubContext<NotificationHub>>();
        var chatHub = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();

        var methodName = streamEvent.EventType switch
        {
            "remote_session_start" => "RemoteSessionAutoStart",
            "remote_session_end" => "RemoteSessionEnded",
            _ => "RemoteAccessEvent"
        };

        // CRITICAL FIX: Convert JsonElement values to primitives for SignalR transmission
        // Clients expect event data directly (sessionId, agentId, etc.) not nested JsonElement objects
        var payload = ConvertPayloadDictionary(streamEvent.Payload);

        // BUGFIX: Send to specific user groups instead of broadcasting to all clients
        // streamEvent.RoomId contains the requester's user ID for remote session events
        // Send to BOTH NotificationHub and ChatHub (like HTTP controller does)
        var userNotifGroup = $"notifications:{streamEvent.RoomId}";
        var userChatGroup = $"user:{streamEvent.RoomId}";

        await Task.WhenAll(
            notificationHub.Clients.Group(userNotifGroup).SendAsync(methodName, payload, cancellationToken),
            chatHub.Clients.Group(userChatGroup).SendAsync(methodName, payload, cancellationToken)
        );

        _logger.LogInformation("Broadcast remote access event: {EventType}, sessionId: {SessionId}, user: {UserId}",
            streamEvent.EventType, GetPayloadString(streamEvent.Payload, "sessionId") ?? "unknown", streamEvent.RoomId);
    }

    /// <summary>
    /// Acknowledge entry after processing (XACK).
    /// </summary>
    private async Task AckEntryAsync(string streamName, RedisValue entryId)
    {
        try
        {
            var db = _redis.GetDatabase();
            await db.StreamAcknowledgeAsync(streamName, ConsumerGroupName, entryId);
            _logger.LogDebug("Acknowledged entry {EntryId} in stream {StreamName}", entryId, streamName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to acknowledge entry {EntryId} in stream {StreamName}", entryId, streamName);
        }
    }

    /// <summary>
    /// Get consumer lag (number of pending messages).
    /// </summary>
    public async Task<Dictionary<string, long>> GetConsumerLagAsync()
    {
        var db = _redis.GetDatabase();
        var lag = new Dictionary<string, long>();

        foreach (var stream in _streams.Values)
        {
            try
            {
                // Get pending message count for this consumer group
                // StreamPendingAsync returns pending message info
                var pendingInfo = await db.StreamPendingAsync(stream.Name, ConsumerGroupName);
                lag[stream.Name] = pendingInfo.PendingMessageCount;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get consumer lag for stream {StreamName}", stream.Name);
                lag[stream.Name] = -1;
            }
        }

        return lag;
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("RedisStreamConsumer stopping...");
        await base.StopAsync(cancellationToken);
        _logger.LogInformation("RedisStreamConsumer stopped");
    }
}

/// <summary>
/// Stream configuration.
/// </summary>
internal record StreamConfig(string Name, int MaxLength);

/// <summary>
/// Stream event deserialized from Redis.
/// </summary>
internal class StreamEvent
{
    public required string EventId { get; init; }
    public required string EventType { get; init; }
    public required string Timestamp { get; init; }
    public required string RoomId { get; init; }
    public required Dictionary<string, object> Payload { get; init; }
    public EventMetadata? Metadata { get; init; }
}

/// <summary>
/// Event metadata for tracing.
/// </summary>
internal class EventMetadata
{
    public string? TraceId { get; init; }
    public string? SourceInstance { get; init; }
    public int? CoalescedCount { get; init; }
}

/// <summary>
/// Pending delivery tracking for reliable delivery.
/// </summary>
internal class PendingDelivery
{
    public required string StreamName { get; init; }
    public required string EntryId { get; init; }
    public required StreamEvent Event { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public int RetryCount { get; set; }
}
