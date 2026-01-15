using System.Text.Json;
using A2A.Agent.Models;
using A2A.Agent.Services;
using Azure.Identity;
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
            .AllowAnyMethod();
    });
});

LoadEnvFile(Path.Combine(builder.Environment.ContentRootPath, ".env"));
var repoRoot = Directory.GetParent(builder.Environment.ContentRootPath)?.Parent?.FullName;
if (!string.IsNullOrWhiteSpace(repoRoot))
{
    LoadEnvFile(Path.Combine(repoRoot, ".env"));
}

TryAddKeyVault(builder.Configuration);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton<TaskStore>();
var openRouterOptions = CreateOpenRouterOptions(builder.Configuration);
ValidateOpenRouterOptions(openRouterOptions);
builder.Services.AddSingleton(openRouterOptions);
builder.Services.AddHttpClient<OpenRouterClient>();
builder.Services.AddSingleton<ScenarioRunner>();
builder.Services.AddHttpClient<McpClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Mcp:BaseUrl"] ?? "http://localhost:5040");
});

var app = builder.Build();

app.UseCors(UiCorsPolicy);

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

const string A2UiExtension = "https://a2ui.org/a2a-extension/a2ui/v0.8";

app.MapGet("/", () => "A2A agent server running.");

app.MapGet("/.well-known/agent-card.json", () =>
    TypedResults.Json(new
    {
        name = "Protocol Bakeoff Agent",
        version = "0.1.0",
        capabilities = new
        {
            streaming = new { sse = true },
            extensions = new[] { A2UiExtension },
        },
        endpoints = new
        {
            messageSend = "/v1/message:send",
            messageStream = "/v1/message:stream",
        },
    }));

var healthInfoRoute = app.MapGet("/health/info", (OpenRouterOptions options) =>
    TypedResults.Ok(new
    {
        status = "ok",
        openRouter = new
        {
            configured = options.IsConfigured,
            baseUrl = options.BaseUrl,
            model = options.Model,
        },
    }));

if (healthInfoRoute is RouteHandlerBuilder healthRouteBuilder)
{
    healthRouteBuilder.Produces(StatusCodes.Status200OK);
}

var openRouterHealthRoute = app.MapGet("/health/openrouter",
    async (HttpContext context) =>
    {
        var services = context.RequestServices;
        var client = services.GetRequiredService<OpenRouterClient>();
        var options = services.GetRequiredService<OpenRouterOptions>();
        var configuration = services.GetRequiredService<IConfiguration>();

        if (!IsOpenRouterProbeEnabled(configuration))
        {
            await TypedResults.NotFound().ExecuteAsync(context).ConfigureAwait(false);
            return;
        }

        if (!options.IsConfigured)
        {
            await TypedResults.Problem(
                    title: "OpenRouter not configured",
                    detail: "Set OpenRouter:ApiKey or OPENROUTER_API_KEY.",
                    statusCode: StatusCodes.Status503ServiceUnavailable)
                .ExecuteAsync(context)
                .ConfigureAwait(false);
            return;
        }

        var ok = await client.TryProbeAsync(context.RequestAborted).ConfigureAwait(false);
        if (!ok)
        {
            await TypedResults.Problem(
                    title: "OpenRouter probe failed",
                    detail: "OpenRouter did not respond successfully.",
                    statusCode: StatusCodes.Status503ServiceUnavailable)
                .ExecuteAsync(context)
                .ConfigureAwait(false);
            return;
        }

        await TypedResults.Ok(new { status = "ok" }).ExecuteAsync(context).ConfigureAwait(false);
    });

if (openRouterHealthRoute is RouteHandlerBuilder openRouterHealthRouteBuilder)
{
    openRouterHealthRouteBuilder
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status503ServiceUnavailable, "application/problem+json")
        .Produces(StatusCodes.Status404NotFound);
}

