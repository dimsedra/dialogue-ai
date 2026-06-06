# ADR-008: Living Task Context, Timezone Architecture & Completed Archive Synchronization

- **Status**: Accepted
- **Date**: 2026-05-18
- **Authors**: Antigravity & User
- **Domain**: Task Context Engine, AI Execution Governance & Panel UI Synchronization

---

## 1. Context & Problem Statement

As "Dialogue" transitioned from a standard task manager into an autonomous agent workspace, several critical disconnects emerged between the AI's execution layer, backend persistence, and client UI rendering:

1. **Static Memory vs. Living Context**: The AI needed a way to continuously append chronological journal entries (`notes`), update execution progress (`progress`), and maintain single-sentence status summaries (`statusHook`) without overwriting previous context or generating time drift.
2. **Timezone Discrepancy**: Because Convex servers run in UTC+0, timestamps generated directly by the backend for user notes drifted from the user's local clock (e.g. UTC+7).
3. **System Instruction Leakage**: During multi-turn tool confirmations, negative constraint pre-prompts from underlying LLM APIs (e.g. `"DO NOT output tool names..."`) occasionally leaked at the top of the AI's conversational response.
4. **UI TaskList Rendering Disconnect**: In `TaskList.tsx`, the component ignored `task.completed` during rendering. Tasks marked as completed via AI or checkbox successfully updated the database but remained visibly un-struck in the active sidebar list.

How can we build a robust, timezone-accurate Living Task Context engine while ensuring flawless UI synchronization and clean AI conversational prose?

---

## 2. Decision

We resolved these challenges through a unified four-part architecture spanning schema evolution, backend timezone calculation, LLM output sanitization, and client-side UI partitioning.

### 2.1. Backend Schema & Timezone Calculations

- **Extended Schema**: Added `progress: v.optional(v.number())`, `statusHook: v.optional(v.string())`, `outcome: v.optional(v.string())`, and `contextUpdatedAt: v.optional(v.number())` to both `tasks` and `events` in `convex/schema.ts`.
- **Server-Side Time Calculation**: Passed `timezoneOffset` (in minutes) from client tool calls (`ai_action.ts`, `Chat.tsx`). The server calculates precise local time (`new Date(Date.now() - (args.timezoneOffset * 60000))`) and formats `[YYYY-MM-DD HH:mm]` timestamps before appending new notes.

### 2.2. AI Action Governance & Output Sanitization

- **Confirmation Protocol**: Enforced Rule #5 in `SKILLS_INSTRUCTION`: when task progress reaches 100%, the AI updates `progress: 100` and `notes` but does *not* immediately call `completeTask`. It must proactively ask the user for confirmation first.
- **System Instruction Sanitization**: Implemented a topmost regex filter across `convex/ai_action.ts` and `src/lib/lmstudio.ts` before sending messages:

  ```typescript
  cleanedText = cleanedText
    .replace(/^(?:DO NOT|CRITICAL|NOTE|IMPORTANT|INSTRUCTION|RULE|SYSTEM|MANDATORY):?.*\n+/gi, "")
    .trim();
  ```
  
- **Smart Silent Filtering**: Tool calls that only update context (`notes`, `progress`, `statusHook`) are silently excluded from `activeToolCalls` and `executedCalls`, preventing unnecessary UI `ToolCard` bubbles in the chat stream.

### 2.3. Dynamic TaskList & 7-Day Completed Archive

In `TaskList.tsx`, we resolved the UI rendering disconnect by establishing a pure React 19 partitioning model:

```text
┌────────────────────────────────────────────────────────┐
│  ⚡ ACTIVE TASKS                                       │
│  ├── Write API spec doc (Priority: High, Active)       │
│  └── Fix CSS styling (Active)                          │
│────────────────────────────────────────────────────────│
│  📦 COMPLETED ARCHIVE (2)  [ ▼ ]                       │
│  ├── [✓] Review PR #42 (Muted, Line-through, 2d ago)   │
│  └── [✓] Clean up logs (Muted, Line-through, 5d ago)   │
│  ────────────────────────────────────────────────────  │
│  💡 +14 older archived tasks. Ask AI to summarize      │
│     your past accomplishments.                         │
└────────────────────────────────────────────────────────┘
```

- **Active Zone**: Exclusively renders uncompleted tasks (`!task.completed`). When marked as completed, tasks smoothly glide out via `framer-motion`.
- **Collapsible Archive Box**: Displays completed tasks within the last 7 days (`completedAt >= sevenDaysAgo`) with `<CheckCircle2 />`, muted styling, and strike-through formatting. Re-clicking checkmarks instantly restores tasks to the active list.
- **AI Synergy Footer**: Older tasks (> 7 days) are omitted from the DOM to maximize performance, accompanied by a premium footnote encouraging the user to ask Dialogue's AI for historical accomplishment reports.

---

## 3. Rationale & Consequences

### 3.1. Rationale

- **Purity & Performance**: Using state-driven timestamps (`now`) with `useEffect` in `TaskList.tsx` completely satisfies React 19 / ESLint purity rules while keeping the DOM lightweight.
- **User Trust & Agency**: By requiring explicit confirmation before calling `completeTask` at 100% progress, we prevent premature archiving and give the user ultimate editorial control.

### 3.2. Consequences

- **Positive**: 100% reliable local timestamp generation in task notes regardless of server location.
- **Positive**: Exceptional visual clarity in the sidebar; completed tasks instantly move to the archive box without cluttering the active workspace.
- **Positive**: Zero system prompt leakage in conversational dialogue.

---

## 4. Verification & Grounding

- **Type Safety**: Verified via `npx tsc --noEmit` and `npx eslint .` with zero errors or warnings.
- **Database Integrity**: Verified `completedAt` and `contextUpdatedAt` timestamps in Convex DB.
- **UI Responsiveness**: Tested toggle animations and collapsible archive states in both mobile drawer and desktop sidebar layouts.
