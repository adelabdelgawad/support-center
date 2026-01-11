namespace SignalRService.Middleware;

/// <summary>
/// Middleware to validate internal API key for FastAPI → SignalR communication.
/// Only applied to /internal/* routes.
/// </summary>
public class InternalApiKeyMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string? _apiKey;
    private readonly ILogger<InternalApiKeyMiddleware> _logger;
    private const string ApiKeyHeader = "X-Internal-Api-Key";

    public InternalApiKeyMiddleware(
        RequestDelegate next,
        IConfiguration configuration,
        ILogger<InternalApiKeyMiddleware> logger)
    {
        _next = next;
        _apiKey = configuration["INTERNAL_API_KEY"];
        _logger = logger;

        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("INTERNAL_API_KEY not configured. Internal API routes will be unprotected.");
        }
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Only apply to internal routes
        if (!context.Request.Path.StartsWithSegments("/internal"))
        {
            await _next(context);
            return;
        }

        // If no API key configured, allow all requests (development mode)
        if (string.IsNullOrEmpty(_apiKey))
        {
            await _next(context);
            return;
        }

        // Validate API key
        if (!context.Request.Headers.TryGetValue(ApiKeyHeader, out var providedKey))
        {
            _logger.LogWarning("Internal API request without API key from {RemoteIp}",
                context.Connection.RemoteIpAddress);
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "API key required" });
            return;
        }

        if (providedKey != _apiKey)
        {
            _logger.LogWarning("Invalid internal API key from {RemoteIp}",
                context.Connection.RemoteIpAddress);
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = "Invalid API key" });
            return;
        }

        await _next(context);
    }
}
