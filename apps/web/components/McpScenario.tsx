"use client";

import React, { useRef, useState } from "react";
import type { Metrics } from "@ui-morn/shared";
import { FlowDiagram } from "@/components/FlowDiagram";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { connectSse } from "../lib/sse";
import { LoadingIndicator } from "./LoadingIndicator";
import { ToolApprovalPanel, ToolProposal, ToolResult } from "./ToolApprovalPanel";

const A2A_BASE_URL = process.env.NEXT_PUBLIC_A2A_BASE_URL ?? "http://localhost:5041";
const MCP_BASE_URL = process.env.NEXT_PUBLIC_MCP_BASE_URL ?? "http://localhost:5040";

const createMetrics = (scenario: string): Metrics => ({
  scenario,
  startedAt: new Date().toISOString(),
  ttftSeconds: null,
  firstInteractiveSeconds: null,
  totalBytes: 0,
  userActions: 0,
  retries: 0,
  toolApprovals: 0,
  errors: 0,
});

const mcpFlowSteps = [
  {
    title: "Web UI",
    detail: "Starts orchestration request.",
  },
  {
    title: "A2A Agent",
    tag: "POST /v1/message:stream",
    detail: "Creates tool plan and streams proposal.",
  },
  {
    title: "Approval Gate",
    tag: "POST /v1/message:send",
    detail: "User approves tool plan.",
  },
  {
    title: "MCP Server",
    detail: "Executes tools via tools/call.",
  },
  {
    title: "UI Results",
    detail: "Tool results stream into panel.",
  },
];

const mcpResumeSteps = [
  {
    title: "Web UI",
    detail: "Starts MCP SSE request.",
  },
  {
    title: "MCP Server",
    tag: "POST /mcp",
    detail: "Returns Mcp-Session-Id + events.",
  },
  {
    title: "Resume Request",
    detail: "Last-Event-ID + Mcp-Session-Id headers.",
  },
  {
    title: "UI Log",
    detail: "Continues streaming events.",
  },
];

type McpScenarioProps = {
  onRunComplete: (metrics: Metrics) => void;
};

