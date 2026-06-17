# Branching Chat Sessions & Date-Sliced Synthesis

This document defines the architecture for **Branching Chat Sessions** in Dialogue. It resolves the tension between a user's psychological need for clean-slate topic threads and the system's need for a unified chronological daily log, while providing a clear channel for conversational proactivity.

---

## 1. The Branching Session Model

Instead of a flat, unorganized list of chat sessions, Dialogue structures conversations using a Git-like branching model:

```
[Global Main] ────────────────────────────────────────────────────────► (Persistent)
                     │
[Workspace Main] ────┼───────────────────────────┬─────────────────────► (Persistent)
                     │                           │
                     └──► Branch: Brewing Tea    │ (Focused, Topic Lock)
                                                 │
                                                 └──► Branch: Vitest Fix (Multi-day)
                                                           └─ [Merge Commit] ──► (Merged back to Main)
```

### A. Trunk Sessions (Permanent)
There are only two permanent "Trunk" sessions that cannot be deleted or closed:
1.  **Global Main**: Workspace-agnostic. The central hub for the user's relationship with the companion.
2.  **Workspace Main**: One per workspace. The daily operations channel for that specific workspace.

*Role*: Trunks represent the continuous chronological timeline. This is where the companion is **conversationally proactive**—greeting you in the morning, running daily briefs, triaging overdue tasks, and prompting for habit check-ins.

### B. Topic Branches (Temporary)
Users can start a new topic branch at any point (via a UI "Branch" button, a slash command, or when the agent suggests focusing on a task).
*   **Context Inheritance**: The branch session contains a `parentSession` ID and a `branchedFromMessage` pointer, allowing the agent to inherit context from the trunk at the branch point.
*   **Focus Lock**: The agent in a branch acts as a specialized assistant. General proactive alerts, notifications, and habit prompts are disabled to protect the user's focus.

### C. Merging & Archiving
When a topic is resolved, the user or agent closes the branch:
1.  **Consolidation**: The agent synthesizes a high-density summary of the branch's outcomes and decisions.
2.  **Merge Message**: This summary is posted as a system-narrated "Merge Commit" block back in the **Workspace Main** trunk, and appended to relevant vault files (tasks, notes).
3.  **Archive**: The branch becomes read-only. In the sidebar, it is collapsed or archived under its parent trunk.

### D. Active Branch Limits (Focus Guardrails)
To prevent cognitive overload, sidebar clutter, and ensure the user actually "merges" and closes topics, Dialogue enforces a hard limit on active branches:
*   **The Limit**: By default, a user can have at most **3 active branches** concurrently per workspace (and 3 for the global space).
*   **Configuration**: This limit can be adjusted in user preferences up to a hard ceiling of **5 active branches**.
*   **Backend Enforcement**: When creating a branch, the database mutation counts unclosed branches (`parentSession != null && isClosed = false`) for that workspace. If the count matches or exceeds the limit, the API rejects the creation with a validation error.
*   **Frontend UX**: 
    *   The "Branch" buttons in the UI show a warning tooltip or enter a disabled state when the limit is reached.
    *   If a user tries to branch anyway, the UI displays a clear modal: *"Branch Limit Reached. You have 3 active topic branches in this workspace. Please merge or close an existing branch (e.g. 'Vitest Debugging') to start a new one."*

### E. Entity-Branch Association (Tasks & Events)
To preserve the conversational context of planning and execution, both tasks and events created *within* a branched chat session (or prepared for in a branch) can be linked back to their origin:
*   **YAML Metadata**: When the agent creates a task or event in a branch (or when a user associates a branch with an event for preparation), the sync engine stores the branch's session UUID in the entity's frontmatter:
    ```yaml
    ---
    title: "Shareholders Q&A Preparation"
    status: "todo" # Or startTime/endTime for events
    origin_branch: "session-uuid-123"
    ---
    ```
