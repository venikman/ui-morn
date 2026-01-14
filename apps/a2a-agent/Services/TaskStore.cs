using System.Collections.Concurrent;
using A2A.Agent.Models;

namespace A2A.Agent.Services;

public sealed class TaskStore
{
    private readonly ConcurrentDictionary<string, TaskState> _tasks = new();
    private readonly IClock _clock;

    public TaskStore(IClock clock)
    {
        _clock = clock;
    }

    public TaskState CreateTask(string scenario)
    {
        var taskId = $"task_{Guid.NewGuid():N}";
        var taskState = new TaskState(taskId, scenario, _clock);
        _tasks[taskId] = taskState;
        return taskState;
    }

    public bool TryGetTask(string taskId, out TaskState? taskState)
    {
        return _tasks.TryGetValue(taskId, out taskState);
    }

    public IReadOnlyCollection<TaskSummary> GetSummaries()
    {
        return _tasks.Values.Select(task => task.GetSummary()).ToArray();
    }
}
