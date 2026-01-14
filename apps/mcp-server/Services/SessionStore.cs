using System.Collections.Concurrent;

namespace Mcp.Server.Services;

public sealed class SessionStore
{
    private readonly ConcurrentDictionary<string, SessionState> _sessions = new();

    public SessionState GetOrCreate(string? sessionId, out string resolvedSessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            resolvedSessionId = $"session_{Guid.NewGuid():N}";
            return _sessions.GetOrAdd(resolvedSessionId, _ => new SessionState());
        }

        resolvedSessionId = sessionId;
        return _sessions.GetOrAdd(sessionId, _ => new SessionState());
    }
}

public sealed class SessionState
{
    private readonly object _gate = new();
    private readonly List<SseEvent> _events = new();
    private int _nextId;

    public SseEvent AddEvent(string eventName, string data)
    {
        lock (_gate)
        {
            _nextId++;
            var sseEvent = new SseEvent(_nextId, eventName, data, DateTimeOffset.UtcNow);
            _events.Add(sseEvent);
            return sseEvent;
        }
    }

    public IReadOnlyList<SseEvent> GetEventsAfter(int lastEventId)
    {
        lock (_gate)
        {
            return _events.Where(evt => evt.Id > lastEventId).ToArray();
        }
    }
}

public sealed record SseEvent(int Id, string Event, string Data, DateTimeOffset Timestamp);