*   **The "Jump to Context" Shortcut**:
    *   **Proactive Reminders**: When the agent reminds the user of an upcoming high-impact event (e.g., *"Your Shareholders Meeting starts in 2 hours"*), the message includes a **[Jump to Prep Branch]** button.
    *   **Dashboard & Calendar**: When viewing the task/event details on the dashboard or calendar panel, a shortcut button links directly back to the originating branch.
*   **Graceful Degradation**:
    *   *Closed/Merged Branches*: The button updates to **[View Archived Branch]** (read-only mode).
    *   *Missing Sessions*: If the UUID does not exist in the local database cache, the button is hidden, and clicking the item defaults to standard detail views.

---

## 2. Resolving Multi-Day Log Redundancy (Message-Level Date Slicing)

A major challenge of multi-day branches (e.g., a branch active over 3 days) is avoiding redundant daily log summaries while still logging progress daily.

Dialogue resolves this by **decoupling the conversational session boundaries from the daily log boundaries** using message-level partitioning:

```
                        June 11                  June 12
Workspace Main ──► Message (11th) ──────► Message (12th)
                      │                        │
Branch: Vitest ──► Message (11th) ──────► Message (12th)
                      │                        │
               ┌──────┴──────┐          ┌──────┴──────┐
               ▼             ▼          ▼             ▼
          [June 11 Log Synthesis]  [June 12 Log Synthesis]
          Reads ONLY 11th messages Reads ONLY 12th messages
```

### The Slicing Algorithm
When the Daily Log synthesis runs for Day $D$ (e.g., June 12) at the end of the day or on app open:
1.  **Retrieve Daily Messages**: The engine queries all messages created between `startOfDay(D)` and `endOfDay(D)` in the user's timezone.
    ```sql
    SELECT * FROM messages 
    WHERE user = :userId 
      AND timestamp >= :startOfDay 
      AND timestamp <= :endOfDay;
    ```
2.  **Group by Session**: It groups the retrieved messages by their `session` ID.
3.  **Generate Chronological Deltas**: For each active session/branch, the LLM is given *only the messages from Day $D$* and instructed:
    > *"Summarize the progress or decisions made today in this specific thread. Do not include past context or general chat."*
4.  **Write Consolidated Timeline**: The engine writes these non-overlapping daily deltas into the Daily Log (`vault/daily-logs/YYYY-MM-DD.md`).
    *   *Result*: Daily logs contain exact chronological logs of daily effort, with **zero redundancy**, even if a branch runs for weeks.

---

## 3. Database Schema Updates

We support this branching model by adding optional self-referential relations to the `chat_sessions` collection in SQLite/PocketBase:

```sql
ALTER TABLE chat_sessions ADD COLUMN parentSession TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE;
ALTER TABLE chat_sessions ADD COLUMN branchedFromMessage TEXT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE chat_sessions ADD COLUMN isClosed BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_sessions ADD COLUMN branchSummary TEXT;
```

*   **Indexes**: We index `parentSession` to quickly fetch and nest branches in the sidebar.

---

## 4. Conversational Proactivity Workflow

Separating the Main Trunk from Topic Branches resolves the friction of proactive agent behavior:

```
                [User opens Dialogue App]
                            │
                            ▼
                [Route to Workspace Main]
                            │
              (Agent scans database state)
                            │
      ┌─────────────────────┴─────────────────────┐
      ▼ (No issues)                               ▼ (Attention Needed)
Normal greeting.                     Agent Proactive Prompt:
"Ready to start?"                    "I see task X is 3 days overdue.
                                     Should we branch off to triage it?"
                                                  │
                                                  ▼ (User accepts)
                                     [Create Branch: Triage X]
                                     [Active Scope = Task X]
                                     Focus strictly on rescheduling/closing.
```

*   **Intrusion Protection**: If the user is inside a branch (e.g., "Vitest Fix"), the agent stays topic-locked. Proactive prompts are queued and shown only when the user returns to the **Main Trunk**.