var sendRoute = app.MapPost("/v1/message:send", async (HttpContext context) =>
    {
        var request = await context.Request.ReadFromJsonAsync<SendMessageRequest>(jsonOptions, context.RequestAborted)
            .ConfigureAwait(false);
        if (request is null)
        {
            await TypedResults.Problem(
                    title: "Invalid request",
                    detail: "Missing request body.",
                    statusCode: StatusCodes.Status400BadRequest)
                .ExecuteAsync(context)
                .ConfigureAwait(false);
            return;
        }

        var taskStore = context.RequestServices.GetRequiredService<TaskStore>();

        if (!A2APartValidator.TryValidate(request.Message, out var validationError))
        {
            await TypedResults.Problem(
                    title: "Invalid message parts",
                    detail: validationError,
                    statusCode: StatusCodes.Status400BadRequest)
                .ExecuteAsync(context)
                .ConfigureAwait(false);
            return;
        }

        if (!string.IsNullOrWhiteSpace(request.TaskId)
            && taskStore.TryGetTask(request.TaskId!, out var existingTask)
            && existingTask is not null)
        {
            if (TryHandleToolApproval(request.Message, existingTask))
            {
                await TypedResults.Ok(new SendMessageResponse
                    {
                        TaskId = existingTask.TaskId,
                        Message = new A2AResponseMessage
                        {
                            Role = "agent",
                            Parts = new[] { new A2APart { Text = "Approval received." } },
                        },
                    })
                    .ExecuteAsync(context)
                    .ConfigureAwait(false);
                return;
            }

            if (TryHandleUserAction(request.Message, out var userAction, out var errorMessage)
                && userAction is not null)
            {
                if (!TryValidateUserAction(userAction, out var validationDetails))
                {
                    await TypedResults.Problem(
                            title: "Validation failed",
                            detail: validationDetails,
                            statusCode: StatusCodes.Status422UnprocessableEntity)
                        .ExecuteAsync(context)
                        .ConfigureAwait(false);
                    return;
                }

                await TypedResults.Ok(new SendMessageResponse
                    {
                        TaskId = existingTask.TaskId,
                        Message = new A2AResponseMessage
                        {
                            Role = "agent",
                            Parts = new[]
                            {
                                new A2APart
                                {
                                    Text = $"Confirmed: {userAction.Name} ({userAction.Email}) for {userAction.Project}. Priority {userAction.Priority}.",
                                },
                            },
                        },
                    })
                    .ExecuteAsync(context)
                    .ConfigureAwait(false);
                return;
            }

            if (!string.IsNullOrWhiteSpace(errorMessage))
            {
                await TypedResults.Problem(
                        title: "Invalid user action",
                        detail: errorMessage,
                        statusCode: StatusCodes.Status400BadRequest)
                    .ExecuteAsync(context)
                    .ConfigureAwait(false);
                return;
            }
        }

        await TypedResults.Problem(
                title: "Unsupported request",
                detail: "Only tool approvals and A2UI user actions are accepted for existing tasks.",
                statusCode: StatusCodes.Status400BadRequest)
            .ExecuteAsync(context)
            .ConfigureAwait(false);
    })
    ;

if (sendRoute is RouteHandlerBuilder sendRouteBuilder)
{
    sendRouteBuilder
        .Produces<SendMessageResponse>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity, "application/problem+json");
}

