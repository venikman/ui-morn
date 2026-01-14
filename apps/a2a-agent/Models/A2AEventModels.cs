namespace A2A.Agent.Models;

public sealed record TaskEvent
{
    public required string TaskId { get; init; }
    public required int Sequence { get; init; }
    public required string Status { get; init; }
    public required IReadOnlyList<A2APart> Parts { get; init; }
    public required DateTimeOffset Timestamp { get; init; }
}
