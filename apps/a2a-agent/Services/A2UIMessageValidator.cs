using System.Text.Json;

namespace A2A.Agent.Services;

public static class A2UIMessageValidator
{
    private static readonly HashSet<string> AllowedKeys = new(StringComparer.Ordinal)
    {
        "beginRendering",
        "surfaceUpdate",
        "dataModelUpdate",
        "deleteSurface",
        "userAction",
    };

    public static bool TryValidate(JsonElement message, out string? error)
    {
        if (message.ValueKind != JsonValueKind.Object)
        {
            error = "A2UI message must be a JSON object.";
            return false;
        }

        var count = 0;
        foreach (var property in message.EnumerateObject())
        {
            if (AllowedKeys.Contains(property.Name))
            {
                count++;
            }
        }

        if (count != 1)
        {
            error = "A2UI message must contain exactly one top-level message key.";
            return false;
        }

        error = null;
        return true;
    }
}
