"use client";

import React, { useRef, useState } from "react";
import type { A2UIMessage, Metrics } from "@ui-morn/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { A2UIRenderer } from "./A2UIRenderer";
import { connectSse } from "../lib/sse";
import { applyA2uiMessage, updateDataModel } from "../lib/a2ui";
import type { A2UISurfaces } from "../lib/a2ui";
import { LoadingIndicator } from "./LoadingIndicator";
import { createIdempotencyKey } from "../lib/id";

const A2A_BASE_URL = process.env.NEXT_PUBLIC_A2A_BASE_URL ?? "http://localhost:5041";
const A2UI_EXTENSION = "https://a2ui.org/a2a-extension/a2ui/v0.8";

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

type A2UIScenarioProps = {
  onRunComplete: (metrics: Metrics) => void;
};

export const A2UIScenario = ({ onRunComplete }: A2UIScenarioProps) => {
  const [surfaces, setSurfaces] = useState<A2UISurfaces>({});
  const [isRunning, setIsRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const metricsRef = useRef<Metrics | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const connectionRef = useRef<ReturnType<typeof connectSse> | null>(null);

  const startRun = async () => {
    setSurfaces({});
    setResponseMessage(null);
    setSubmissionError(null);
    setIsRunning(true);

    const nextMetrics = createMetrics("a2a_a2ui");
    metricsRef.current = nextMetrics;
    startedAtRef.current = Date.now();

    const body = JSON.stringify({
      message: {
        role: "user",
        parts: [{ text: "Collect 4 fields, validate them, and let me confirm." }],
        metadata: {
          scenario: "a2ui",
          a2ui: {
            catalogs: [],
            inlineCatalogs: [],
          },
        },
      },
    });

    const connection = connectSse({
      url: `${A2A_BASE_URL}/v1/message:stream`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-A2A-Extensions": A2UI_EXTENSION,
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
            data?: { mimeType?: string; payload?: A2UIMessage };
          }>;
        };

        setTaskId(event.taskId);
        setLastEventId(String(event.sequence));

        if (metricsRef.current && metricsRef.current.ttftSeconds === null && startedAtRef.current) {
          metricsRef.current.ttftSeconds = (Date.now() - startedAtRef.current) / 1000;
        }

        event.parts.forEach((part) => {
          const payload = part.data?.payload;
          if (part.data?.mimeType !== "application/json+a2ui" || !payload) {
            return;
          }
          setSurfaces((prev) => applyA2uiMessage(prev, payload as A2UIMessage));

          if ("beginRendering" in payload && metricsRef.current && startedAtRef.current) {
            if (metricsRef.current.firstInteractiveSeconds === null) {
              metricsRef.current.firstInteractiveSeconds =
                (Date.now() - startedAtRef.current) / 1000;
            }
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
          parts: Array<{ data?: { mimeType?: string; payload?: A2UIMessage } }>;
        };
        setLastEventId(String(event.sequence));
        event.parts.forEach((part) => {
          const payload = part.data?.payload;
          if (part.data?.mimeType !== "application/json+a2ui" || !payload) {
            return;
          }
          setSurfaces((prev) => applyA2uiMessage(prev, payload as A2UIMessage));
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

  const handleAction = async (
    surfaceId: string,
    action: string,
    model: Record<string, unknown>
  ) => {
    if (!taskId) {
      return;
    }

    const form = (model.form as Record<string, unknown>) ?? {};

    setIsSubmitting(true);
    setSubmissionError(null);
    setResponseMessage(null);
    if (metricsRef.current) {
      metricsRef.current.userActions += 1;
    }

    const idempotencyKey = createIdempotencyKey();
    const response = await fetch(`${A2A_BASE_URL}/v1/message:send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        taskId,
        message: {
          role: "user",
          parts: [
            {
              data: {
                mimeType: "application/json+a2ui",
                payload: {
                  userAction: {
                    action,
                    surfaceId,
                    inputs: {
                      name: form.name ?? "",
                      email: form.email ?? "",
                      project: form.project ?? "",
                      priority: form.priority ?? "",
                      subscribe: form.subscribe ?? false,
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      setSubmissionError(error.detail ?? "Submission failed.");
      setIsSubmitting(false);
      return;
    }

    const data = await response.json();
    const textPart = data?.message?.parts?.find((part: { text?: string }) => part.text)?.text;
    setResponseMessage(textPart ?? "Submitted.");
    setIsSubmitting(false);
  };

  const handleUpdateModel = (surfaceId: string, path: string, value: unknown) => {
    setSurfaces((prev) => updateDataModel(prev, surfaceId, path, value));
  };

  return (
    <section className="scenario">
      <header>
        <div>
          <p className="eyebrow">Scenario B</p>
          <h2>A2UI structured workflow</h2>
        </div>
        <div className="scenario-actions">
          <Button onClick={startRun} disabled={isRunning}>
            Run
          </Button>
          <Button variant="outline" onClick={dropConnection} disabled={!isRunning}>
            Drop stream
          </Button>
          <Button variant="outline" onClick={resume} disabled={!taskId || isRunning}>
            Resume
          </Button>
        </div>
      </header>

      <div className="scenario-body">
        <div className="scenario-output">
          <LoadingIndicator loading={isRunning} label="Rendering surface" />
          <A2UIRenderer
            surfaces={surfaces}
            onAction={handleAction}
            onUpdateModel={handleUpdateModel}
          />
        </div>
        <div className="scenario-controls">
          <p className="muted">
            A2UI renders after beginRendering and sends a userAction on confirm.
          </p>
          <LoadingIndicator loading={isSubmitting} label="Submitting response" />
          {submissionError ? (
            <Alert variant="destructive">
              <AlertDescription>{submissionError}</AlertDescription>
            </Alert>
          ) : null}
          {responseMessage ? (
            <Alert>
              <AlertDescription>{responseMessage}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </section>
  );
};
