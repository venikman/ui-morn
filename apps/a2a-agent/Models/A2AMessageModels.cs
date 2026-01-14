using System.Text.Json;
using System.Text.Json.Serialization;
using A2A.Agent.Services;

namespace A2A.Agent.Models;

public sealed record A2ARequestMessage
{
    public required string Role { get; init; }
    public required IReadOnlyList<A2APart> Parts { get; init; }
    public Dictionary<string, JsonElement>? Metadata { get; init; }
}

public sealed record A2AResponseMessage
{
    public required string Role { get; init; }
    public required IReadOnlyList<A2APart> Parts { get; init; }
}

[JsonConverter(typeof(A2APartJsonConverter))]
public sealed record A2APart
{
    public string? Text { get; init; }
    public A2AFilePart? File { get; init; }
    public A2ADataPart? Data { get; init; }
    public Dictionary<string, string>? Metadata { get; init; }
}

public sealed record A2AFilePart
{
    public string? Name { get; init; }
    public string? ContentType { get; init; }
    public string? Url { get; init; }
}

public sealed record A2ADataPart
{
    public string? MimeType { get; init; }
    public JsonElement? Payload { get; init; }
}
