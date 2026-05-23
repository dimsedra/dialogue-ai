# Future Implementation: Task/Event Scope Pinning

- **Status**: Planned
- **Priority**: Medium
- **UX Philosophy**: Click, don't type. Bridge the gap between the task panel and the chat.

---

## 1. Problem Statement

Currently, referencing a task or event in chat requires typing its name or ID:
> *"What's the status of the Q2 Planning task?"*

This works, but it's slow — especially for users already looking at the task in the panel. Two disconnected surfaces (panel + chat) that should feel like one workspace.

---

## 2. Proposed UX

### 2.1. Action Button on Every Task/Event

Each task in the list and each event in the calendar/event list gets a subtle action button (e.g., a `/` or chat bubble icon) that appears on hover.

```
┌─────────────────────────────────────┐
│ ○ Study CCNA Lab 5                  │
│   Due May 25, 18:00    High   (/ )  │
└─────────────────────────────────────┘
```

Clicking it inserts a **slash command** into the chat input:

```
/ Study CCNA Lab 5
```

### 2.2. Scope Indicator in Chat Input

Once a task/event is pinned, the chat input shows a small scope badge:

```
┌──────────────────────────────────────┐
│ [Study CCNA Lab 5] Ask me anything…  │
│      ↑ click X to clear scope        │
└──────────────────────────────────────┘
```

The badge displays:
- Task text (or event title), truncated
- A small X button to clear the scope
- Subtle color coding (task vs event)

### 2.3. Scoped Chat Flow

When scope is active:

1. **Client-side**: The scope ID is appended to the `sendMessage` payload as `scope: { type: "task" | "event", id: "..." }`
2. **System prompt injection**: The agent's system instruction gets an extra line injected at the top:
   ```
   ## ACTIVE SCOPE
   You are currently focused on TASK "Study CCNA Lab 5" (ID: abc123).
   All user questions and instructions are about this task unless the user explicitly says otherwise.
   If the user asks something unrelated, ask if they want to clear the scope first.
   ```
3. **Briefing context**: The task/event details (notes, progress, statusHook, resources) are injected into the prompt so the agent has immediate full context.
4. **Agent replies stay in-scope**: Tool calls like `updateTask` automatically use the scoped ID.

---

## 3. Technical Specification

### 3.1. Chat Input Component

A new wrapper around the existing text input:

```tsx
// src/components/chat/ScopedInput.tsx
interface Scope {
  type: "task" | "event";
  id: Id<"tasks"> | Id<"events">;
  title: string;
}

function ChatInput() {
  const [scope, setScope] = useState<Scope | null>(null);
  // ...
}
```

- The scope bubble is rendered inside the input container
- Only one scope at a time (setting a new one replaces the old)
- The scope is cleared when the message is sent (or optionally persists)

### 3.2. SendMessage API

Extend the `sendMessage` mutation or the chat action args to include scope:

```typescript
// In ai_action.ts chat action args
scope: v.optional(v.object({
  type: v.union(v.literal("task"), v.literal("event")),
  id: v.string(),
}))
```

### 3.3. Task/Event List Integration

Add a refer/scope button to `TaskList.tsx` and `EventList.tsx`:

```tsx
<button onClick={() => onReferTask?.(task)}>
  <MessageSquare className="w-3.5 h-3.5" />
</button>
```

The `onReferTask` callback propagates up through `TaskPanel → page.tsx` to set the scope in the `Chat` component.

### 3.4. Scope Detection

Even without the button, the client could auto-detect a scope intent from the raw input. If the user types text matching a task/event title (exact or fuzzy), show a suggestion bubble:

```
| "what's the status of CCNA" |
| [Reference: Study CCNA Lab 5] |
```

---

## 4. Open Questions

1. **Scope lifetime**: Should scope clear after one message, or persist until explicitly cleared? (Recommend: persist until cleared, like a "mode")
2. **Scope in history**: When viewing past messages, should scoped messages show the badge? (Yes — renders a small "Focused on: task" label)
3. **Multi-provider**: The scope injection works for all providers since it's just system instruction text. Should work immediately for Gemini, OpenAI, Anthropic, and local LLMs.

---

## 5. Implementation Surface

| File | Change |
|---|---|
| `convex/schema.ts` | No schema changes |
| `convex/ai_action.ts` | Add `scope` arg to `chat` action |
| `convex/ai.ts` | Accept `scope` in `getPromptContext` |
| `src/components/chat/ScopedInput.tsx` | **New** — scope badge + input |
| `src/components/chat/ChatInput.tsx` | Integrate scope |
| `src/components/panel/TaskList.tsx` | Add refer button |
| `src/components/panel/EventList.tsx` | Add refer button |
| `src/components/TaskPanel.tsx` | Add `onReferTask`/`onReferEvent` callbacks |
| `src/app/page.tsx` | Wire scope state between panel and chat |
