using System.Text.Json;
using A2A.Agent.Models;

namespace A2A.Agent.Services;

public sealed class ScenarioRunner
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly McpClient _mcpClient;
    private readonly OpenRouterClient _openRouterClient;

    public ScenarioRunner(McpClient mcpClient, OpenRouterClient openRouterClient)
    {
        _mcpClient = mcpClient;
        _openRouterClient = openRouterClient;
    }

    public async Task RunAsync(TaskState task, A2ARequestMessage message, bool a2uiEnabled, CancellationToken cancellationToken)
    {
        var scenario = GetScenario(message);
        if (string.Equals(scenario, "a2ui", StringComparison.OrdinalIgnoreCase) && !a2uiEnabled)
        {
            scenario = "markdown";
        }

        switch (scenario)
        {
            case "a2ui":
                await RunA2UiAsync(task, message, cancellationToken).ConfigureAwait(false);
                break;
            case "mcp":
                await RunMcpAsync(task, cancellationToken).ConfigureAwait(false);
                break;
            default:
                await RunMarkdownAsync(task, message, cancellationToken).ConfigureAwait(false);
                break;
        }
    }

    private static string GetScenario(A2ARequestMessage message)
    {
        if (message.Metadata is null)
        {
            return "markdown";
        }

        if (message.Metadata.TryGetValue("scenario", out var scenarioElement)
            && scenarioElement.ValueKind == JsonValueKind.String)
        {
            return scenarioElement.GetString() ?? "markdown";
        }

        return "markdown";
    }

    private static string GetPrompt(A2ARequestMessage message)
    {
        return message.Parts.FirstOrDefault(part => !string.IsNullOrWhiteSpace(part.Text))?.Text
            ?? "Summarize these paragraphs and produce an action list.";
    }

    private async Task RunMarkdownAsync(TaskState task, A2ARequestMessage message, CancellationToken cancellationToken)
    {
        var prompt = GetPrompt(message);
        var includeMalformed = message.Metadata?.TryGetValue("malformed", out var malformedElement) == true
            && malformedElement.ValueKind == JsonValueKind.True;

        var markdown = includeMalformed
            ? BuildMarkdown(prompt, includeMalformed)
            : await GetMarkdownAsync(prompt, cancellationToken).ConfigureAwait(false);
        foreach (var chunk in SplitChunks(markdown, 48))
        {
            task.AddEvent("working", new[] { new A2APart { Text = chunk } });
            await Task.Delay(TimeSpan.FromMilliseconds(120), cancellationToken).ConfigureAwait(false);
        }

        task.AddEvent("completed", new[] { new A2APart { Text = "\n\n**Done.**" } });
    }

    private async Task<string> GetMarkdownAsync(string prompt, CancellationToken cancellationToken)
    {
        if (_openRouterClient.IsConfigured)
        {
            var response = await _openRouterClient.TryGetMarkdownAsync(prompt, cancellationToken).ConfigureAwait(false);
            if (!string.IsNullOrWhiteSpace(response))
            {
                return response;
            }
        }

        return BuildMarkdown(prompt, malformed: false);
    }

    private static string BuildMarkdown(string prompt, bool malformed)
    {
        var summary = "## Summary\n" +
                      $"- Key request: {prompt.Trim()}\n" +
                      "- Distilled into 2 themes: clarity and action\n" +
                      "- Primary risk: ambiguity without structure\n";

        var actions = "\n## Action List\n" +
                      "1. Capture the three most important points\n" +
                      "2. Draft a short plan with owners\n" +
                      "3. Confirm next check-in date\n";

        if (!malformed)
        {
            return summary + actions;
        }

        return summary + "\n## Action List\n" +
               "1. Capture the three most important points\n" +
               "2. Draft a short plan with **missing close\n" +
               "3. Confirm next check-in date\n";
    }

    private async Task RunA2UiAsync(TaskState task, A2ARequestMessage message, CancellationToken cancellationToken)
    {
        var surfaceId = "main";
        var components = BuildFormComponents();
        var surfaceUpdate = JsonSerializer.SerializeToElement(new
        {
            surfaceUpdate = new
            {
                surfaceId,
                components,
            },
        }, JsonOptions);

        var dataModelUpdate = JsonSerializer.SerializeToElement(new
        {
            dataModelUpdate = new
            {
                surfaceId,
                entries = new object[]
                {
                    new { path = "form.name", valueString = string.Empty },
                    new { path = "form.email", valueString = string.Empty },
                    new { path = "form.project", valueString = string.Empty },
                    new { path = "form.priority", valueString = "medium" },
                    new { path = "form.subscribe", valueBoolean = false },
                    new
                    {
                        path = "form.items",
                        valueMap = new
                        {
                            items = new[]
                            {
                                new { id = "i1", label = "Collect inputs" },
                                new { id = "i2", label = "Validate" },
                                new { id = "i3", label = "Confirm" },
                            },
                        },
                    },
                },
            },
        }, JsonOptions);

        var beginRendering = JsonSerializer.SerializeToElement(new
        {
            beginRendering = new
            {
                surfaceId,
            },
        }, JsonOptions);

        task.AddEvent("working", new[] { A2UiPart(surfaceUpdate) });
        task.AddEvent("working", new[] { A2UiPart(dataModelUpdate) });
        task.AddEvent("input-required", new[] { A2UiPart(beginRendering) });

        await Task.Delay(TimeSpan.FromMilliseconds(200), cancellationToken).ConfigureAwait(false);
    }

    private async Task RunMcpAsync(TaskState task, CancellationToken cancellationToken)
    {
        task.AddEvent("working", new[] { new A2APart { Text = "Preparing MCP tool plan." } });

        var toolsSnapshot = await _mcpClient.ListToolsAsync(cancellationToken).ConfigureAwait(false);
        if (toolsSnapshot.HasValue)
        {
            task.AddEvent("working", new[]
            {
                new A2APart
                {
                    Data = new A2ADataPart
                    {
                        MimeType = "application/json",
                        Payload = JsonSerializer.SerializeToElement(new
                        {
                            type = "tool_catalog",
                            tools = toolsSnapshot.Value,
                        }, JsonOptions),
                    },
                },
            });
        }

        var toolPlan = new[]
        {
            new ToolPlanItem("calc", JsonSerializer.SerializeToElement(new { expression = "12 * 7" }, JsonOptions)),
            new ToolPlanItem("search_docs", JsonSerializer.SerializeToElement(new { query = "streamable http" }, JsonOptions)),
            new ToolPlanItem("kv_put", JsonSerializer.SerializeToElement(new { key = "last_calc", value = "84" }, JsonOptions)),
            new ToolPlanItem("kv_get", JsonSerializer.SerializeToElement(new { key = "last_calc" }, JsonOptions)),
        };

        var approvalRequest = task.CreateToolApproval("tool-plan", JsonSerializer.SerializeToElement(new { tools = toolPlan }, JsonOptions));

        task.AddEvent("input-required", new[]
        {
            new A2APart
            {
                Data = new A2ADataPart
                {
                    MimeType = "application/json",
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        type = "tool_proposal",
                        requestId = approvalRequest.RequestId,
                        tools = toolPlan,
                    }, JsonOptions),
                },
            },
        });

        var decision = await task.WaitForApprovalAsync(approvalRequest, cancellationToken).ConfigureAwait(false);
        if (!decision.Approved)
        {
            task.AddEvent("completed", new[]
            {
                new A2APart { Text = "Tool plan was denied by the user. No tools were called." },
            });
            return;
        }

        foreach (var tool in toolPlan)
        {
            var result = await _mcpClient.CallToolAsync(tool.Name, tool.Arguments, cancellationToken).ConfigureAwait(false);
            task.AddEvent("working", new[]
            {
                new A2APart
                {
                    Data = new A2ADataPart
                    {
                        MimeType = "application/json",
                        Payload = JsonSerializer.SerializeToElement(new
                        {
                            type = "tool_result",
                            name = tool.Name,
                            isError = result.IsError,
                            content = result.Content,
                        }, JsonOptions),
                    },
                },
            });
        }

        task.AddEvent("completed", new[]
        {
            new A2APart
            {
                Text = "Tools completed. Results stored and summarized in the audit trail.",
            },
        });
    }

    private static A2APart A2UiPart(JsonElement payload)
    {
        return new A2APart
        {
            Data = new A2ADataPart
            {
                MimeType = "application/json+a2ui",
                Payload = payload,
            },
        };
    }

    private static IEnumerable<string> SplitChunks(string content, int size)
    {
        for (var index = 0; index < content.Length; index += size)
        {
            yield return content.Substring(index, Math.Min(size, content.Length - index));
        }
    }

    private static object[] BuildFormComponents()
    {
        return new object[]
        {
            new
            {
                id = "root",
                type = "Column",
                props = new { gap = 16 },
                children = new[] { "header", "form-card", "list-card" },
            },
            new
            {
                id = "header",
                type = "Text",
                props = new { text = "Project Intake", tone = "headline" },
            },
            new
            {
                id = "form-card",
                type = "Card",
                children = new[] { "form" },
            },
            new
            {
                id = "form",
                type = "Column",
                props = new { gap = 12 },
                children = new[]
                {
                    "name-row",
                    "email-row",
                    "project-row",
                    "priority-tabs",
                    "subscribe",
                    "submit-button",
                },
            },
            new
            {
                id = "name-row",
                type = "Row",
                props = new { gap = 12 },
                children = new[] { "name-label", "name-input" },
            },
            new
            {
                id = "name-label",
                type = "Text",
                props = new { text = "Name" },
            },
            new
            {
                id = "name-input",
                type = "TextField",
                props = new { placeholder = "Ada Lovelace", bindingPath = "form.name" },
            },
            new
            {
                id = "email-row",
                type = "Row",
                props = new { gap = 12 },
                children = new[] { "email-label", "email-input" },
            },
            new
            {
                id = "email-label",
                type = "Text",
                props = new { text = "Email" },
            },
            new
            {
                id = "email-input",
                type = "TextField",
                props = new { placeholder = "ada@example.com", bindingPath = "form.email" },
            },
            new
            {
                id = "project-row",
                type = "Row",
                props = new { gap = 12 },
                children = new[] { "project-label", "project-input" },
            },
            new
            {
                id = "project-label",
                type = "Text",
                props = new { text = "Project" },
            },
            new
            {
                id = "project-input",
                type = "TextField",
                props = new { placeholder = "Bakeoff demo", bindingPath = "form.project" },
            },
            new
            {
                id = "priority-tabs",
                type = "Tabs",
                props = new
                {
                    bindingPath = "form.priority",
                    options = new[]
                    {
                        new { value = "low", label = "Low" },
                        new { value = "medium", label = "Medium" },
                        new { value = "high", label = "High" },
                    },
                },
            },
            new
            {
                id = "subscribe",
                type = "Checkbox",
                props = new { label = "Send me updates", bindingPath = "form.subscribe" },
            },
            new
            {
                id = "submit-button",
                type = "Button",
                props = new { label = "Confirm", action = "submit_form" },
            },
            new
            {
                id = "list-card",
                type = "Card",
                children = new[] { "list-title", "list-items" },
            },
            new
            {
                id = "list-title",
                type = "Text",
                props = new { text = "Workflow steps" },
            },
            new
            {
                id = "list-items",
                type = "List",
                props = new { templateComponentId = "list-item" },
                dataBinding = new { path = "form.items" },
            },
            new
            {
                id = "list-item",
                type = "Text",
                props = new { text = "{{item.label}}" },
            },
        };
    }

    private sealed record ToolPlanItem(string Name, JsonElement Arguments);
}
