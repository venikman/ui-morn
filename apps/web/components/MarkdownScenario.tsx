"use client";

import React, { useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { Metrics } from "@ui-morn/shared";
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
    <section className="scenario">
      <header>
        <div>
          <p className="eyebrow">Scenario A</p>
          <h2>Streaming Markdown (Streamdown v2)</h2>
        </div>
        <div className="scenario-actions">
          <button className="button" onClick={startRun} disabled={isRunning}>
            Run
          </button>
          <button className="button ghost" onClick={dropConnection} disabled={!isRunning}>
            Drop stream
          </button>
          <button className="button ghost" onClick={resume} disabled={!canResume}>
            Resume
          </button>
        </div>
      </header>

      <div className="scenario-body">
        <div className="scenario-controls">
          <label>
            Prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={malformedEnabled}
              onChange={(event) => setMalformedEnabled(event.target.checked)}
            />
            Inject malformed Markdown
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={repairEnabled}
              onChange={(event) => setRepairEnabled(event.target.checked)}
            />
            Remend repair enabled
          </label>
          <p className="muted">
            Streamdown uses rehype-harden by default for a security-first baseline.
          </p>
        </div>

        <div className="scenario-output">
          <LoadingIndicator loading={isRunning} label="Streaming response" />
          <div className="streamdown-panel">
            <Streamdown
              mode="streaming"
              caret="block"
              parseIncompleteMarkdown={repairEnabled}
              remend={remendConfig}
            >
              {content || "*Awaiting stream...*"}
            </Streamdown>
          </div>
        </div>
      </div>

      <footer className="scenario-footer">
        <div className="metrics">
          <span>TTFT: {metrics?.ttftSeconds?.toFixed(2) ?? "--"}s</span>
          <span>Bytes: {metrics?.totalBytes ?? 0}</span>
          <span>Retries: {metrics?.retries ?? 0}</span>
        </div>
      </footer>
    </section>
  );
};
