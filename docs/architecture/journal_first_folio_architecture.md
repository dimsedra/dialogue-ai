# Journal-First Folio Architecture

This is the **single source of truth** for Dialogue's memory, identity, and session architecture. All product, UX, and technical decisions should be measured against this document.

In alignment with Dialogue's core philosophy ("Let your personal growth be assisted"), the system is built around:
- A **Single Daily Ledger** (`daily-logs/YYYY-MM-DD.md`) representing the user's day
- **Workspaces as the universal context unit** — every conversation happens within a workspace
- A **Dynamic Agent Persona** that adapts behavior per-workspace while maintaining a single consistent identity
- **PocketBase** for structured entity storage (tasks, events, habits)

---

## 1. Everything is a Workspace

There is no workspace-agnostic mode. Every conversation in Dialogue happens within a workspace. This eliminates architectural edge cases and ensures the agent always has context (CONTEXT.md, behavioral weights, macro context) for every interaction.

### A. What Counts as a Workspace

Workspaces are not just "projects." They represent any distinct context in the user's life:

| Workspace        | Purpose                                    |
| ---------------- | ------------------------------------------ |
| Personal         | Casual chat, journal, daily reflections    |
| Health & Fitness | Workout tracking, meal planning, habits    |
| Side Project X   | Technical development, code, architecture  |
| Client Work      | Formal proposals, client communications    |
| School           | Coursework, study sessions, exam prep      |
| Japanese Study   | Language learning, practice conversations  |

### B. Onboarding Flow

1. **Auto-create**: On first launch, Dialogue creates a default **"Personal"** workspace with a pre-populated CONTEXT.md. The user lands directly in this workspace's trunk and can start chatting immediately.
2. **Optional wizard**: After initial setup, an onboarding prompt offers to create additional workspaces based on the user's needs ("Do you have a project, school subject, or hobby you'd like a dedicated space for?").

### C. Architectural Benefit

Because every conversation is always within a workspace:
- **CONTEXT.md always exists** — the agent always has macro context
- **Behavioral weights always apply** — no "default mode" fallback needed
- **Memory pipeline is uniform** — no if/else for "workspace vs no workspace"
- **Branching model is uniform** — every workspace has its own trunk + branches

---

## 2. Directory Folio Layout

All global folders for individual entities (`tasks/`, `events/`, `notes/`) and workspace-specific project logs (`activity/`, `tasks/`, `events/`) are eliminated. Workspaces become lightweight, flat notebooks.

