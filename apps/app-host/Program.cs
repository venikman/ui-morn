var builder = DistributedApplication.CreateBuilder(args);

var mcpServer = builder.AddProject("mcp-server", "../mcp-server/Mcp.Server.csproj")
    .WithHttpHealthCheck("/health");

var a2aAgent = builder.AddProject("a2a-agent", "../a2a-agent/A2A.Agent.csproj")
    .WithHttpHealthCheck("/health")
    .WithReference(mcpServer)
    .WithEnvironment("Mcp__BaseUrl", mcpServer.GetEndpoint("http"))
    .WaitFor(mcpServer);

builder.AddJavaScriptApp("web", "../web", "dev")
    .WithNpm()
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("NEXT_PUBLIC_A2A_BASE_URL", a2aAgent.GetEndpoint("http"))
    .WithEnvironment("NEXT_PUBLIC_MCP_BASE_URL", mcpServer.GetEndpoint("http"))
    .WaitFor(a2aAgent)
    .WaitFor(mcpServer);

builder.Build().Run();
