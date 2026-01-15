"use client";

import React from "react";
import { ArrowDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type FlowStep = {
  title: string;
  detail?: string;
  tag?: string;
};

type FlowDiagramProps = {
  title: string;
  subtitle?: string;
  steps: FlowStep[];
  className?: string;
};

export const FlowDiagram = ({ title, subtitle, steps, className }: FlowDiagramProps) => {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Flow</p>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <React.Fragment key={`${step.title}-${index}`}>
            <div className="rounded-lg border bg-muted/60 p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{step.title}</p>
                {step.tag ? (
                  <Badge className="text-[0.65rem]" variant="secondary">
                    {step.tag}
                  </Badge>
                ) : null}
              </div>
              {step.detail ? (
                <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
              ) : null}
            </div>
            {index < steps.length - 1 ? (
              <div className="flex items-center justify-center text-muted-foreground">
                <ArrowDownIcon className="size-4" />
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
