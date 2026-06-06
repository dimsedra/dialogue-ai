# ADR 006: Multi-Tool Execution & Progressive Disclosure Architecture

- **Date**: 2026-05-18
- **Status**: Accepted
- **Authors**: Antigravity & Dialogue AI Core Architecture Team
- **Context**: Enabling robust multi-tool execution rendering in chat interface while maintaining mobile responsiveness and backward compatibility.

---

## 1. Context & Problem Statement

The Dialogue AI assistant possesses the capability to execute multiple tool calls in a single conversational turn (e.g., creating tasks, scheduling calendar events, and updating memory preferences simultaneously). The backend infrastructure (`convex/schema.ts` and `convex/ai_action.ts`) was already fully equipped to store and dispatch these operations using a `toolCalls` array field.

However, the presentation layer (`src/components/chat/MessageBubble.tsx`) suffered from two primary issues:

1. **Duplicate Rendering Bug**: The component possessed two independent rendering blocks—one for the legacy singular `toolCall` field and another for the `toolCalls` array. Because the backend populated `toolCall` with a backward-compatibility copy of the first tool in the array, any multi-tool execution resulted in the first tool card being rendered twice.
2. **Mobile Viewport Flooding**: Each `ToolCard` consumes substantial vertical space (~90px to ~150px). When an AI response contained 3 or more tool executions, the stacked cards consumed upwards of 90% of a mobile viewport (e.g., iPhone SE), creating visual clutter and hindering message scannability.

---

## 2. Decision & Architectural Changes

We resolved these issues by implementing a **Consolidated Single-Source-of-Truth Rendering** strategy combined with a **Progressive Disclosure (Action Group)** visual pattern. All modifications were cleanly isolated within `src/components/chat/MessageBubble.tsx`.

### 2.1. Tool Call Consolidation

We eliminated the duplicate rendering blocks and established a strict evaluation hierarchy:

```typescript
const allToolCalls = (
  (msg.toolCalls as ToolCall[]) ||
  (msg.toolCall ? [msg.toolCall as ToolCall] : [])
).filter(Boolean);
```

This ensures new messages utilize the array representation exactly once, while pre-existing historical messages gracefully fallback to wrapping their legacy singular field into a single-item array.

### 2.2. Progressive Disclosure Pattern (`ToolCallGroup`)

To protect viewport ergonomics, we established a rendering threshold (`COLLAPSE_THRESHOLD = 3`):

- **1-2 Tool Calls**: Directly rendered as full stacked cards with clean vertical spacing (`space-y-3`).
- **3+ Tool Calls**: Wrapped inside an interactive `ToolCallGroup` header strip ("✓ 3 Actions Completed").

```text
┌──────────────────────────────────────────────┐
│  ✓  3 Actions Completed  ●gold ●purple ●green ▼  │
└──────────────────────────────────────────────┘
```

The header strip dynamically generates miniature colored badge dots reflecting the exact semantic category of each executed tool (Gold = Task, Purple = Calendar Event, Blue = Web Research, Emerald = Memory Update).

### 2.3. Viewport-Aware Default State

Adhering to the responsive UX philosophy established in ADR-004, the initial expansion state of the action group respects screen real estate:

- **Mobile Viewports (`!isLargeViewport`)**: Defaults to **Collapsed**. Protects screen height; cards are accessible via a single tap.
- **Desktop Viewports (`isLargeViewport`)**: Defaults to **Expanded**. Leverages abundant screen real estate to display full details immediately.

---

## 3. Technical Verification & Results

The system was verified against rigorous real-world test prompts:

- **Zero Duplication**: Executing simultaneous task creation, calendar scheduling, and memory updates successfully rendered exactly three distinct tool cards.
- **Flawless UI Integration**: The summary strip accurately counted actions and rendered corresponding color badges. Tapping the strip executed fluid Framer Motion expand/collapse animations (`AnimatePresence`).
- **Compiler Compliance**: Full TypeScript type safety was maintained, including explicit `ReactNode` return annotations for inline rendering closures.

---

## 4. Consequences & Future Outlook

### Positive Consequences

- **Enhanced Scannability**: Users can immediately comprehend complex multi-step AI actions at a glance without losing their place in the chat stream.
- **Zero Schema Migrations**: By maintaining backend dual-writes (`toolCall` and `toolCalls`), zero database migrations or backend downtime were required. Historical messages remain 100% intact.

### Future Considerations

- In a future major backend refactor, the legacy singular `toolCall` field can be safely deprecated and removed from `ai_action.ts` dispatching once legacy message retention policies have lapsed.
