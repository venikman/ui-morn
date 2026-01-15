using System.Linq;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace A2A.Agent.Services;

public sealed class OpenRouterClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly OpenRouterOptions _options;

    public OpenRouterClient(HttpClient httpClient, OpenRouterOptions options)
    {
        _httpClient = httpClient;
        _options = options;
    }

    public bool IsConfigured => _options.IsConfigured;

    public async Task<string?> TryGetMarkdownAsync(string prompt, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return null;
        }

        var request = new
        {
            model = _options.Model,
            messages = new[]
            {
                new
                {
                    role = "system",
                    content = "You are a concise assistant. Reply in Markdown with headings Summary and Action List.",
                },
                new
                {
                    role = "user",
                    content = prompt,
                },
            },
            temperature = 0.2,
        };

        var endpoint = $"{_options.BaseUrl.TrimEnd('/')}/chat/completions";
        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(request, options: JsonOptions),
        };

        requestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
        requestMessage.Headers.Add("X-Title", "Protocol Bakeoff");

        using var response = await _httpClient.SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken)
            .ConfigureAwait(false);

        if (!document.RootElement.TryGetProperty("choices", out var choices)
            || choices.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var first = choices.EnumerateArray().FirstOrDefault();
        if (first.ValueKind == JsonValueKind.Undefined
            || !first.TryGetProperty("message", out var message)
            || !message.TryGetProperty("content", out var content)
            || content.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return content.GetString();
    }

    public async Task<bool> TryProbeAsync(CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var endpoint = $"{_options.BaseUrl.TrimEnd('/')}/models";
        using var requestMessage = new HttpRequestMessage(HttpMethod.Get, endpoint);
        requestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
        requestMessage.Headers.Add("X-Title", "Protocol Bakeoff");

        try
        {
            using var response = await _httpClient.SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (TaskCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }
}