var streamRoute = app.MapPost("/v1/message:stream", async (HttpContext context) =>
    {
        var cancellationToken = context.RequestAborted;
        var request = await context.Request.ReadFromJsonAsync<StreamMessageRequest>(jsonOptions, cancellationToken)
            .ConfigureAwait(false);
        if (request is null)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Title = "Invalid request",
                Detail = "Missing request body.",
                Status = StatusCodes.Status400BadRequest,
            }, cancellationToken).ConfigureAwait(false);
            return;
        }

        if (!A2APartValidator.TryValidate(request.Message, out var validationError))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Title = "Invalid message parts",
                Detail = validationError,
                Status = StatusCodes.Status400BadRequest,
            }, cancellationToken).ConfigureAwait(false);
            return;
        }

        var scenario = request.Message.Metadata?.TryGetValue("scenario", out var scenarioElement) == true
            && scenarioElement.ValueKind == JsonValueKind.String
            ? scenarioElement.GetString() ?? "markdown"
            : "markdown";

        var taskStore = context.RequestServices.GetRequiredService<TaskStore>();
        var runner = context.RequestServices.GetRequiredService<ScenarioRunner>();
        var task = taskStore.CreateTask(scenario);
        var extensions = context.Request.Headers["X-A2A-Extensions"].ToString();
        var a2uiEnabled = extensions.Contains(A2UiExtension, StringComparison.OrdinalIgnoreCase);

        _ = Task.Run(async () =>
        {
            try
            {
                await runner.RunAsync(task, request.Message, a2uiEnabled, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                task.AddEvent("error", new[] { new A2APart { Text = $"Error: {ex.Message}" } });
            }
            finally
            {
                task.Complete();
            }
        }, CancellationToken.None);

        SseWriter.PrepareSseResponse(context.Response);
        var lastEventId = ParseLastEventId(context.Request.Headers["Last-Event-ID"].ToString());
        await foreach (var taskEvent in task.SubscribeAsync(lastEventId, cancellationToken))
        {
            var payload = JsonSerializer.Serialize(taskEvent, jsonOptions);
            await SseWriter.WriteEventAsync(context.Response, "task.update", payload, taskEvent.Sequence, cancellationToken)
                .ConfigureAwait(false);
        }
    });

if (streamRoute is RouteHandlerBuilder streamRouteBuilder)
{
    streamRouteBuilder
        .Produces(StatusCodes.Status200OK, contentType: "text/event-stream")
        .Produces<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json");
}

var getTaskRoute = app.MapGet("/v1/tasks/{taskId}", async (HttpContext context) =>
    {
        var taskId = context.Request.RouteValues["taskId"]?.ToString();
        if (string.IsNullOrWhiteSpace(taskId))
        {
            await TypedResults.Problem(
                    title: "Task not found",
                    detail: "No task with the given id exists.",
                    statusCode: StatusCodes.Status404NotFound)
                .ExecuteAsync(context)
                .ConfigureAwait(false);
            return;
        }

        var taskStore = context.RequestServices.GetRequiredService<TaskStore>();
        if (!taskStore.TryGetTask(taskId, out var task) || task is null)
        {
            await TypedResults.Problem(
                    title: "Task not found",
                    detail: "No task with the given id exists.",
                    statusCode: StatusCodes.Status404NotFound)
                .ExecuteAsync(context)
                .ConfigureAwait(false);
            return;
        }

        await TypedResults.Ok(task.GetSummary()).ExecuteAsync(context).ConfigureAwait(false);
    });

if (getTaskRoute is RouteHandlerBuilder getTaskRouteBuilder)
{
    getTaskRouteBuilder
        .Produces<TaskSummary>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json");
}

var subscribeRoute = app.MapPost("/v1/tasks/{taskId}:subscribe", async (HttpContext context) =>
    {
        var cancellationToken = context.RequestAborted;
        var taskId = context.Request.RouteValues["taskId"]?.ToString();
        if (string.IsNullOrWhiteSpace(taskId))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Title = "Task not found",
                Detail = "No task with the given id exists.",
                Status = StatusCodes.Status404NotFound,
            }, cancellationToken).ConfigureAwait(false);
            return;
        }

        var taskStore = context.RequestServices.GetRequiredService<TaskStore>();
        if (!taskStore.TryGetTask(taskId, out var task) || task is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Title = "Task not found",
                Detail = "No task with the given id exists.",
                Status = StatusCodes.Status404NotFound,
            }, cancellationToken).ConfigureAwait(false);
            return;
        }

        SseWriter.PrepareSseResponse(context.Response);
        var lastEventId = ParseLastEventId(context.Request.Headers["Last-Event-ID"].ToString());
        await foreach (var taskEvent in task.SubscribeAsync(lastEventId, cancellationToken))
        {
            var payload = JsonSerializer.Serialize(taskEvent, jsonOptions);
            await SseWriter.WriteEventAsync(context.Response, "task.update", payload, taskEvent.Sequence, cancellationToken)
                .ConfigureAwait(false);
        }
    });

