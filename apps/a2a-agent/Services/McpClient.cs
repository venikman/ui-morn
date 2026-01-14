using System.Net.Http.Json;
using System.Text.Json;

namespace A2A.Agent.Services;

public sealed class McpClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;

    public McpClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<JsonElement?> ListToolsAsync(CancellationToken cancellationToken)
    {
        var request = new JsonRpcRequest
        {
            Jsonrpc = "2.0",
            Id = Guid.NewGuid().ToString("N"),
            Method = "tools/list",
            Params = new { },
        };

        var response = await _httpClient.PostAsJsonAsync("/mcp", request, JsonOptions, cancellationToken)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(responseStream,
            cancellationToken: cancellationToken).ConfigureAwait(false);
        return document.RootElement.TryGetProperty("result", out var result) ? result.Clone() : null;
    }

    public async Task<McpToolCallResult> CallToolAsync(string toolName, JsonElement arguments, CancellationToken cancellationToken)
    {
        var request = new JsonRpcRequest
        {
            Jsonrpc = "2.0",
            Id = Guid.NewGuid().ToString("N"),
            Method = "tools/call",
            Params = new
            {
                name = toolName,
                arguments,
            },
        };

        var response = await _httpClient.PostAsJsonAsync("/mcp", request, JsonOptions, cancellationToken)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(responseStream,
            cancellationToken: cancellationToken).ConfigureAwait(false);
        var result = document.RootElement.GetProperty("result");
        var isError = result.TryGetProperty("isError", out var isErrorElement) && isErrorElement.GetBoolean();
        var content = new List<McpContentBlock>();
        if (result.TryGetProperty("content", out var contentElement) && contentElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in contentElement.EnumerateArray())
            {
                var type = item.TryGetProperty("type", out var typeElement) ? typeElement.GetString() ?? "text" : "text";
                var text = item.TryGetProperty("text", out var textElement) ? textElement.GetString() ?? string.Empty : string.Empty;
                content.Add(new McpContentBlock(type, text));
            }
        }

        return new McpToolCallResult(isError, content);
    }

    private sealed record JsonRpcRequest
    {
        public required string Jsonrpc { get; init; }
        public required string Id { get; init; }
        public required string Method { get; init; }
        public required object Params { get; init; }
    }
}

public sealed record McpToolCallResult(bool IsError, IReadOnlyList<McpContentBlock> Content);

public sealed record McpContentBlock(string Type, string Text);
