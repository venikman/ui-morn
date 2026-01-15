"use client";

import React, { useMemo, useRef, useState } from "react";
import type { Metrics } from "@ui-morn/shared";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { FlowDiagram } from "@/components/FlowDiagram";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { connectSse } from "../lib/sse";
import { LoadingIndicator } from "./LoadingIndicator";

const A2A_BASE_URL = process.env.NEXT_PUBLIC_A2A_BASE_URL ?? "http://localhost:5041";

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

const markdownFlowSteps = [
  {
    title: "Web UI",
    detail: "Prompt input and Streamdown renderer.",
  },
  {
    title: "A2A Agent",
    tag: "POST /v1/message:stream",
    detail: "SSE task updates stream back.",
  },
  {
    title: "OpenRouter",
    tag: "LLM",
    detail: "Markdown response generation.",
  },
  {
    title: "Streamdown UI",
    detail: "Chunks render with remend repair.",
  },
];

type MarkdownScenarioProps = {
  onRunComplete: (metrics: Metrics) => void;
};

export const MarkdownScenario = ({ onRunComplete }: MarkdownScenarioProps) => {
  const [prompt, setPrompt] = useState(
    "Summarize these 3 paragraphs and produce an action list."
  );
  const [content, setContent] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [repairEnabled, setRepairEnabled] = useState(true);
  const [malformedEnabled, setMalformedEnabled] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const metricsRef = useRef<Metrics | null>(null);
  const connectionRef = useRef<ReturnType<typeof connectSse> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const canResume = Boolean(taskId) && !isRunning;

  const remendConfig = useMemo(() => (repairEnabled ? {} : undefined), [repairEnabled]);

  const resetRun = () => {
    setContent("");
    setTaskId(null);
    setLastEventId(null);
    setMetrics(null);
    metricsRef.current = null;
  };

  const startRun = async () => {
    resetRun();
    setIsRunning(true);
    const nextMetrics = createMetrics("a2a_markdown");
    metricsRef.current = nextMetrics;
    setMetrics(nextMetrics);
    startedAtRef.current = Date.now();

    const body = JSON.stringify({
      message: {
        role: "user",
        parts: [{ text: prompt }],
        metadata: {
          scenario: "markdown",
          malformed: malformedEnabled,
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
          setMetrics({ ...metricsRef.current });
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
          parts: Array<{ text?: string }>;
        };
        setTaskId(event.taskId);
        setLastEventId(String(event.sequence));

        const textParts = event.parts?.filter((part) => part.text).map((part) => part.text) ?? [];
        if (textParts.length > 0) {
          setContent((prev) => prev + textParts.join(""));
          if (metricsRef.current && metricsRef.current.ttftSeconds === null && startedAtRef.current) {
            metricsRef.current.ttftSeconds = (Date.now() - startedAtRef.current) / 1000;
            setMetrics({ ...metricsRef.current });
          }
        }

        if (event.status === "error" && metricsRef.current) {
          metricsRef.current.errors += 1;
          setMetrics({ ...metricsRef.current });
        }

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
          setMetrics({ ...metricsRef.current });
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
      setMetrics({ ...metricsRef.current });
    }

    const connection = connectSse({
      url: `${A2A_BASE_URL}/v1/tasks/${taskId}:subscribe`,
      method: "POST",
      headers: lastEventId
        ? {
            "Last-Event-ID": lastEventId,
          }
        : undefined,
      onBytes: (bytes) => {
        if (metricsRef.current) {
          metricsRef.current.totalBytes += bytes;
          setMetrics({ ...metricsRef.current });
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
          parts: Array<{ text?: string }>;
        };
        setLastEventId(String(event.sequence));
        const textParts = event.parts?.filter((part) => part.text).map((part) => part.text) ?? [];
        if (textParts.length > 0) {
          setContent((prev) => prev + textParts.join(""));
        }
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

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="space-y-1">
          <p
            className="text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--accent-2)" }}
          >
            Scenario A
          </p>
          <CardTitle className="text-xl">Streaming Markdown (Streamdown v2)</CardTitle>
        </div>
        <CardAction className="flex flex-wrap gap-2">
          <Button onClick={startRun} disabled={isRunning}>
            Run
          </Button>
          <Button variant="outline" onClick={dropConnection} disabled={!isRunning}>
            Drop stream
          </Button>
          <Button variant="outline" onClick={resume} disabled={!canResume}>
            Resume
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Prompt</p>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                style={{ accentColor: "var(--primary)" }}
                checked={malformedEnabled}
                onChange={(event) => setMalformedEnabled(event.target.checked)}
              />
              Inject malformed Markdown
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                style={{ accentColor: "var(--primary)" }}
                checked={repairEnabled}
                onChange={(event) => setRepairEnabled(event.target.checked)}
              />
              Remend repair enabled
            </label>
            <p className="text-sm text-muted-foreground">
              Streamdown uses rehype-harden by default for a security-first baseline.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <LoadingIndicator loading={isRunning} label="Streaming response" />
            <div className="min-h-[180px] rounded-xl border border-dashed bg-background/70 p-4">
              <div className="space-y-4">
                <Message from="user">
                  <MessageContent>{prompt}</MessageContent>
                </Message>
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse
                      mode="streaming"
                      caret="block"
                      parseIncompleteMarkdown={repairEnabled}
                      remend={remendConfig}
                    >
                      {content || "*Awaiting stream...*"}
                    </MessageResponse>
                  </MessageContent>
                </Message>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4">
          <FlowDiagram
            title="Streaming markdown"
            subtitle="Real LLM via OpenRouter"
            steps={markdownFlowSteps}
          />
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
        <span>TTFT: {metrics?.ttftSeconds?.toFixed(2) ?? "--"}s</span>
        <span>Bytes: {metrics?.totalBytes ?? 0}</span>
        <span>Retries: {metrics?.retries ?? 0}</span>
      </CardFooter>
    </Card>
  );
};
