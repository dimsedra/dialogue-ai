# Proactive Overdue Task Bridge (Dashboard → Chat)

> **Status**: Deferred — blocked on session model migration  
> **Prerequisite**: Branching Session Model (see [`branching_chat_sessions.md`](branching_chat_sessions.md))

## Concept

The Dashboard already has a proactive state engine (`buildAttentionNeededState()` in `src/pb-compat/descriptors/dashboard.ts`) that detects overdue tasks and surfaces them as actionable cards. The idea is to bridge this into the chat — when the user taps "Resolve" on an overdue task card, it opens the agent chat with that task as the **active scope**, allowing the agent to conversationally suggest rescheduling, updating, or deleting it.

## Why It's Deferred

The current session model allows **many sessions per workspace** (and per persona). There's no guarantee that routing an overdue task into chat lands in the correct session with the right conversational context. Opening a new session loses prior context; opening an existing session may be contextually wrong.

This feature makes sense **only after** the session model is migrated to the **Branching Session Model**, where the dashboard bridge can cleanly create a dedicated task-resolution branch off the active **Workspace Main** trunk.

## What the Dashboard Already Detects

From `buildAttentionNeededState()`:

| State Type | Priority | Logic |
|------------|----------|-------|
| `overdue_task` | Tier 1 | Oldest incomplete task where `dueDate < now` |
| `task_triage` | Bulk | All overdue tasks (up to 5 IDs) |
| `morning_brief` | 6–12h | Today's task/event counts + highlighted task |

## Implementation Sketch (For When Ready)

1. Dashboard "Resolve" CTA ➡️ Automatically creates a temporary **Task Triage Branch** off the active `Workspace Main` trunk.
2. Injects the overdue task as **active scope** (`{ type: 'task', id, title }`).
3. Agent sees the pinned scope in the branch and naturally handles: *"This task was due 3 days ago — want to reschedule to Friday or close it out?"*
4. User reschedules or closes the task, and the branch is **merged & closed** back to the Main Trunk as a read-only archived commit block.

## Related Decisions

- The agent should NOT be in "productivity mode 24/7" — overdue awareness should be contextual, not injected into every turn's system prompt.
- For in-conversation awareness (when the user is already doing planning), see the `checkUpcomingSchedule` enhancement that adds overdue tasks to the tool output — this is a separate, non-deferred change.