if (subscribeRoute is RouteHandlerBuilder subscribeRouteBuilder)
{
    subscribeRouteBuilder
        .Produces(StatusCodes.Status200OK, contentType: "text/event-stream")
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json");
}

app.MapDefaultEndpoints();

app.Run();

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

static OpenRouterOptions CreateOpenRouterOptions(IConfiguration configuration)
{
    var options = new OpenRouterOptions();
    options.BaseUrl = configuration["OpenRouter:BaseUrl"]
        ?? Environment.GetEnvironmentVariable("OPENROUTER_BASE_URL")
        ?? OpenRouterOptions.DefaultBaseUrl;
    options.Model = configuration["OpenRouter:Model"]
        ?? Environment.GetEnvironmentVariable("OPENROUTER_MODEL")
        ?? OpenRouterOptions.DefaultModel;
    options.ApiKey = configuration["OpenRouter:ApiKey"]
        ?? Environment.GetEnvironmentVariable("OPENROUTER_API_KEY");
    return options;
}

static void ValidateOpenRouterOptions(OpenRouterOptions options)
{
    if (!options.IsConfigured)
    {
        throw new InvalidOperationException(
            "OpenRouter is not configured. Set OpenRouter:ApiKey or OPENROUTER_API_KEY.");
    }
}

static void TryAddKeyVault(ConfigurationManager configuration)
{
    var keyVaultUri = GetKeyVaultUri(configuration);
    if (string.IsNullOrWhiteSpace(keyVaultUri))
    {
        return;
    }

    if (!Uri.TryCreate(keyVaultUri, UriKind.Absolute, out var parsedUri))
    {
        throw new InvalidOperationException(
            $"Invalid Key Vault URI '{keyVaultUri}'. Set KeyVault:Uri or KEYVAULT_URI to a valid absolute URI.");
    }

    configuration.AddAzureKeyVault(parsedUri, new DefaultAzureCredential());
}

static string? GetKeyVaultUri(IConfiguration configuration)
{
    var keyVaultUri = configuration["KeyVault:Uri"]
        ?? Environment.GetEnvironmentVariable("KeyVault__Uri")
        ?? Environment.GetEnvironmentVariable("KEYVAULT_URI")
        ?? Environment.GetEnvironmentVariable("AZURE_KEYVAULT_URI");
    if (!string.IsNullOrWhiteSpace(keyVaultUri))
    {
        return keyVaultUri;
    }

    var keyVaultName = configuration["KeyVault:Name"]
        ?? Environment.GetEnvironmentVariable("KeyVault__Name")
        ?? Environment.GetEnvironmentVariable("KEYVAULT_NAME")
        ?? Environment.GetEnvironmentVariable("AZURE_KEYVAULT_NAME");
    if (string.IsNullOrWhiteSpace(keyVaultName))
    {
        return null;
    }

    return $"https://{keyVaultName}.vault.azure.net/";
}

static void LoadEnvFile(string path)
{
    if (!File.Exists(path))
    {
        return;
    }

    foreach (var line in File.ReadLines(path))
    {
        var trimmed = line.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
        {
            continue;
        }

        var separatorIndex = trimmed.IndexOf('=');
        if (separatorIndex <= 0)
        {
            continue;
        }

        var key = trimmed[..separatorIndex].Trim();
        var value = trimmed[(separatorIndex + 1)..].Trim();

        if ((value.StartsWith('\"') && value.EndsWith('\"'))
            || (value.StartsWith('\'') && value.EndsWith('\'')))
        {
            value = value[1..^1];
        }

        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key)))
        {
            Environment.SetEnvironmentVariable(key, value);
        }
    }
}

