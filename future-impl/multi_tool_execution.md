# Multi-Tool Execution & Visualization Architecture

## 📖 Overview

The AI agent possesses the robust capability to execute multiple tool calls in a single turn (e.g., adding several tasks, scheduling a meeting, and researching background information simultaneously). However, the database schema and message UI currently only preserve and render a singular `toolCall` object per message. Consequently, whenever multiple tools execute sequentially in backend processing (`convex/ai_action.ts`), each tool call overwrites the previous one in the `activeToolCall` variable, causing the frontend to render only the **last** action performed.

This specification outlines the architectural roadmap for migrating the messaging and execution engine to fully support multi-tool persistence and stacked visual cards, specifically accommodating the newly enhanced **Event Architecture** (recurring schedules with expiration dates, point-in-time events, and single-occurrence overrides).

---

## 🏗️ Proposed Implementation Architecture

### 1. Database Schema Migration (`convex/schema.ts` & `messages.ts`)

Migrate the single optional object field to an optional array of objects capable of storing exact execution arguments, metadata hints, and state details.

```typescript
messages: defineTable({
  // ... existing fields
  toolCall: v.optional(v.any()), // Retained temporarily for backward compatibility
  toolCalls: v.optional(v.array(v.object({
    name: v.string(),
    args: v.any(),
    result: v.optional(v.any()),
    // Execution metadata for rich UI rendering
    titleHint: v.optional(v.string()),
    oldValues: v.optional(v.any()),
  }))),
}).index("by_session", ["sessionId"]),
```

---

### 2. Backend Execution Engine Update (`convex/ai_action.ts`)

In the `internalAction` handler:

- Replace `let activeToolCall: { name: string; args: any } | null = null;` with `const activeToolCalls: Array<{ name: string; args: any; titleHint?: string; oldValues?: any; result?: any }> = [];`.
- Within the tool dispatch loop (`for (const call of calls)`), push every executed tool call along with its specific event/task metadata:

```typescript
// Example: updateEventOccurrence handling
activeToolCalls.push({
  name: "updateEventOccurrence",
  args: call.args,
  titleHint: occArgs.title ?? oldEvent?.title,
  result: { status: "success" }
});
```

- When dispatching the final message mutation (`internal.messages.internalSend`), pass the complete array:

```typescript
await ctx.runMutation(internal.messages.internalSend, {
  sessionId: args.sessionId,
  text: aiText || "I've updated your workspace with those changes.",
  author: "AI",
  toolCalls: activeToolCalls.length > 0 ? activeToolCalls : undefined,
});
```

---

### 3. Frontend Visualization Engine (`src/components/Chat.tsx`)

Refactor the message bubble rendering logic to gracefully handle arrays of tool calls:

- Detect `msg.toolCalls` (fallback to `[msg.toolCall]` if only legacy field exists).
- Map over the array and render a separate `<ToolCard toolCall={tc} />` for every action.
- Ensure `<ToolCard>` successfully utilizes the upgraded `formatRecurrenceText` helper for recurring event cards with `until` expiration dates.
- Implement premium visual stacking (e.g., subtle cascading top margins `space-y-3`, consistent max-width containers, and smooth stagger animations).

```tsx
{msg.author === "AI" && (msg.toolCalls || msg.toolCall) && (
  <div className="space-y-3 mt-3 w-full">
    {(msg.toolCalls || [msg.toolCall]).filter(Boolean).map((tc, idx) => (
      <ToolCard key={idx} toolCall={tc as ToolCall} />
    ))}
  </div>
)}
```

---

## 🎯 Success Criteria & Verification Scenarios

- [ ] **Cross-Domain Execution**: AI successfully executes `addTask`, `addEvent` (with recurring `until` parameter), and `searchWeb` in a single response. All three distinct UI cards render in an elegant vertical stack.
- [ ] **Event Overhaul Compatibility**: In a single turn, AI schedules a recurring weekly team meeting (`addEvent`) and immediately adjusts this week's occurrence due to a holiday (`updateEventOccurrence`). Both cards render with precise `titleHint` and time formatting.
- [ ] **Backward Compatibility**: Pre-existing single `toolCall` messages in older chat sessions render without visual distortion or runtime errors.
