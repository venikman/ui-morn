using System.Text.Json;
using Mcp.Server.Models;
using Mcp.Server.Services;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();

const string UiCorsPolicy = "ui";
builder.Services.AddCors(options =>
{
    options.AddPolicy(UiCorsPolicy, policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(_ => true);
        }
        else
        {
            var allowedOrigins = GetCorsOrigins(builder.Configuration);
            if (allowedOrigins.Length > 0)
            {
                policy.WithOrigins(allowedOrigins);
            }
            else
            {
                policy.WithOrigins(
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "https://localhost:3000",
                    "https://127.0.0.1:3000");
            }
        }

        policy.AllowAnyHeader()
            .AllowAnyMethod()
            .WithExposedHeaders("Mcp-Session-Id");
    });
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

builder.Services.AddHttpClient();
builder.Services.AddSingleton<ToolRegistry>();
builder.Services.AddSingleton<ToolExecutor>();
builder.Services.AddSingleton<SessionStore>();

var app = builder.Build();

app.UseCors(UiCorsPolicy);

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

app.MapGet("/", () => "MCP tool server running.");

app.MapPost("/mcp", async (
        HttpRequest httpRequest,
        HttpResponse httpResponse,
        ToolRegistry registry,
        ToolExecutor executor,
        SessionStore sessions,
        CancellationToken cancellationToken) =>
    {
        var rpcRequest = await httpRequest.ReadFromJsonAsync<JsonRpcRequest>(jsonOptions, cancellationToken)
            .ConfigureAwait(false);

        if (rpcRequest is null)
        {
            return Results.BadRequest(new JsonRpcResponse
            {
                Error = new JsonRpcError
                {
                    Code = -32700,
                    Message = "Invalid JSON",
                },
            });
        }

        if (!string.Equals(rpcRequest.Jsonrpc, "2.0", StringComparison.Ordinal))
        {
            return Results.BadRequest(new JsonRpcResponse
            {
                Id = rpcRequest.Id,
                Error = new JsonRpcError
                {
                    Code = -32600,
                    Message = "Invalid JSON-RPC version",
                },
            });
        }

        switch (rpcRequest.Method)
        {
            case "tools/list":
                return Results.Ok(HandleToolList(rpcRequest, registry));
            case "tools/call":
                return await HandleToolCallAsync(rpcRequest, httpRequest, httpResponse, executor, sessions, cancellationToken)
                    .ConfigureAwait(false);
            default:
                return Results.NotFound(new JsonRpcResponse
                {
                    Id = rpcRequest.Id,
                    Error = new JsonRpcError
                    {
                        Code = -32601,
                        Message = "Method not found",
                    },
                });
        }
    })
    .Produces<JsonRpcResponse>(StatusCodes.Status200OK)
    .Produces<JsonRpcResponse>(StatusCodes.Status400BadRequest)
    .Produces<JsonRpcResponse>(StatusCodes.Status404NotFound);

app.MapDefaultEndpoints();

app.Run();

static JsonRpcResponse HandleToolList(JsonRpcRequest request, ToolRegistry registry)
{
    var cursor = request.Params.HasValue && request.Params.Value.ValueKind == JsonValueKind.Object
        && request.Params.Value.TryGetProperty("cursor", out var cursorElement)
        ? cursorElement.GetString()
        : null;

    var result = registry.List(cursor, pageSize: 2);
    return new JsonRpcResponse
    {
        Id = request.Id,
        Result = new
        {
            tools = result.Tools,
            nextCursor = result.NextCursor,
        },
    };
}

