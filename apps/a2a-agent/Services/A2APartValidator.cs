using A2A.Agent.Models;

namespace A2A.Agent.Services;

public static class A2APartValidator
{
    public static bool TryValidate(A2APart part, out string? error)
    {
        var count = 0;
        if (!string.IsNullOrWhiteSpace(part.Text))
        {
            count++;
        }

        if (part.File is not null)
        {
            count++;
        }

        if (part.Data is not null)
        {
            count++;
        }

        if (count != 1)
        {
            error = "Part must contain exactly one of text, file, or data.";
            return false;
        }

        error = null;
        return true;
    }

    public static bool TryValidate(A2ARequestMessage message, out string? error)
    {
        foreach (var part in message.Parts)
        {
            if (!TryValidate(part, out error))
            {
                return false;
            }
        }

        error = null;
        return true;
    }
}
