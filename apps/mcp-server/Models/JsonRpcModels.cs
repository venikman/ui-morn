using System.Text.Json;

namespace Mcp.Server.Models;

public sealed record JsonRpcRequest
{
    public required string Jsonrpc { get; init; }
    public required string Method { get; init; }
    public JsonElement? Params { get; init; }
    public JsonElement? Id { get; init; }
}

public sealed record JsonRpcResponse
{
    public string Jsonrpc { get; init; } = "2.0";
    public JsonElement? Id { get; init; }
    public object? Result { get; init; }
    public JsonRpcError? Error { get; init; }
}

public sealed record JsonRpcError
{
    public required int Code { get; init; }
    public required string Message { get; init; }
    public object? Data { get; init; }
}

public sealed record ToolDefinition
{
    public required string Name { get; init; }
    public required string Description { get; init; }
    public required JsonElement InputSchema { get; init; }
}

public sealed record ToolListResult
{
    public required IReadOnlyList<ToolDefinition> Tools { get; init; }
    public string? NextCursor { get; init; }
}

public sealed record ToolCallParams
{
    public required string Name { get; init; }
    public JsonElement Arguments { get; init; }
}

public sealed record ToolCallResult
{
    public required bool IsError { get; init; }
    public required IReadOnlyList<ToolContentBlock> Content { get; init; }
}

public sealed record ToolContentBlock
{
    public required string Type { get; init; }
    public required string Text { get; init; }
}
