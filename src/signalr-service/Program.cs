using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using SignalRService.Hubs;
using SignalRService.Middleware;
using SignalRService.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/signalr-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Register services
builder.Services.AddSingleton<IdempotencyGuard>();
builder.Services.AddSingleton<ConnectionTracker>();

// Register Redis connection for Streams consumer (Feature 001: Real-Time Messaging Latency Optimization)
var redisUrl = builder.Configuration["REDIS_URL"];
bool redisConnected = false;
if (!string.IsNullOrEmpty(redisUrl))
{
    try
    {
        ConfigurationOptions configOptions;

        // Handle redis:// URL format with password but no username
        // Expected format: redis://:password@host:port or redis://:password@host:port/db
        if (redisUrl.StartsWith("redis://"))
        {
            // Parse the URL and convert to StackExchange.Redis format
            var uri = new Uri(redisUrl);

            // Extract password from UserInfo (format is ":password")
            var password = string.Empty;
            if (!string.IsNullOrEmpty(uri.UserInfo))
            {
                // UserInfo starts with ':' for password-only auth
                password = uri.UserInfo.StartsWith(":")
                    ? uri.UserInfo.Substring(1)
                    : uri.UserInfo;
            }

            configOptions = new ConfigurationOptions
            {
                EndPoints = { { uri.Host, uri.Port } },
                Password = password,
                AbortOnConnectFail = false,
                ConnectRetry = 3,
                ConnectTimeout = 5000,
                ReconnectRetryPolicy = new ExponentialRetry(1000)
            };
        }
        else
        {
            // Use standard parsing
            configOptions = ConfigurationOptions.Parse(redisUrl);
            configOptions.AbortOnConnectFail = false;
            configOptions.ConnectRetry = 3;
            configOptions.ConnectTimeout = 5000;
            configOptions.ReconnectRetryPolicy = new ExponentialRetry(1000);
        }

        var redis = ConnectionMultiplexer.Connect(configOptions);
        builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
        redisConnected = true;
        Log.Information("Redis connection established for Streams consumer");
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Failed to connect to Redis. Streams consumer will not function. SignalR will work without real-time stream events.");
    }
}
else
{
    Log.Warning("REDIS_URL not configured. Streams consumer will not function.");
}

// Register Redis Streams consumer (Feature 001: Real-Time Messaging Latency Optimization)
// Only register if Redis connection was successful
if (redisConnected)
{
    builder.Services.AddHostedService<RedisStreamConsumer>();
}

// Configure SignalR
var signalRBuilder = builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    options.MaximumReceiveMessageSize = 1024 * 1024; // 1MB
});

// Redis backplane - enable when needed for horizontal scaling
if (!string.IsNullOrEmpty(redisUrl) && builder.Configuration.GetValue<bool>("EnableRedisBackplane"))
{
    signalRBuilder.AddStackExchangeRedis(redisUrl, options =>
    {
        options.Configuration.ChannelPrefix = RedisChannel.Literal("signalr");
    });
    Log.Information("SignalR Redis backplane enabled");
}

// Configure JWT Authentication
var jwtSecretKey = builder.Configuration["JWT_SECRET_KEY"]
    ?? throw new InvalidOperationException("JWT_SECRET_KEY is required");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
        ClockSkew = TimeSpan.FromMinutes(5)
    };

    // Support token in query string for SignalR
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;

            // Check if request is for SignalR hubs
            if (!string.IsNullOrEmpty(accessToken) &&
                (path.StartsWithSegments("/hubs/chat") ||
                 path.StartsWithSegments("/hubs/ticket") ||
                 path.StartsWithSegments("/hubs/notification") ||
                 path.StartsWithSegments("/hubs/remote-access")))
            {
                context.Token = accessToken;
            }

            return Task.CompletedTask;
        },
        OnAuthenticationFailed = context =>
        {
            Log.Warning("Authentication failed: {Error}", context.Exception.Message);
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
            ?? new[] { "http://localhost:3010", "https://supportcenter.andalusiagroup.net" };

        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

var app = builder.Build();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Middleware
app.UseMiddleware<InternalApiKeyMiddleware>();
app.UseSerilogRequestLogging();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Map controllers for internal API
app.MapControllers();

// Map SignalR hubs
app.MapHub<ChatHub>("/hubs/chat");
app.MapHub<TicketHub>("/hubs/ticket");
app.MapHub<NotificationHub>("/hubs/notification");
app.MapHub<RemoteAccessHub>("/hubs/remote-access");

Log.Information("SignalR Service starting on {Urls}", string.Join(", ", app.Urls));

try
{
    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
