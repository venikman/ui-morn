using System.Text.Json;
using System.Text.Json.Serialization;
using A2A.Agent.Models;

namespace A2A.Agent.Services;

public sealed class A2APartJsonConverter : JsonConverter<A2APart>
{
    public override A2APart Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        var root = document.RootElement;

        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new JsonException("A2A part must be a JSON object.");
        }

        var metadata = ReadMetadata(root);
        var text = root.TryGetProperty("text", out var textElement) && textElement.ValueKind == JsonValueKind.String
            ? textElement.GetString()
            : null;

        A2AFilePart? file = null;
        if (root.TryGetProperty("file", out var fileElement) && fileElement.ValueKind == JsonValueKind.Object)
        {
            file = JsonSerializer.Deserialize<A2AFilePart>(fileElement, options);
        }

        A2ADataPart? data = null;
        if (root.TryGetProperty("data", out var dataElement) && dataElement.ValueKind == JsonValueKind.Object)
        {
            data = ParseDataPart(dataElement);
        }
        else if (root.TryGetProperty("kind", out var kindElement)
            && kindElement.ValueKind == JsonValueKind.String
            && string.Equals(kindElement.GetString(), "data", StringComparison.OrdinalIgnoreCase))
        {
            data = ParseDataPart(root);
        }

        return new A2APart
        {
            Text = text,
            File = file,
            Data = data,
            Metadata = metadata,
        };
    }

    public override void Write(Utf8JsonWriter writer, A2APart value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();

        if (!string.IsNullOrWhiteSpace(value.Text))
        {
            writer.WriteString("text", value.Text);
        }
        else if (value.File is not null)
        {
            writer.WritePropertyName("file");
            JsonSerializer.Serialize(writer, value.File, options);
        }
        else if (value.Data is not null)
        {
            writer.WritePropertyName("data");
            JsonSerializer.Serialize(writer, value.Data, options);
        }

        if (value.Metadata is not null)
        {
            writer.WritePropertyName("metadata");
            JsonSerializer.Serialize(writer, value.Metadata, options);
        }

        writer.WriteEndObject();
    }

    private static Dictionary<string, string>? ReadMetadata(JsonElement root)
    {
        if (!root.TryGetProperty("metadata", out var metadataElement) || metadataElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var metadata = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var property in metadataElement.EnumerateObject())
        {
            metadata[property.Name] = property.Value.ValueKind == JsonValueKind.String
                ? property.Value.GetString() ?? string.Empty
                : property.Value.ToString();
        }

        return metadata.Count == 0 ? null : metadata;
    }

    private static A2ADataPart ParseDataPart(JsonElement element)
    {
        string? mimeType = null;
        JsonElement? payload = null;

        if (element.TryGetProperty("mimeType", out var mimeElement) && mimeElement.ValueKind == JsonValueKind.String)
        {
            mimeType = mimeElement.GetString();
        }

        if (element.TryGetProperty("payload", out var payloadElement))
        {
            payload = payloadElement.Clone();
        }

        return new A2ADataPart
        {
            MimeType = mimeType,
            Payload = payload,
        };
    }
}
