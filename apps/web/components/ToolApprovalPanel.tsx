"use client";

import React from "react";

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
  return (
    <div className="tool-panel">
      <div className="tool-panel-header">
        <div>
          <p className="eyebrow">Human-in-the-loop gate</p>
          <h3>Tool approvals</h3>
        </div>
        {proposal ? (
          <div className="tool-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => onDecision(false)}
              disabled={disabled}
            >
              Deny
            </button>
            <button
              type="button"
              className="button"
              onClick={() => onDecision(true)}
              disabled={disabled}
            >
              Approve
            </button>
          </div>
        ) : (
          <span className="muted">No pending approvals</span>
        )}
      </div>

      {proposal ? (
        <div className="tool-proposal">
          <p className="label">Proposed tool plan</p>
          <ul>
            {proposal.tools.map((tool) => (
              <li key={tool.name}>
                <span>{tool.name}</span>
                <code>{JSON.stringify(tool.arguments)}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="tool-proposal empty">Waiting for tool proposal...</div>
      )}

      <div className="tool-results">
        <p className="label">Tool results</p>
        {results.length === 0 ? (
          <p className="muted">No tool results yet.</p>
        ) : (
          results.map((result, index) => (
            <div key={`${result.name}-${index}`} className="tool-result">
              <strong>{result.name}</strong>
              <span className={result.isError ? "status error" : "status ok"}>
                {result.isError ? "error" : "ok"}
              </span>
              <pre>{result.content.map((entry) => entry.text).join("\n")}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
