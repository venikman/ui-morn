using System.Text.Json;
using System.Threading.Channels;
using A2A.Agent.Models;

namespace A2A.Agent.Services;

public sealed class TaskState
{
    private readonly object _gate = new();
    private readonly IClock _clock;
    private readonly List<TaskEvent> _events = new();
    private readonly List<Channel<TaskEvent>> _subscribers = new();
    private ToolApprovalRequest? _pendingApproval;
    private int _sequence;

    public TaskState(string taskId, string scenario, IClock clock)
    {
        TaskId = taskId;
        Scenario = scenario;
        _clock = clock;
    }

    public string TaskId { get; }
    public string Scenario { get; }
    public bool IsCompleted { get; private set; }

    public int CurrentSequence
    {
        get
        {
            lock (_gate)
            {
                return _sequence;
            }
        }
    }

    public TaskEvent AddEvent(string status, IReadOnlyList<A2APart> parts)
    {
        TaskEvent taskEvent;
        lock (_gate)
        {
            _sequence++;
            taskEvent = new TaskEvent
            {
                TaskId = TaskId,
                Sequence = _sequence,
                Status = status,
                Parts = parts,
                Timestamp = _clock.UtcNow,
            };
            _events.Add(taskEvent);
            foreach (var subscriber in _subscribers)
            {
                subscriber.Writer.TryWrite(taskEvent);
            }
        }

        return taskEvent;
    }

    public TaskSummary GetSummary()
    {
        return new TaskSummary
        {
            TaskId = TaskId,
            Status = IsCompleted ? "completed" : "working",
            Sequence = CurrentSequence,
        };
    }

    public IAsyncEnumerable<TaskEvent> SubscribeAsync(int afterSequence, CancellationToken cancellationToken)
    {
        var channel = Channel.CreateUnbounded<TaskEvent>();
        lock (_gate)
        {
            foreach (var taskEvent in _events.Where(evt => evt.Sequence > afterSequence))
            {
                channel.Writer.TryWrite(taskEvent);
            }

            if (IsCompleted)
            {
                channel.Writer.TryComplete();
            }
            else
            {
                _subscribers.Add(channel);
            }
        }

        return channel.Reader.ReadAllAsync(cancellationToken);
    }

    public void Complete()
    {
        lock (_gate)
        {
            if (IsCompleted)
            {
                return;
            }

            IsCompleted = true;
            foreach (var subscriber in _subscribers)
            {
                subscriber.Writer.TryComplete();
            }
            _subscribers.Clear();
        }
    }

    public ToolApprovalRequest CreateToolApproval(string toolName, JsonElement arguments)
    {
        var request = new ToolApprovalRequest
        {
            RequestId = Guid.NewGuid().ToString("N"),
            ToolName = toolName,
            Arguments = arguments,
        };

        lock (_gate)
        {
            _pendingApproval = request;
        }

        return request;
    }

    public bool TryResolveApproval(string requestId, bool approved, string? reason)
    {
        ToolApprovalRequest? pending;
        lock (_gate)
        {
            pending = _pendingApproval;
            if (pending is null || !string.Equals(pending.RequestId, requestId, StringComparison.Ordinal))
            {
                return false;
            }

            _pendingApproval = null;
        }

        pending.Completion.TrySetResult(new ToolApprovalDecision(approved, reason));
        return true;
    }

    public async Task<ToolApprovalDecision> WaitForApprovalAsync(ToolApprovalRequest request, CancellationToken cancellationToken)
    {
        using var _ = cancellationToken.Register(() => request.Completion.TrySetCanceled(cancellationToken));
        return await request.Completion.Task.ConfigureAwait(false);
    }
}

public sealed class ToolApprovalRequest
{
    public required string RequestId { get; init; }
    public required string ToolName { get; init; }
    public required JsonElement Arguments { get; init; }
    public TaskCompletionSource<ToolApprovalDecision> Completion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
}

public sealed record ToolApprovalDecision(bool Approved, string? Reason);
