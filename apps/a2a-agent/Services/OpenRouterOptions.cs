namespace A2A.Agent.Services;

public sealed class OpenRouterOptions
{
    public const string DefaultBaseUrl = "https://openrouter.ai/api/v1";
    public const string DefaultModel = "google/gemini-2.5-flash-lite";

    public string BaseUrl { get; set; } = DefaultBaseUrl;
    public string Model { get; set; } = DefaultModel;
    public string? ApiKey { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
