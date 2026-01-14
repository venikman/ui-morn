using System.Text.Json;
using Mcp.Server.Models;

namespace Mcp.Server.Services;

public sealed class ToolRegistry
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IReadOnlyList<ToolDefinition> _tools;

    public ToolRegistry()
    {
        _tools = new List<ToolDefinition>
        {
            new()
            {
                Name = "calc",
                Description = "Evaluate a simple arithmetic expression (a op b).",
                InputSchema = JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        expression = new { type = "string" },
                    },
                    required = new[] { "expression" },
                }, JsonOptions),
            },
            new()
            {
                Name = "http_get",
                Description = "Fetch content from an allowlisted URL.",
                InputSchema = JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        url = new { type = "string", format = "uri" },
                    },
                    required = new[] { "url" },
                }, JsonOptions),
            },
            new()
            {
                Name = "kv_put",
                Description = "Store a value in the local key-value store.",
                InputSchema = JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        key = new { type = "string" },
                        value = new { type = "string" },
                    },
                    required = new[] { "key", "value" },
                }, JsonOptions),
            },
            new()
            {
                Name = "kv_get",
                Description = "Fetch a value from the local key-value store.",
                InputSchema = JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        key = new { type = "string" },
                    },
                    required = new[] { "key" },
                }, JsonOptions),
            },
            new()
            {
                Name = "search_docs",
                Description = "Search the local documentation snippets.",
                InputSchema = JsonSerializer.SerializeToElement(new
                {
                    type = "object",
                    properties = new
                    {
                        query = new { type = "string" },
                    },
                    required = new[] { "query" },
                }, JsonOptions),
            },
        };
    }

    public ToolListResult List(string? cursor, int pageSize)
    {
        var offset = 0;
        if (!string.IsNullOrWhiteSpace(cursor) && int.TryParse(cursor, out var parsedOffset))
        {
            offset = Math.Max(parsedOffset, 0);
        }

        var page = _tools.Skip(offset).Take(pageSize).ToArray();
        var nextCursor = offset + pageSize < _tools.Count ? (offset + pageSize).ToString() : null;

        return new ToolListResult
        {
            Tools = page,
            NextCursor = nextCursor,
        };
    }

    public ToolDefinition? Find(string name)
    {
        return _tools.FirstOrDefault(tool => string.Equals(tool.Name, name, StringComparison.Ordinal));
    }
}
