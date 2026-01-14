using System.Text.Json;
using A2A.Agent.Models;
using A2A.Agent.Services;
using FluentAssertions;

namespace A2A.Agent.Tests;

[TestClass]
public sealed class A2APartValidatorTests
{
    [TestMethod]
    public void TryValidate_TextPartOnly_ReturnsTrue()
    {
        var part = new A2APart { Text = "hello" };

        var result = A2APartValidator.TryValidate(part, out var error);

        result.Should().BeTrue();
        error.Should().BeNull();
    }

    [TestMethod]
    public void TryValidate_MultiplePartKinds_ReturnsFalse()
    {
        var part = new A2APart
        {
            Text = "hello",
            Data = new A2ADataPart { MimeType = "application/json" },
        };

        var result = A2APartValidator.TryValidate(part, out var error);

        result.Should().BeFalse();
        error.Should().Be("Part must contain exactly one of text, file, or data.");
    }
}

[TestClass]
public sealed class A2UIMessageValidatorTests
{
    [TestMethod]
    public void TryValidate_BeginRendering_ReturnsTrue()
    {
        var message = JsonSerializer.SerializeToElement(new
        {
            beginRendering = new { surfaceId = "main" },
        });

        var result = A2UIMessageValidator.TryValidate(message, out var error);

        result.Should().BeTrue();
        error.Should().BeNull();
    }

    [TestMethod]
    public void TryValidate_MultipleKeys_ReturnsFalse()
    {
        var message = JsonSerializer.SerializeToElement(new
        {
            beginRendering = new { surfaceId = "main" },
            surfaceUpdate = new { surfaceId = "main", components = Array.Empty<object>() },
        });

        var result = A2UIMessageValidator.TryValidate(message, out var error);

        result.Should().BeFalse();
        error.Should().Be("A2UI message must contain exactly one top-level message key.");
    }
}
