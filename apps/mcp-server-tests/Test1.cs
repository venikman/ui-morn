using System.Text.Json;
using FluentAssertions;
using Mcp.Server.Services;
using Microsoft.AspNetCore.Hosting;
using Moq;

namespace Mcp.Server.Tests;

[TestClass]
public sealed class ToolRegistryTests
{
    [TestMethod]
    public void List_WithCursor_PaginatesResults()
    {
        var registry = new ToolRegistry();

        var firstPage = registry.List(null, 2);
        var secondPage = registry.List(firstPage.NextCursor, 2);

        firstPage.Tools.Should().HaveCount(2);
        secondPage.Tools.Should().HaveCount(2);
        firstPage.Tools.Select(tool => tool.Name).Should().NotIntersectWith(
            secondPage.Tools.Select(tool => tool.Name));
    }
}

[TestClass]
public sealed class ToolExecutorTests
{
    [TestMethod]
    public async Task ExecuteAsync_UnknownTool_ReturnsError()
    {
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(client => client.CreateClient(It.IsAny<string>()))
            .Returns(new HttpClient());
        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(environment => environment.ContentRootPath).Returns(Path.GetTempPath());

        var executor = new ToolExecutor(factory.Object, env.Object);
        var args = JsonSerializer.SerializeToElement(new { });

        var result = await executor.ExecuteAsync("unknown", args, CancellationToken.None);

        result.IsError.Should().BeTrue();
        result.Content.Should().NotBeEmpty();
    }
}

[TestClass]
public sealed class SessionStateTests
{
    [TestMethod]
    public void GetEventsAfter_ReturnsOnlyNewerEvents()
    {
        var session = new SessionState();
        var first = session.AddEvent("tool.started", "one");
        var second = session.AddEvent("tool.result", "two");

        var results = session.GetEventsAfter(first.Id);

        results.Should().ContainSingle(evt => evt.Id == second.Id);
    }
}
