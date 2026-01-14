"use client";

import React, { useState } from "react";
import type { Metrics } from "@ui-morn/shared";
import { MarkdownScenario } from "./MarkdownScenario";
import { A2UIScenario } from "./A2UIScenario";
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
    <div className="runner">
      <div className="runner-header">
        <div>
          <p className="eyebrow">Protocol bakeoff</p>
          <h1>A2A vs MCP, A2UI vs Streamdown</h1>
          <p className="muted">
            Compare orchestration protocols and interaction layers with live streaming, resumability,
            and explicit tool approval gates.
          </p>
        </div>
        <div className="runner-actions">
          <button
            className="button ghost"
            onClick={exportMetrics}
            disabled={runs.length === 0}
          >
            Export metrics
          </button>
          <span className="muted">Runs logged: {runs.length}</span>
        </div>
      </div>

      <MarkdownScenario onRunComplete={handleRunComplete} />
      <A2UIScenario onRunComplete={handleRunComplete} />
      <McpScenario onRunComplete={handleRunComplete} />
    </div>
  );
};
