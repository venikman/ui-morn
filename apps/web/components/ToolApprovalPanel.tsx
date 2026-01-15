"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Separator } from "@/components/ui/separator";
import type { ToolUIPart } from "ai";

export type ToolProposal = {
  requestId: string;
  tools: Array<{ name: string; arguments: unknown }>;
};

export type ToolResult = {
  name: string;
  isError: boolean;
  content: Array<{ type: string; text: string }>;
};

type ToolApprovalPanelProps = {
  proposal: ToolProposal | null;
  results: ToolResult[];
  onDecision: (approved: boolean) => void;
  disabled?: boolean;
};

export const ToolApprovalPanel = ({
  proposal,
  results,
  onDecision,
  disabled,
}: ToolApprovalPanelProps) => {
  const toToolType = (name: string) => `tool-${name}` as ToolUIPart["type"];
  const approvalState: ToolUIPart["state"] = "approval-requested";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p
            className="text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--accent-2)" }}
          >
            Human-in-the-loop gate
          </p>
          <h3 className="text-lg font-semibold">Tool approvals</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {proposal ? "Awaiting approval" : "Idle"}
        </span>
      </div>

      {proposal ? (
        <Confirmation approval={{ id: proposal.requestId }} state={approvalState}>
          <ConfirmationTitle className="font-medium text-foreground text-sm">
            Approval requested
          </ConfirmationTitle>
          <ConfirmationRequest>
            <p className="text-sm text-muted-foreground">
              Review the proposed tool plan before continuing.
            </p>
          </ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction
              variant="outline"
              onClick={() => onDecision(false)}
              disabled={disabled}
            >
              Deny
            </ConfirmationAction>
            <ConfirmationAction onClick={() => onDecision(true)} disabled={disabled}>
              Approve
            </ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      ) : (
        <Alert>
          <AlertTitle>No pending approvals</AlertTitle>
          <AlertDescription>Waiting for tool proposal...</AlertDescription>
        </Alert>
      )}

      {proposal ? (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Proposed tool plan
          </p>
          {proposal.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tools in proposal.</p>
          ) : (
            proposal.tools.map((tool) => (
              <Tool key={tool.name} defaultOpen className="mb-0">
                <ToolHeader
                  title={tool.name}
                  type={toToolType(tool.name)}
                  state={approvalState}
                />
                <ToolContent>
                  <ToolInput input={(tool.arguments ?? {}) as ToolUIPart["input"]} />
                </ToolContent>
              </Tool>
            ))
          )}
        </div>
      ) : null}

      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Tool results
        </p>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tool results yet.</p>
        ) : (
          results.map((result, index) => {
            const output = result.content.map((entry) => entry.text).join("\n");
            const state: ToolUIPart["state"] = result.isError
              ? "output-error"
              : "output-available";
            return (
              <Tool key={`${result.name}-${index}`} defaultOpen className="mb-0">
                <ToolHeader title={result.name} type={toToolType(result.name)} state={state} />
                <ToolContent>
                  <ToolOutput
                    output={result.isError ? undefined : output}
                    errorText={result.isError ? output : undefined}
                  />
                </ToolContent>
              </Tool>
            );
          })
        )}
      </div>
    </div>
  );
};
