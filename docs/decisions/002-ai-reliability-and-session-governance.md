# Architectural Decision Record: AI Reliability, Temporal Horizon Prompting & Session Governance

- **ID**: ADR-002
- **Status**: Accepted & Implemented
- **Date**: 2026-05-17
- **Related Commits**:

  - `83fed0681c417ce521a5d72289515163b368916c` (*feat: enhance system instructions and AI action handler for conversational agent capabilities*)
  - `18c7e82e6753fdf410510319ee051225f59448b8` (*feat: fix messages deleteSession*)

---

## 1. Missing Tool Documentation Resolution (`updateEvent`)

### 1.1 Discovery Context

During prompt auditing, it was discovered that while the `updateEvent` mutation was fully defined in backend tool arrays and handled correctly during mutation execution, its descriptive documentation within the AI system prompt (`SKILLS_INSTRUCTION` in `convex/ai_action.ts`) was completely absent.

### 1.2 Documentation Implementation

We restored precise documentation for `### updateEvent` directly above `### updateEventOccurrence` (implemented in commit `83fed0681c417ce521a5d72289515163b368916c`). The system instructions now explicitly clarify the distinction:

- `updateEvent`: Modifies an existing standalone event or updates ALL occurrences of an entire recurring series.
- `updateEventOccurrence`: Specifically modifies or reschedules a single day/occurrence within a recurring series.

---

## 2. AI Reliability: Summarization vs. Omissions & Temporal Horizons

### 2.1 Summarization Problem Statement

User testing revealed that when inquiring about schedules or triggering Workspace Syncs (`args.brief === true`), the AI (Gemini 3.1 Flash-Lite) tended to summarize lists for brevity (e.g., *"You have several meetings today"*). This resulted in critical meetings or deadlines being omitted. Furthermore, pending tasks were injected in flat database creation order, causing routine tasks and urgent deadlines to appear with equal visual weight.

### 2.2 Protocol Implementation

We implemented a **Multi-Horizon & Significance Protocol** entirely through backend pre-sorting and prompt engineering (implemented in commit `83fed0681c417ce521a5d72289515163b368916c`):

1. **Pre-Sorting by Priority**: Uncompleted tasks in `convex/ai_action.ts` are now strictly sorted by priority (`high` -> `medium` -> `low`) and due date before being injected into the AI context.
2. **Elevating Point-in-Time Events**: Upcoming calendar events are sorted such that momentary milestones (`eventType === "point"`) are automatically elevated to the top of the schedule context.
3. **Zero Omission Guarantee for Today**: The master system instructions (`SKILLS_INSTRUCTION`) and sync context (`briefingContext`) now strictly mandate that the AI exhaustively enumerate all active tasks and calendar events scheduled for the current day without summarization or omissions.
4. **Future Horizon Summary**: For upcoming days beyond today, the AI provides a warm, high-level summary calling out key Point-in-Time milestones.

---

## 3. Conversational Presentation Guidelines (Humane Persona Preservation)

### 3.1 Persona Context

To maintain the AI's natural persona as an empathetic, human-like productivity co-pilot, we rejected rigid bracket tags (e.g., `[ROUTINE]` or `[LOW PRIORITY]`) and non-inclusive emojis.

### 3.2 Humane Presentation Rules

The system prompt enforces lenient formatting freedom (implemented in commit `83fed0681c417ce521a5d72289515163b368916c`):

- The AI uses natural bulleted (`-`, `*`) or numbered lists to enumerate schedules.
- Natural markdown emphasis (bolding item titles, italicizing timestamps) is used to indicate priority and urgency naturally without sterile robotic logging notation.

---

## 4. Robust & Idempotent Chat Session Governance

### 4.1 Session Deletion Problem

Users encountered an unhandled server error during chat session deletion:

```text
[CONVEX M(messages:deleteSession)] Server Error: Unauthorized
```

In React 18 / Next.js, UI state transitions or double-clicks can cause a delete mutation to be dispatched when the session has already been removed from the database. When `session = null`, the previous check `if (!session || session.userId !== userId)` immediately threw `Unauthorized`. Additionally, `deleteSession` and `renameSession` lacked the optional `userId` parameter standard across the rest of the application.

### 4.2 Idempotent Mutation Solution

We refactored `deleteSession` and `renameSession` in `convex/messages.ts` (implemented in commit `18c7e82e6753fdf410510319ee051225f59448b8`):

1. **Universal Codebase Alignment**: Added `userId: v.optional(v.id("users"))` to mutation arguments, falling back to `await auth.getUserId(ctx)`.
2. **Idempotent Handling**: Replaced the combined check with explicit early returns:

```typescript
const session = await ctx.db.get(args.id);
if (!session) return; // Idempotent success if already removed
if (session.userId !== userId) throw new Error("Unauthorized");
```

This completely eliminates console runtime errors and ensures flawless UI resilience during rapid interaction.
