namespace Mcp.Server.Services;

public static class SseWriter
{
    public static void PrepareSseResponse(HttpResponse response, string sessionId)
    {
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";
        response.Headers.Connection = "keep-alive";
        response.Headers["Mcp-Session-Id"] = sessionId;
    }

    public static async Task WriteEventAsync(
        HttpResponse response,
        SseEvent sseEvent,
        CancellationToken cancellationToken)
    {
        await response.WriteAsync($"id: {sseEvent.Id}\n", cancellationToken).ConfigureAwait(false);
        await response.WriteAsync($"event: {sseEvent.Event}\n", cancellationToken).ConfigureAwait(false);
        await response.WriteAsync($"data: {sseEvent.Data}\n\n", cancellationToken).ConfigureAwait(false);
        await response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}
