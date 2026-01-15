"use client";

import React, { useState } from "react";
import type { Metrics } from "@ui-morn/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarkdownScenario } from "./MarkdownScenario";
import { A2UIScenario } from "./A2UIScenario";
import { JsonRenderScenario } from "./JsonRenderScenario";
import { McpScenario } from "./McpScenario";

export const ScenarioRunner = () => {
  const [runs, setRuns] = useState<Metrics[]>([]);

  const handleRunComplete = (metrics: Metrics) => {
    setRuns((prev) => [...prev, metrics]);
  };

  const exportMetrics = () => {
    const payload = JSON.stringify(runs, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bakeoff-metrics-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader className="gap-4">
          <div className="space-y-2">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--accent-2)" }}
            >
              Protocol bakeoff
            </p>
            <CardTitle className="text-2xl font-[var(--font-display)] sm:text-3xl md:text-4xl">
              A2A vs MCP, A2UI vs Streamdown
            </CardTitle>
            <CardDescription className="text-base">
              Compare orchestration protocols and interaction layers with live streaming,
              resumability, and explicit tool approval gates.
            </CardDescription>
          </div>
          <CardAction className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportMetrics} disabled={runs.length === 0}>
              Export metrics
            </Button>
            <Badge variant="secondary">Runs logged: {runs.length}</Badge>
          </CardAction>
        </CardHeader>
      </Card>

      <MarkdownScenario onRunComplete={handleRunComplete} />
      <A2UIScenario onRunComplete={handleRunComplete} />
      <JsonRenderScenario />
      <McpScenario onRunComplete={handleRunComplete} />
    </div>
  );
};
