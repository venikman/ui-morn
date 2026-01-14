# UI Libraries for Agentic Components Report

## Overview

This project (`ui-morn`) is a **Next.js 16.1.1 protocol bakeoff** application that compares different AI orchestration paradigms. It demonstrates sophisticated patterns for handling streaming AI responses and agentic interactions.

---

## Core UI Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| **React** | 19.2.3 | Core UI framework |
| **Next.js** | 16.1.1 | SSR, routing, app framework |
| **Streamdown** | 2.0.1 | Progressive markdown rendering from streams |
| **Tailwind CSS** | 4 | Utility-first styling |
| **Zod** | 3.23.8 | Schema validation (shared package) |

### Key Insight

- **Streamdown** is the key library for agentic UX — it handles malformed/incomplete markdown gracefully during streaming
- No heavy state management (Redux, Zustand) — vanilla React hooks suffice for these patterns
- No `ink` — this is a web app, not a CLI terminal UI

---

## Three Agentic Scenarios

### Scenario A: Streaming Markdown (`MarkdownScenario.tsx`)

**Pattern**: Real-time LLM response rendering

```tsx
<Streamdown
  mode="streaming"
  caret="block"
  parseIncompleteMarkdown={repairEnabled}
  remend={remendConfig}
>
  {content || "*Awaiting stream...*"}
</Streamdown>
```

**Key Features**:
- `mode="streaming"` — optimized for progressive content
- `caret="block"` — visual cursor during streaming
- `parseIncompleteMarkdown` — handles malformed input gracefully
- `remend` — optional repair engine for broken markdown

---

### Scenario B: A2UI Structured Workflows (`A2UIScenario.tsx`)

**Pattern**: Server-driven UI from structured messages

```
A2UIScenario → applyA2uiMessage() → A2UIRenderer → renderComponent()
```

**Supported Components**:
- Containers: `Row`, `Column`, `Card`, `Tabs`, `List`, `Modal`
- Inputs: `TextField`, `Checkbox`, `Button`
- Display: `Text`

**Agentic Features**:
- **Data binding**: Two-way with `bindingPath`
- **Template variables**: `{{item.fieldName}}`
- **Modal gates**: Conditional rendering based on data model

---

### Scenario C: MCP Tool Orchestration (`McpScenario.tsx`)

**Pattern**: Human-in-the-loop tool approval

```
Tool Proposal → Human Approval → Tool Execution → Result Display
```

**Key UI Elements**:
- Tool approval panel with Approve/Deny buttons
- Tool result display with success/error status
- Dual streaming paths (A2A orchestration + MCP probe)

---

## Streaming Infrastructure (`sse.ts`)

Custom SSE client with resilience features:

```typescript
type SseConnectOptions = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  onMessage: (message: SseMessage) => void;
  onOpen?: (response: Response) => void;
  onBytes?: (bytes: number) => void;
  onError?: (error: Error) => void;
};
```

**Resilience Patterns**:
- `Last-Event-ID` header for resumption
- `Mcp-Session-Id` for session tracking
- Byte counting for metrics
- Controller-based cancellation

---

## Metrics Tracking (All Scenarios)

```typescript
type Metrics = {
  ttftSeconds: number | null;        // Time-to-First-Token
  firstInteractiveSeconds: number;   // When UI becomes interactive
  totalBytes: number;                // Network efficiency
  userActions: number;               // User interactions
  retries: number;                   // Reconnection attempts
  toolApprovals: number;             // Human gate interactions
  errors: number;
};
```

---

## UX Patterns

### Loading Indicator (`LoadingIndicator.tsx`)

Prevents spinner flash with delayed display:

```typescript
useSpinnerDelay({
  showDelayMs: 200,   // Wait before showing
  minVisibleMs: 400   // Minimum visibility once shown
});
```

### State Management

**Minimalist approach** — no Redux/Context:
- `useState` for component state
- `useRef` for non-rendering state (connections, metrics)
- Immutable updates with spread operator

---

## Component Architecture

```
ScenarioRunner (orchestrator)
├── MarkdownScenario
│   ├── Streamdown          ← progressive markdown
│   └── LoadingIndicator
├── A2UIScenario
│   ├── A2UIRenderer        ← recursive component tree
│   └── LoadingIndicator
└── McpScenario
    ├── ToolApprovalPanel   ← human-in-the-loop gate
    └── LoadingIndicator

Shared:
├── connectSse()            ← SSE streaming layer
├── applyA2uiMessage()      ← state reconciliation
└── createIdempotencyKey()  ← request safety
```

---

## Key Takeaways

| Pattern | Implementation |
|---------|----------------|
| **Progressive Rendering** | Streamdown with `mode="streaming"` |
| **Server-Driven UI** | A2UI protocol with recursive renderer |
| **Human-in-the-Loop** | Tool approval panel before execution |
| **Stream Resilience** | Event ID resumption across disconnects |
| **Type Safety** | Zod schemas for runtime validation |

### Summary

The architecture demonstrates that **modern React + Streamdown** can handle sophisticated agentic UIs without complex state management libraries. The key is:

1. **SSE for streaming** (not WebSockets) — simpler, HTTP-native, resumable
2. **Streamdown for graceful incomplete content** — handles malformed markdown mid-stream
3. **Structured protocols (A2UI)** for declarative server-driven UI generation