> [!NOTE]
> **Journal/Notes are functional but will be manual for some time.** Users manage notes directly from the file manager. A rich-text note-taking UI (planned: [BlockNote](https://www.blocknote.dev/)) will be integrated in a future release. Notes live under `notes/` within each workspace.

```
dialogue-folio/
├── workspaces/
│   ├── personal-ws001/              <--- Default workspace (auto-created)
│   │   ├── .workspace.yaml          <--- Metadata (name, color, icon)
│   │   ├── CONTEXT.md               <--- Macro Context + User Notes
│   │   └── notes/                   <--- User's free-form notes (manual via file manager)
│   │       └── gratitude-list.md
│   │
│   ├── apartment-hunt-ws123/        <--- Project workspace
│   │   ├── .workspace.yaml
│   │   ├── CONTEXT.md
│   │   ├── MEMORIES.md              <--- Project-specific memories
│   │   └── notes/
│   │       └── rental-agreement.md  <--- Long-form project note
│   │
│   └── dialogue-app-ws456/          <--- Technical workspace
│       ├── .workspace.yaml
│       ├── CONTEXT.md
│       └── notes/
│           └── spec-v1.md
│
├── daily-logs/                      <--- The Daily Ledger
│   ├── 2026-06-17.md
│   └── 2026-06-18.md               <--- Today's active log
│
└── system/                          <--- Auditable Memory & System Profiles
    ├── MEMORIES.md                  <--- Global facts & semantic recall sources
    ├── habits.md                    <--- Global habit registry & rules
    ├── USER.md                      <--- Active N-Line Startup Profile (Level 1)
    └── CORE.md                      <--- Agent's immutable core identity
```

---

## 3. Dynamic Agent Persona

Dialogue uses a **Dynamic Agent Persona** instead of user-configurable custom personas. Custom personas are eliminated because they conflict with Dialogue's relationship-first philosophy — manually switching "modes" breaks the illusion that the agent is a single individual who knows you.

### A. The Human Analogy

Humans context-switch without losing identity. A person is still themselves whether they're at work, at home, or with friends — but they **deliberately weight** specific behavioral dimensions based on context. A naturally casual person can choose to be more formal at work. A naturally patient person can push themselves to be more demanding when mentoring.

This is not "two personas." It is one individual making conscious behavioral adjustments.

### B. Three-Layer Identity Model

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1 — Core Identity (Immutable)                     │
│  Stored in: system/CORE.md                               │
│  The agent's "soul." Values, humor style, communication  │
│  quirks, relationship philosophy. Never changes.         │
│  Written once during product design.                     │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 2 — Behavioral Weights (Per-Workspace, Dynamic)   │
│  Source: Full CONTEXT.md (specs, trajectory, progress)   │
│  Agent infers behavior from the evolving workspace       │
│  context — which is already fed by Level 3B.             │
│  ## User Notes section reserved for explicit             │
│  user overrides that can't be inferred from context.     │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 3 — Emotional Attunement (Session-Level, Live)    │
│  Source: Today's daily log + current conversation tone   │
│  Real-time micro-adjustments to energy and empathy.      │
│  If user is frustrated → more patient.                   │
│  If user is excited → match enthusiasm.                  │
│  Volatile — resets each session.                         │
└──────────────────────────────────────────────────────────┘
```

### C. Behavioral Weights — Deep Dive

Behavioral weights are **not a separate data structure**. They emerge from two sources:

1. **Agent Inference (Primary)**: The agent reads the full CONTEXT.md — purpose, specs, trajectory, progress, current state — and infers appropriate behavior at runtime. CONTEXT.md is already fed by Level 3B (Workspace Actions) through milestone synthesis, so as the workspace evolves, the agent's inferred behavior naturally evolves with it. A workspace with a spec about "enterprise client proposals" naturally triggers more formal behavior without anyone writing that down.

2. **User Override (Explicit)**: For preferences that **cannot be inferred** from context alone, the user tells the agent directly (e.g., "In this workspace, respond in Japanese"). These are captured as a `## User Notes` section in CONTEXT.md — the only part of behavioral weights that is explicitly written.

#### CONTEXT.md Example (Personal Workspace)

```markdown
# Personal

## Purpose
Casual daily companion space. Journal, reflections, random thoughts.

## User Notes
- User prefers Indonesian mixed with English
```

The agent infers warm/casual/supportive tone from the Purpose alone. Only the language preference — which can't be inferred — is an explicit behavioral note.

#### CONTEXT.md Example (Client Work Workspace)

```markdown
# Client Projects

## Purpose
Enterprise proposal drafting for B2B SaaS clients.

## Current State
Preparing Q3 pitch deck for Series A startup.
```

No `## User Notes` needed. The agent reads "enterprise proposal drafting" and "B2B SaaS clients" and infers formal, precise, humor-restrained behavior. As the workspace's spec and trajectory evolve (fed by Level 3B), the agent's behavior adapts naturally.

#### Behavioral Weight Priority

```
User Override (User Notes) > Agent Inference (from full CONTEXT.md) > Core Identity Default
```

### D. Prompt Assembly at Runtime

When a conversation starts (or context is refreshed), the Primary Agent's system prompt is assembled from:

```
[Core Identity]           ← system/CORE.md (always injected)
[User Profile]            ← system/USER.md (Level 1 — who the user is)
[Workspace Context]       ← workspaces/<slug>/CONTEXT.md (Level 2 — including user notes)
[Temporal Context]        ← Today's daily log summary + recent workspace activity
```

This produces a single, unified prompt where the agent is **one individual** whose behavior is weighted by the current workspace context.

> [!IMPORTANT]
> **The Chat Agent has zero logging responsibility.** It does not write to daily logs, extract memories, or update CONTEXT.md. Its only job is high-quality conversation. All bookkeeping is delegated to the Observer (§8).

---

## 4. Daily Log Specification (`daily-logs/YYYY-MM-DD.md`)

The Daily Log is a standard Markdown document representing the user's timeline. Structured items (Tasks, Events, Habits) are identified by **suffix ID tags** (generated by the backend) and optionally bound to workspaces using `@workspace-slug`.

### Sample File Format

```markdown
---
date: 2026-06-18
type: daily-log
---

# Thursday, June 18, 2026

## Habits
- [x] Meditation #hab-med123
  * Felt calm and focused during deep breathing.
- [ ] Drink 2L Water #hab-wat456

## Tasks
- [ ] Call landlord Bob to discuss contract #tsk-bob789 @apartment-hunt
  * Dialed Bob in the morning; line was busy. Try again at 2 PM.
- [x] Finish refactoring of async memory #tsk-mem012 @dialogue-app
  * Completed! All 209 unit tests passed successfully.
- [ ] Buy groceries #tsk-gro999
  * Need milk, eggs, and coffee beans.

## Events
- 14:00 - Dentist appointment #evt-den345
  * Dentist noted tooth sensitivity; scheduled follow-up for next month.
- 16:30 - Project Sync #evt-syn888 @dialogue-app

## Journal & Raw Notes
Started work at 9 AM after 7 hours of sleep. Energy was high.
Felt a bit of friction debugging the watcher's regular expression, but resolved it by allowing workspace yaml files through. 
Plan to rest tonight and watch a movie.
```

---

## 5. Sync & Watcher Protocol

The desktop app reads/writes PocketBase and projects files to disk. The Chokidar watcher acts as the bidirectional bridge.

### A. Watcher Parsing Rules
When the file `daily-logs/YYYY-MM-DD.md` is updated on disk:
1. **Identifier Matching**: The watcher scans lines looking for suffixes:
   * `#tsk-[id]`: Resolves to a record in the `tasks` collection.
   * `#evt-[id]`: Resolves to a record in the `events` collection.
   * `#hab-[id]`: Resolves to a record in the `habits` collection.
2. **Status Updates**:
   * `- [x]` -> Sets `completed = true` in PocketBase.
   * `- [ ]` -> Sets `completed = false` in PocketBase.
3. **Inline Title Changes**:
   * If the text preceding the ID tag is edited on disk, the watcher updates the `text`/`title` field in the database (e.g. changing `- [ ] Call Bob #tsk-bob789` to `- [ ] Call Bob immediately #tsk-bob789` updates the task's title to "Call Bob immediately").
4. **Child-Bullet Notes Ingestion (Chronological Progress Logging)**:
   * Lines below a task or event starting with `*` or `-` and indented with tabs/spaces are treated as **progress notes** for that day.
   * Instead of overwriting past notes, the watcher aggregates these daily notes and appends them to a chronological `history_logs` timeline field (stored as JSON) in the database record:
     ```json
     [
       { "date": "2026-06-18", "note": "Mencoba telepon Bob tapi tidak diangkat." },
       { "date": "2026-06-19", "note": "Mengirim email draf kontrak revisi ke Bob." }
     ]
     ```
   * This provides a natural, zero-effort timeline of updates linked directly to the task or event, separating notes day-by-day.

### B. Rollover & Recurrence
* **Task Rollover**: During startup or daily log generation, the system queries PocketBase for tasks that are still incomplete from previous days and appends them to today's `daily-logs/YYYY-MM-DD.md` checklist.
* **Recurrence**: Recurring events and habits are managed in PocketBase. When a new daily log is generated, the system checks schedules and prints the active checklist of events and habits for that day.

---

## 6. Branching Chat Sessions

Dialogue structures conversations using a Git-like branching model within each workspace.

### A. Trunk Sessions (Permanent)

Every workspace has exactly **one trunk session** — the persistent main conversation thread. This is where:
- The companion is **conversationally proactive** (morning greetings, daily briefs, overdue task triage, habit check-ins)
- Continuous chronological conversation happens
- Branch merge summaries are posted

There is no "Global Main" trunk. The default **Personal** workspace's trunk serves as the central hub for the user's general relationship with the companion.

### B. Topic Branches (Temporary)

Users can start a new topic branch at any point (via a UI "Branch" button, a slash command, or when the agent suggests focusing on a task).
- **Context Inheritance**: The branch session contains a `parentSession` ID and a `branchedFromMessage` pointer, allowing the agent to inherit context from the trunk at the branch point.
- **Focus Lock**: The agent in a branch acts as a specialized assistant. General proactive alerts, notifications, and habit prompts are disabled to protect the user's focus.

### C. Merging & Archiving

When a topic is resolved, the user or agent closes the branch:
1. **Consolidation**: The agent synthesizes a high-density summary of the branch's outcomes and decisions.
2. **Merge Message**: This summary is posted as a system-narrated "Merge Commit" block back in the **Workspace Trunk**, and appended to relevant vault files (tasks, notes).
3. **Archive**: The branch becomes read-only. In the sidebar, it is collapsed or archived under its parent trunk.

### D. Active Branch Limits (Focus Guardrails)

To prevent cognitive overload and ensure the user actually merges and closes topics:
- **Default Limit**: 3 active branches per workspace.
- **Hard Ceiling**: Configurable up to 5 active branches.
- **Backend Enforcement**: When creating a branch, the database counts unclosed branches for that workspace. If at limit, the API rejects with a validation error.
- **Frontend UX**: Branch buttons show a warning/disabled state when the limit is reached, with a clear modal explaining which branches to close first.

### E. Entity-Branch Association

Tasks and events created within a branch store the branch's session UUID in their frontmatter:

```yaml
---
title: "Shareholders Q&A Preparation"
status: "todo"
origin_branch: "session-uuid-123"
---
```

This enables:
- **"Jump to Context" shortcuts** on proactive reminders and dashboard/calendar views
- **Graceful degradation**: Closed branches show "View Archived Branch" (read-only); missing sessions hide the button

### F. Multi-Day Log Redundancy Resolution (Date Slicing)

Multi-day branches are handled by decoupling session boundaries from daily log boundaries:

1. **Retrieve Daily Messages**: Query all messages created between `startOfDay(D)` and `endOfDay(D)` in the user's timezone.
2. **Group by Session**: Group retrieved messages by their session ID.
3. **Generate Chronological Deltas**: For each active session/branch, the LLM summarizes only the messages from Day D.
4. **Write Consolidated Timeline**: Non-overlapping daily deltas are written to `daily-logs/YYYY-MM-DD.md` with zero redundancy, even if a branch runs for weeks.

### G. Conversational Proactivity

Separating the trunk from branches resolves friction with proactive agent behavior:

```
            [User opens Dialogue App]
                        │
                        ▼
            [Route to Active Workspace Trunk]
                        │
              (Agent scans database state)
                        │
      ┌─────────────────┴─────────────────────┐
      ▼ (No issues)                           ▼ (Attention Needed)
Normal greeting.                   Agent Proactive Prompt:
"Ready to start?"                  "I see task X is 3 days overdue.
                                   Should we branch off to triage it?"
                                              │
                                              ▼ (User accepts)
                                   [Create Branch: Triage X]
                                   Focus strictly on resolution.
```

**Intrusion Protection**: If the user is inside a branch, the agent stays topic-locked. Proactive prompts are queued and shown only when the user returns to the trunk.

---

## 7. Split-Pillar Memory Architecture

To prevent data contamination and ensure strict privacy boundaries, the cognitive memory layout is split into two independent, parallel pillars. Each pillar acts on its own consolidation rate (cognitive inertia), ensuring that high-level structures are stable and resistant to reactive changes.

```
   [ GLOBAL / PERSONAL PILLAR ]                 [ WORKSPACE / PROJECT PILLAR ]
  (Focus: Personality & Growth)               (Focus: Specs & Actions)

┌──────────────────────────────┐             ┌──────────────────────────────┐
│ LEVEL 1: USER PROFILE        │             │ LEVEL 2: WORKSPACE CONTEXT   │
│ (Inertia: Very Slow / Weeks) │             │ (Inertia: Slow / Milestones) │
└──────────────▲───────────────┘             └──────────────▲───────────────┘
               │                                            │
   Weekly Pattern Synthesis                    Project Milestone Synthesis
   (Behavioral consistency)                    (Action/Spec aggregation)
               │                                            │
┌──────────────┴───────────────┐             ┌──────────────┴───────────────┐
│ LEVEL 3A: PERSONAL TIMELINE  │             │ LEVEL 3B: WORKSPACE ACTIONS  │
│ (Daily Logs, Habits, Journal)│             │ (Tasks, Events, Proj Notes)  │
└──────────────▲───────────────┘             └──────────────▲───────────────┘
               │                                            │
               └──────────────────────┬─────────────────────┘
                                      │
                                      │ Watcher Router
                                      │
                       ┌──────────────┴───────────────┐
                       │ LEVEL 4: SEMANTIC MEMORIES   │
                       │ (Volatile Real-Time Facts)   │
                       └──────────────────────────────┘
```

### A. The Personal / Global Pillar (The "Who")
Focuses entirely on self-knowledge, habits, and personal growth.
* **Level 3A (Personal Timeline)**: Captured daily in `daily-logs/YYYY-MM-DD.md` (habits, raw logs, journals).
* **Level 1 (User Profile)**: Updated weekly or every N daily logs (client-triggered, non-cron). The background Observer analyzes daily log histories looking for repeating behavioral patterns, refining `system/USER.md` slowly. Single outliers or mood swings do not trigger reactive changes to the core profile.

### B. The Workspace / Project Pillar (The "What")
Focuses entirely on technical details, roadmaps, and specifications for specific contexts.
* **Level 3B (Workspace Actions)**: Captured daily as tasks, events, and notes scoped to a workspace (in PocketBase and flat markdown notes).
* **Level 2 (Workspace Context)**: Updated on milestones. Summarizes task completions and project developments to update the workspace's `CONTEXT.md` file. This includes the `## User Notes` section for explicit user overrides.

### C. Architectural Independence
* **Privacy Isolation**: The Personal Pillar and Workspace Pillar are 100% independent. Sharing a workspace (Pillar B) with a collaborator never leaks your personal profile, habits, or journals (Pillar A).
* **Cognitive Separation**: AI understands that user behaviors (Level 1) are attributes of the human, whereas project details (Level 2) are attributes of the workspace. A project milestone shift does not alter the AI's understanding of the user's personality.

---

## 8. Asynchronous Observer (The Synthesizer)

Dialogue's core value is learning about the user passively. This is handled by a background Observer Agent working out-of-process. **The Observer is the sole writer** for all memory, logging, and context artifacts — the Chat Agent has zero side effects beyond conversation.

### A. Separation of Concerns

```
Chat Agent                          Observer Agent
─────────────────                   ─────────────────
• Reads: CORE.md, USER.md,         • Reads: Conversation transcripts,
  CONTEXT.md, daily log summary      daily logs, CONTEXT.md
• Writes: NOTHING                   • Writes: EVERYTHING
  (pure conversation, zero            - Daily log entries
   side effects)                      - Memory extraction → PocketBase + MEMORIES.md
                                      - CONTEXT.md updates (milestone synthesis)
                                      - USER.md synthesis (weekly/N-log)
                                      - Task/event mutations → PocketBase
```

This separation ensures:
- **Chat quality stays high** — no multitasking, no logging instructions bloating the prompt
- **Logging is consistent** — one specialized agent, one pipeline
- **Decoupled** — if the Observer is delayed or fails, chat continues unaffected

### B. Trigger & Input

The Observer is triggered by:
1. **Conversation idle / session end**: Backend fires an event with the raw conversation transcript from the session.
2. **Scheduled idle periods**: Periodic synthesis runs to catch up on unprocessed transcripts.

The Observer reads **conversation transcripts** (not pre-written daily logs) and is responsible for distilling them into all downstream artifacts.

### C. Processing Pipeline

The Observer performs a **Single-Pass Structured Synthesis** across both pillars:

1. **Daily Log Generation**: Read the conversation transcript, extract the day's activities (tasks worked on, events discussed, journal-worthy moments), and write/append to `daily-logs/YYYY-MM-DD.md`.
2. **Memory Extraction**: Extract key relationship/personal growth facts (e.g., *"User struggles to focus when sleep is under 7 hours"*). Write to PocketBase and audit to `system/MEMORIES.md`.
3. **Workspace Context Synthesis** (On milestone): Summarize significant project changes (task completions, trajectory shifts) into CONTEXT.md. The Chat Agent will re-infer behavioral weights from the updated context at the next prompt assembly.
4. **Profile Synthesis** (Weekly/N-log cadence): Aggregate daily log patterns to refine `system/USER.md`. Only act on **consistent, repeated patterns**, never single data points.

### D. Cognitive Inertia Rules

| Target                     | Update Cadence                  | Trigger Threshold              |
| -------------------------- | ------------------------------- | ------------------------------ |
| Level 4 (Semantic Memory)  | Real-time                       | Any extracted fact              |
| Level 3A/3B (Daily Logs)   | Per session / daily             | Conversation transcript        |
| Level 2 (Workspace Context)| On milestone                    | Significant project change     |
| Level 2 (User Notes)       | On user request                 | Explicit user override only    |
| Level 1 (User Profile)     | Weekly / per N daily logs       | Repeating behavioral pattern   |
| Core Identity              | Never                           | Immutable                      |


---

## 9. Summary: How It All Fits Together

```
┌─────────────────────────────────────────────────────────────────────┐
│                      USER OPENS DIALOGUE                           │
│                             │                                       │
│                    Lands in a Workspace                             │
│                    (always — no agnostic mode)                      │
│                             │                                       │
│              ┌──────────────┴──────────────┐                       │
│              ▼                             ▼                        │
│     Workspace Trunk                  Topic Branch                  │
│     (proactive, open)               (focused, locked)              │
│              │                             │                        │
│              └──────────────┬──────────────┘                       │
│                             │                                       │
│                    Agent Prompt Assembly                            │
│              ┌──────────────┼──────────────┐                       │
│              ▼              ▼              ▼                        │
│     CORE.md          USER.md         CONTEXT.md                    │
│     (immutable)      (who you are)   (workspace context)           │
│                             │                                       │
│                    Chat Agent responds                              │
│                    (pure conversation,                              │
│                     ZERO side effects)                              │
│                             │                                       │
│                    Raw conversation transcript                      │
│                             │                                       │
│                    ┌────────┴────────┐                              │
│                    ▼                                                │
│           Observer (async, background)                              │
│           Reads transcript, writes EVERYTHING:                      │
│              ┌──────────┼──────────┬──────────┐                    │
│              ▼          ▼          ▼          ▼                     │
│         Daily log   Memories   CONTEXT.md  USER.md                 │
│         entries     → PB +     updates     synthesis               │
│                     MEMORIES                                        │
│                                                                     │
│         Feeds back into next prompt assembly cycle                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Future Roadmap & Extensions

Like the rich-text note editor (planned: BlockNote integration), several advanced extension capabilities are designated as future work:

### A. Root-Level Skills (`/skills`)
To make Dialogue extensible and support custom agentic behaviors, the system will support a root-level `/skills` directory.
- **Universal Agentic Naming**: Playbooks and skills are conceptually identical, so the system favors the "skills" nomenclature to align with universal agentic AI patterns and tools.
- **Dynamic Tool & Prompt Ingestion**: Adding a skill dynamically appends rules from its `SKILL.md` to the agent's system prompt and registers its scripts as dynamic executor tools.
- **Vault-First Writes**: Any output generated by external skills must format and persist to the local vault first, ensuring the user owns the persistent markdown records.

### B. Workspace Sandboxes (`/sandbox`)
To safely execute tasks requiring file operations or terminal commands, workspaces can define isolated runtime environments.
- **Workspace-Scoped Sandbox**: A dedicated `/sandbox` directory inside a workspace provides a containerized terminal and filesystem access.
- **Agent Executions**: The agent can run compiler commands, execution tools, or test applications safely within this sandbox, preventing arbitrary code execution from impacting the host machine.
