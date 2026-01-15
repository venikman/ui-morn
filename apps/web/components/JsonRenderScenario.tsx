"use client";

import React from "react";
import type { Action, UITree } from "@json-render/core";
import {
  JSONUIProvider,
  Renderer,
  type ComponentRegistry,
  type ComponentRenderProps,
  useAction,
  useDataValue,
} from "@json-render/react";
import { FlowDiagram } from "@/components/FlowDiagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const refreshAction: Action = {
  name: "refresh_data",
  onSuccess: {
    set: {
      "/metrics/revenue": 132900,
      "/metrics/conversion": 0.163,
      "/metrics/sessions": 9050,
      "/meta/updatedAt": "Refreshed moments ago",
    },
  },
};

const jsonRenderTree: UITree = {
  root: "root",
  elements: {
    root: {
      key: "root",
      type: "Panel",
      props: {
        title: "Telemetry snapshot",
        subtitle: "Guardrailed JSON UI with data bindings",
      },
      children: ["metrics", "divider", "note", "action"],
    },
    metrics: {
      key: "metrics",
      type: "MetricGrid",
      props: {},
      children: ["metric-revenue", "metric-conversion", "metric-sessions"],
    },
    "metric-revenue": {
      key: "metric-revenue",
      type: "Metric",
      props: {
        label: "Monthly revenue",
        valuePath: "/metrics/revenue",
        format: "currency",
      },
    },
    "metric-conversion": {
      key: "metric-conversion",
      type: "Metric",
      props: {
        label: "Conversion rate",
        valuePath: "/metrics/conversion",
        format: "percent",
      },
    },
    "metric-sessions": {
      key: "metric-sessions",
      type: "Metric",
      props: {
        label: "Active sessions",
        valuePath: "/metrics/sessions",
        format: "number",
      },
    },
    divider: {
      key: "divider",
      type: "Divider",
      props: {},
    },
    note: {
      key: "note",
      type: "Note",
      props: {
        label: "Last updated",
        valuePath: "/meta/updatedAt",
      },
    },
    action: {
      key: "action",
      type: "ActionButton",
      props: {
        label: "Refresh data",
        action: refreshAction,
      },
    },
  },
};

const jsonRenderData = {
  metrics: {
    revenue: 128400,
    conversion: 0.142,
    sessions: 8420,
  },
  meta: {
    updatedAt: "Initial load",
  },
};

const jsonRenderFlowSteps = [
  {
    title: "Prompt + Catalog",
    detail: "Define allowed components and actions.",
  },
  {
    title: "JSON UI Tree",
    detail: "Model emits predictable elements.",
  },
  {
    title: "json-render",
    detail: "Renderer maps tree to React components.",
  },
  {
    title: "Live UI",
    detail: "Data bindings update metrics safely.",
  },
];

const formatMetric = (value: number | undefined, format: string | undefined) => {
  if (typeof value !== "number") {
    return "--";
  }

  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
    case "percent":
      return new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
    case "number":
    default:
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
      }).format(value);
  }
};

const Panel = ({
  element,
  children,
}: ComponentRenderProps<{ title: string; subtitle?: string }>) => (
  <div className="rounded-xl border bg-background/80 p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">{element.props.title}</p>
        {element.props.subtitle ? (
          <p className="text-xs text-muted-foreground">{element.props.subtitle}</p>
        ) : null}
      </div>
      <Badge variant="secondary">json-render</Badge>
    </div>
    <div className="mt-4 space-y-3">{children}</div>
  </div>
);

const MetricGrid = ({ children }: ComponentRenderProps) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);

const Metric = ({
  element,
}: ComponentRenderProps<{ label: string; valuePath: string; format?: string }>) => {
  const value = useDataValue<number>(element.props.valuePath);
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {element.props.label}
      </p>
      <p className="text-lg font-semibold">{formatMetric(value, element.props.format)}</p>
    </div>
  );
};

const Divider = () => <Separator />;

const Note = ({
  element,
}: ComponentRenderProps<{ label: string; valuePath: string }>) => {
  const value = useDataValue<string>(element.props.valuePath);
  return (
    <p className="text-xs text-muted-foreground">
      {element.props.label}: {value ?? "--"}
    </p>
  );
};

const ActionButton = ({
  element,
}: ComponentRenderProps<{ label: string; action: Action }>) => {
  const { execute, isLoading } = useAction(element.props.action);
  return (
    <Button size="sm" onClick={execute} disabled={isLoading}>
      {isLoading ? "Refreshing..." : element.props.label}
    </Button>
  );
};

const jsonRenderRegistry: ComponentRegistry = {
  Panel,
  MetricGrid,
  Metric,
  Divider,
  Note,
  ActionButton,
};

export const JsonRenderScenario = () => {
  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="space-y-1">
          <p
            className="text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--accent-2)" }}
          >
            Scenario D
          </p>
          <CardTitle className="text-xl">json-render guardrailed UI</CardTitle>
        </div>
        <CardAction className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">JSON UI</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <JSONUIProvider
            registry={jsonRenderRegistry}
            initialData={jsonRenderData}
            actionHandlers={{
              refresh_data: async () => {},
            }}
          >
            <Renderer tree={jsonRenderTree} registry={jsonRenderRegistry} />
          </JSONUIProvider>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4">
          <FlowDiagram
            title="json-render pipeline"
            subtitle="Catalog → JSON tree → React"
            steps={jsonRenderFlowSteps}
          />
        </div>
      </CardContent>
    </Card>
  );
};