static bool TryHandleToolApproval(A2ARequestMessage message, TaskState task)
{
    foreach (var part in message.Parts)
    {
        if (part.Data?.MimeType != "application/json" || part.Data.Payload is null)
        {
            continue;
        }

        if (!part.Data.Payload.Value.TryGetProperty("toolApproval", out var approvalElement))
        {
            continue;
        }

        if (!approvalElement.TryGetProperty("requestId", out var requestIdElement)
            || requestIdElement.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var approved = approvalElement.TryGetProperty("approved", out var approvedElement)
            && approvedElement.ValueKind == JsonValueKind.True;
        var reason = approvalElement.TryGetProperty("reason", out var reasonElement)
            ? reasonElement.GetString()
            : null;

        return task.TryResolveApproval(requestIdElement.GetString() ?? string.Empty, approved, reason);
    }

    return false;
}

static bool TryHandleUserAction(A2ARequestMessage message, out UserActionPayload? payload, out string? error)
{
    foreach (var part in message.Parts)
    {
        if (part.Data?.MimeType != "application/json+a2ui" || part.Data.Payload is null)
        {
            continue;
        }

        if (!part.Data.Payload.Value.TryGetProperty("userAction", out var actionElement))
        {
            continue;
        }

        if (!actionElement.TryGetProperty("action", out var actionNameElement)
            || actionNameElement.ValueKind != JsonValueKind.String)
        {
            error = "User action missing action name.";
            payload = null;
            return false;
        }

        if (!string.Equals(actionNameElement.GetString(), "submit_form", StringComparison.Ordinal))
        {
            error = "Unsupported user action.";
            payload = null;
            return false;
        }

        if (!actionElement.TryGetProperty("inputs", out var inputsElement) || inputsElement.ValueKind != JsonValueKind.Object)
        {
            error = "User action inputs missing.";
            payload = null;
            return false;
        }

        payload = new UserActionPayload
        {
            Name = inputsElement.TryGetProperty("name", out var nameElement) ? nameElement.GetString() ?? string.Empty : string.Empty,
            Email = inputsElement.TryGetProperty("email", out var emailElement) ? emailElement.GetString() ?? string.Empty : string.Empty,
            Project = inputsElement.TryGetProperty("project", out var projectElement) ? projectElement.GetString() ?? string.Empty : string.Empty,
            Priority = inputsElement.TryGetProperty("priority", out var priorityElement) ? priorityElement.GetString() ?? string.Empty : string.Empty,
            Subscribe = inputsElement.TryGetProperty("subscribe", out var subscribeElement) && subscribeElement.ValueKind == JsonValueKind.True,
        };

        error = null;
        return true;
    }

    payload = null;
    error = null;
    return false;
}

static bool IsOpenRouterProbeEnabled(IConfiguration configuration)
{
    var value = configuration["OpenRouter:ProbeEnabled"]
        ?? Environment.GetEnvironmentVariable("OPENROUTER_PROBE_ENABLED");
    return bool.TryParse(value, out var enabled) && enabled;
}

static bool TryValidateUserAction(UserActionPayload payload, out string detail)
{
    var missing = new List<string>();
    if (string.IsNullOrWhiteSpace(payload.Name))
    {
        missing.Add("name");
    }

    if (string.IsNullOrWhiteSpace(payload.Email) || !payload.Email.Contains('@'))
    {
        missing.Add("email");
    }

    if (string.IsNullOrWhiteSpace(payload.Project))
    {
        missing.Add("project");
    }

    if (string.IsNullOrWhiteSpace(payload.Priority))
    {
        missing.Add("priority");
    }

    if (missing.Count == 0)
    {
        detail = string.Empty;
        return true;
    }

    detail = $"Missing or invalid fields: {string.Join(", ", missing)}";
    return false;
}

sealed record UserActionPayload
{
    public required string Name { get; init; }
    public required string Email { get; init; }
    public required string Project { get; init; }
    public required string Priority { get; init; }
    public required bool Subscribe { get; init; }
}
