namespace A2A.Agent.Models;

public sealed record SendMessageRequest
{
    public string? TaskId { get; init; }
    public required A2ARequestMessage Message { get; init; }
}

public sealed record StreamMessageRequest
{
    public required A2ARequestMessage Message { get; init; }
}

public sealed record SendMessageResponse
{
    public required string TaskId { get; init; }
    public required A2AResponseMessage Message { get; init; }
}

public sealed record TaskSummary
{
    public required string TaskId { get; init; }
    public required string Status { get; init; }
    public required int Sequence { get; init; }
}
