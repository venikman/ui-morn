using System.Text;

namespace A2A.Agent.Services;

public static class SseWriter
{
    public static async Task WriteEventAsync(
        HttpResponse response,
        string eventName,
        string data,
        int? eventId,
        CancellationToken cancellationToken)
    {
        if (eventId.HasValue)
        {
            await response.WriteAsync($"id: {eventId.Value}\n", cancellationToken).ConfigureAwait(false);
        }

        await response.WriteAsync($"event: {eventName}\n", cancellationToken).ConfigureAwait(false);
        await response.WriteAsync($"data: {data}\n\n", cancellationToken).ConfigureAwait(false);
        await response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    public static void PrepareSseResponse(HttpResponse response)
    {
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";
        response.Headers.Connection = "keep-alive";
    }
}