static async Task<IResult> HandleToolCallAsync(
    JsonRpcRequest request,
    HttpRequest httpRequest,
    HttpResponse httpResponse,
    ToolExecutor executor,
    SessionStore sessions,
    CancellationToken cancellationToken)
{
    if (!request.Params.HasValue || request.Params.Value.ValueKind != JsonValueKind.Object)
    {
        return Results.BadRequest(new JsonRpcResponse
        {
            Id = request.Id,
            Error = new JsonRpcError
            {
                Code = -32602,
                Message = "Invalid params",
            },
        });
    }

    if (!request.Params.Value.TryGetProperty("name", out var nameElement) || nameElement.ValueKind != JsonValueKind.String)
    {
        return Results.BadRequest(new JsonRpcResponse
        {
            Id = request.Id,
            Error = new JsonRpcError
            {
                Code = -32602,
                Message = "Missing tool name",
            },
        });
    }

    var name = nameElement.GetString() ?? string.Empty;
    if (!request.Params.Value.TryGetProperty("arguments", out var argumentsElement)
        || argumentsElement.ValueKind != JsonValueKind.Object)
    {
        return Results.BadRequest(new JsonRpcResponse
        {
            Id = request.Id,
            Error = new JsonRpcError
            {
                Code = -32602,
                Message = "Missing tool arguments",
            },
        });
    }

    var arguments = argumentsElement;

    var accept = httpRequest.Headers.Accept.ToString();
    var streamRequested = accept.Contains("text/event-stream", StringComparison.OrdinalIgnoreCase)
        || string.Equals(httpRequest.Headers["X-MCP-Stream"], "true", StringComparison.OrdinalIgnoreCase);

    if (!streamRequested)
    {
        var result = await executor.ExecuteAsync(name, arguments, cancellationToken).ConfigureAwait(false);
        return Results.Ok(new JsonRpcResponse
        {
            Id = request.Id,
            Result = new
            {
                isError = result.IsError,
                content = result.Content,
            },
        });
    }

    var session = sessions.GetOrCreate(httpRequest.Headers["Mcp-Session-Id"].ToString(), out var sessionId);
    var lastEventId = ParseLastEventId(httpRequest.Headers["Last-Event-ID"].ToString());

    httpResponse.StatusCode = StatusCodes.Status200OK;
    SseWriter.PrepareSseResponse(httpResponse, sessionId);

    var streamJsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

    var replayEvents = session.GetEventsAfter(lastEventId);
    if (replayEvents.Count > 0 && lastEventId > 0)
    {
        foreach (var replay in replayEvents)
        {
            await SseWriter.WriteEventAsync(httpResponse, replay, cancellationToken).ConfigureAwait(false);
        }

        return Results.Empty;
    }

    var started = session.AddEvent("tool.started", JsonSerializer.Serialize(new
    {
        jsonrpc = "2.0",
        id = request.Id,
        result = new
        {
            isPartial = true,
            content = new[]
            {
                new { type = "text", text = $"Calling {name}..." },
            },
        },
    }, streamJsonOptions));

    await SseWriter.WriteEventAsync(httpResponse, started, cancellationToken).ConfigureAwait(false);

    var toolResult = await executor.ExecuteAsync(name, arguments, cancellationToken).ConfigureAwait(false);
    var resultEvent = session.AddEvent("tool.result", JsonSerializer.Serialize(new
    {
        jsonrpc = "2.0",
        id = request.Id,
        result = new
        {
            isError = toolResult.IsError,
            content = toolResult.Content,
        },
    }, streamJsonOptions));

    await SseWriter.WriteEventAsync(httpResponse, resultEvent, cancellationToken).ConfigureAwait(false);

    var doneEvent = session.AddEvent("tool.done", JsonSerializer.Serialize(new
    {
        jsonrpc = "2.0",
        id = request.Id,
        result = new
        {
            isPartial = false,
            content = toolResult.Content,
        },
    }, streamJsonOptions));

    await SseWriter.WriteEventAsync(httpResponse, doneEvent, cancellationToken).ConfigureAwait(false);

    return Results.Empty;
}

static int ParseLastEventId(string? value)
{
    return int.TryParse(value, out var lastEventId) ? lastEventId : 0;
}

static string[] GetCorsOrigins(IConfiguration configuration)
{
    var value = configuration["CORS_ALLOWED_ORIGINS"] ?? configuration["Cors:AllowedOrigins"];
    if (string.IsNullOrWhiteSpace(value))
    {
        return Array.Empty<string>();
    }

    return value.Split(new[] { ',', ';', ' ' },
        StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