export const McpScenario = ({ onRunComplete }: McpScenarioProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ToolProposal | null>(null);
  const [results, setResults] = useState<ToolResult[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const metricsRef = useRef<Metrics | null>(null);
  const connectionRef = useRef<ReturnType<typeof connectSse> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [mcpRunning, setMcpRunning] = useState(false);
  const [mcpLog, setMcpLog] = useState<string[]>([]);
  const [mcpSessionId, setMcpSessionId] = useState<string | null>(null);
  const [mcpLastEventId, setMcpLastEventId] = useState<string | null>(null);
  const mcpConnectionRef = useRef<ReturnType<typeof connectSse> | null>(null);

  const startRun = async () => {
    setIsRunning(true);
    setProposal(null);
    setResults([]);
    setLog([]);

    const nextMetrics = createMetrics("a2a_mcp");
    metricsRef.current = nextMetrics;
    startedAtRef.current = Date.now();

    const body = JSON.stringify({
      message: {
        role: "user",
        parts: [{ text: "Compute X, fetch Y, store result, show summary." }],
        metadata: {
          scenario: "mcp",
        },
      },
    });

    const connection = connectSse({
      url: `${A2A_BASE_URL}/v1/message:stream`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      onBytes: (bytes) => {
        if (metricsRef.current) {
          metricsRef.current.totalBytes += bytes;
        }
      },
      onMessage: (message) => {
        if (!message.data) {
          return;
        }
        const event = JSON.parse(message.data) as {
          taskId: string;
          sequence: number;
          status: string;
          parts: Array<{
            text?: string;
            data?: { mimeType?: string; payload?: unknown };
          }>;
        };

        setTaskId(event.taskId);
        setLastEventId(String(event.sequence));

        if (metricsRef.current && metricsRef.current.ttftSeconds === null && startedAtRef.current) {
          metricsRef.current.ttftSeconds = (Date.now() - startedAtRef.current) / 1000;
        }

        event.parts.forEach((part) => {
          if (part.text) {
            setLog((prev) => [...prev, part.text ?? ""]);
          }
          if (part.data?.mimeType !== "application/json" || !part.data.payload) {
            return;
          }
          const payload = part.data.payload as Record<string, unknown>;
          if (payload.type === "tool_proposal") {
            setProposal({
              requestId: String(payload.requestId ?? ""),
              tools: (payload.tools as Array<{ name: string; arguments: unknown }>) ?? [],
            });
          }
          if (payload.type === "tool_result") {
            setResults((prev) => [
              ...prev,
              {
                name: String(payload.name ?? ""),
                isError: Boolean(payload.isError),
                content: (payload.content as Array<{ type: string; text: string }>) ?? [],
              },
            ]);
          }
        });

        if (event.status === "completed") {
          setIsRunning(false);
          if (metricsRef.current) {
            onRunComplete(metricsRef.current);
          }
        }
      },
      onError: () => {
        setIsRunning(false);
        if (metricsRef.current) {
          metricsRef.current.errors += 1;
        }
      },
    });

    connectionRef.current = connection;
    await connection.start();
  };

  const dropConnection = () => {
    connectionRef.current?.close();
    setIsRunning(false);
  };

  const resume = async () => {
    if (!taskId) {
      return;
    }
    setIsRunning(true);
    if (metricsRef.current) {
      metricsRef.current.retries += 1;
    }

    const connection = connectSse({
      url: `${A2A_BASE_URL}/v1/tasks/${taskId}:subscribe`,
      method: "POST",
      headers: lastEventId
        ? {
            "Last-Event-ID": lastEventId,
          }
        : undefined,
      onMessage: (message) => {
        if (!message.data) {
          return;
        }
        const event = JSON.parse(message.data) as {
          sequence: number;
          status: string;
          parts: Array<{ text?: string; data?: { mimeType?: string; payload?: unknown } }>;
        };
        setLastEventId(String(event.sequence));
        event.parts.forEach((part) => {
          if (part.text) {
            setLog((prev) => [...prev, part.text ?? ""]);
          }
        });
        if (event.status === "completed") {
          setIsRunning(false);
          if (metricsRef.current) {
            onRunComplete(metricsRef.current);
          }
        }
      },
    });

    connectionRef.current = connection;
    await connection.start();
  };

  const submitDecision = async (approved: boolean) => {
    if (!taskId || !proposal) {
      return;
    }

    if (metricsRef.current) {
      metricsRef.current.toolApprovals += 1;
    }

    await fetch(`${A2A_BASE_URL}/v1/message:send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        message: {
          role: "user",
          parts: [
            {
              data: {
                mimeType: "application/json",
                payload: {
                  toolApproval: {
                    requestId: proposal.requestId,
                    approved,
                  },
                },
              },
            },
          ],
        },
      }),
    });
    setProposal(null);
  };

  const startMcpProbe = async (resetLog: boolean) => {
    setMcpRunning(true);
    if (resetLog) {
      setMcpLog([]);
    }

    const connection = connectSse({
      url: `${MCP_BASE_URL}/mcp`,
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...(mcpSessionId ? { "Mcp-Session-Id": mcpSessionId } : {}),
        ...(mcpLastEventId ? { "Last-Event-ID": mcpLastEventId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "probe",
        method: "tools/call",
        params: {
          name: "search_docs",
          arguments: { query: "stream" },
        },
      }),
      onOpen: (response) => {
        const session = response.headers.get("Mcp-Session-Id");
        if (session) {
          setMcpSessionId(session);
        }
      },
      onMessage: (message) => {
        if (message.id) {
          setMcpLastEventId(message.id);
        }
        if (message.data) {
          setMcpLog((prev) => [...prev, message.data]);
        }
      },
      onError: () => {
        setMcpRunning(false);
      },
    });

    mcpConnectionRef.current = connection;
    await connection.start();
    setMcpRunning(false);
  };

  const dropMcp = () => {
    mcpConnectionRef.current?.close();
    setMcpRunning(false);
  };

  const resumeMcp = async () => {
    await startMcpProbe(false);
  };

  const logContent = log.length === 0 ? "No log entries yet." : log.join("\n");
  const mcpLogContent =
    mcpLog.length === 0 ? "No MCP events yet." : mcpLog.join("\n");

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="space-y-1">
          <p
            className="text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--accent-2)" }}
          >
            Scenario C
          </p>
          <CardTitle className="text-xl">A2A orchestrating MCP tools</CardTitle>
        </div>
        <CardAction className="flex flex-wrap gap-2">
          <Button onClick={startRun} disabled={isRunning}>
            Run
          </Button>
          <Button variant="outline" onClick={dropConnection} disabled={!isRunning}>
            Drop stream
          </Button>
          <Button variant="outline" onClick={resume} disabled={!taskId || isRunning}>
            Resume
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <LoadingIndicator loading={isRunning} label="Orchestrating tools" />
              <ToolApprovalPanel
                proposal={proposal}
                results={results}
                onDecision={submitDecision}
                disabled={!proposal}
              />
            </div>
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">Audit log</p>
              <ScrollArea className="h-40 rounded-lg border bg-background/70">
                <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground">
                  {logContent}
                </pre>
              </ScrollArea>
            </div>
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="space-y-1">
              <h3 className="text-base font-semibold">MCP resume probe</h3>
                <p className="text-sm text-muted-foreground">
                  Streamable HTTP resumes with Mcp-Session-Id + Last-Event-ID.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => startMcpProbe(true)} disabled={mcpRunning}>
                  Start probe
                </Button>
                <Button variant="outline" onClick={dropMcp} disabled={!mcpRunning}>
                  Drop
                </Button>
                <Button variant="outline" onClick={resumeMcp} disabled={mcpRunning}>
                  Resume
                </Button>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <ScrollArea className="h-40 rounded-lg border bg-background/70">
                <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground">
                  {mcpLogContent}
                </pre>
              </ScrollArea>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Session: {mcpSessionId ?? "--"}</p>
                <p>Last event: {mcpLastEventId ?? "--"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 rounded-xl border bg-muted/30 p-4">
          <FlowDiagram title="MCP orchestration" subtitle="Tool approvals + execution" steps={mcpFlowSteps} />
          <Separator />
          <FlowDiagram
            title="MCP resume probe"
            subtitle="Session + Last-Event-ID"
            steps={mcpResumeSteps}
          />
        </div>
      </CardContent>
    </Card>
  );
};
