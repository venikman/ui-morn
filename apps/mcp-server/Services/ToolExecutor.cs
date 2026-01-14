using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Mcp.Server.Models;

namespace Mcp.Server.Services;

public sealed class ToolExecutor
{
    private readonly HttpClient _httpClient;
    private readonly ConcurrentDictionary<string, string> _kvStore = new();
    private readonly IReadOnlyList<string> _docs;
    private readonly HashSet<string> _allowlist = new(StringComparer.OrdinalIgnoreCase)
    {
        "https://example.com",
        "https://httpbin.org/get",
    };

    public ToolExecutor(IHttpClientFactory httpClientFactory, IWebHostEnvironment environment)
    {
        _httpClient = httpClientFactory.CreateClient();
        _docs = LoadDocs(environment.ContentRootPath);
    }

    public async Task<ToolCallResult> ExecuteAsync(string name, JsonElement arguments, CancellationToken cancellationToken)
    {
        switch (name)
        {
            case "calc":
                return ExecuteCalc(arguments);
            case "http_get":
                return await ExecuteHttpGetAsync(arguments, cancellationToken).ConfigureAwait(false);
            case "kv_put":
                return ExecuteKvPut(arguments);
            case "kv_get":
                return ExecuteKvGet(arguments);
            case "search_docs":
                return ExecuteSearch(arguments);
            default:
                return Error($"Unknown tool '{name}'.");
        }
    }

    private static ToolCallResult ExecuteCalc(JsonElement arguments)
    {
        if (!arguments.TryGetProperty("expression", out var expressionElement)
            || expressionElement.ValueKind != JsonValueKind.String)
        {
            return Error("Missing expression.");
        }

        var expression = expressionElement.GetString() ?? string.Empty;
        var match = Regex.Match(expression, "^\\s*(-?\\d+(?:\\.\\d+)?)\\s*([+\\-*/])\\s*(-?\\d+(?:\\.\\d+)?)\\s*$");
        if (!match.Success)
        {
            return Error("Expression must be in the form 'a op b'.");
        }

        var left = double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        var op = match.Groups[2].Value;
        var right = double.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        var result = op switch
        {
            "+" => left + right,
            "-" => left - right,
            "*" => left * right,
            "/" => right == 0 ? double.NaN : left / right,
            _ => double.NaN,
        };

        return Ok($"Result: {result}");
    }

    private async Task<ToolCallResult> ExecuteHttpGetAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!arguments.TryGetProperty("url", out var urlElement) || urlElement.ValueKind != JsonValueKind.String)
        {
            return Error("Missing url.");
        }

        var url = urlElement.GetString() ?? string.Empty;
        if (!_allowlist.Contains(url))
        {
            return Error("URL is not in the allowlist.");
        }

        var response = await _httpClient.GetAsync(url, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        var snippet = content.Length > 300 ? content[..300] + "..." : content;

        return Ok($"Fetched {url} (snippet):\n{snippet}");
    }

    private ToolCallResult ExecuteKvPut(JsonElement arguments)
    {
        if (!arguments.TryGetProperty("key", out var keyElement) || keyElement.ValueKind != JsonValueKind.String)
        {
            return Error("Missing key.");
        }

        if (!arguments.TryGetProperty("value", out var valueElement) || valueElement.ValueKind != JsonValueKind.String)
        {
            return Error("Missing value.");
        }

        _kvStore[keyElement.GetString() ?? string.Empty] = valueElement.GetString() ?? string.Empty;
        return Ok("Stored value.");
    }

    private ToolCallResult ExecuteKvGet(JsonElement arguments)
    {
        if (!arguments.TryGetProperty("key", out var keyElement) || keyElement.ValueKind != JsonValueKind.String)
        {
            return Error("Missing key.");
        }

        var key = keyElement.GetString() ?? string.Empty;
        return _kvStore.TryGetValue(key, out var value)
            ? Ok($"Value for '{key}': {value}")
            : Error($"Key '{key}' not found.");
    }

    private ToolCallResult ExecuteSearch(JsonElement arguments)
    {
        if (!arguments.TryGetProperty("query", out var queryElement) || queryElement.ValueKind != JsonValueKind.String)
        {
            return Error("Missing query.");
        }

        var query = queryElement.GetString() ?? string.Empty;
        var matches = _docs
            .SelectMany(text => text.Split('\n'))
            .Where(line => line.Contains(query, StringComparison.OrdinalIgnoreCase))
            .Take(5)
            .ToArray();

        if (matches.Length == 0)
        {
            return Ok("No matches found.");
        }

        return Ok("Matches:\n" + string.Join('\n', matches));
    }

    private static IReadOnlyList<string> LoadDocs(string contentRoot)
    {
        var docsPath = Path.Combine(contentRoot, "Docs");
        if (!Directory.Exists(docsPath))
        {
            return Array.Empty<string>();
        }

        return Directory.GetFiles(docsPath, "*.txt")
            .Select(File.ReadAllText)
            .ToArray();
    }

    private static ToolCallResult Ok(string text)
    {
        return new ToolCallResult
        {
            IsError = false,
            Content = new[]
            {
                new ToolContentBlock
                {
                    Type = "text",
                    Text = text,
                },
            },
        };
    }

    private static ToolCallResult Error(string message)
    {
        return new ToolCallResult
        {
            IsError = true,
            Content = new[]
            {
                new ToolContentBlock
                {
                    Type = "text",
                    Text = message,
                },
            },
        };
    }
}
