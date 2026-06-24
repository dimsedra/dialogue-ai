# Dialogue-AI Product Backlog
> Measured against [`docs/architecture/journal_first_folio_architecture.md`](file:///d:/Project%20Hub/Dialogue-AI/docs/architecture/journal_first_folio_architecture.md)
> Last updated: 2026-06-20

---

## Status Legend
- ✅ DONE — Implemented and matches the doc
- 🟡 PARTIAL — Some aspects exist, gaps remain  
- ❌ NOT STARTED — No implementation
- ⚠️ CONTRADICTS — Code does the opposite of what the doc says

---

## 🔵 §1 — Everything is a Workspace

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 1.1 | Eliminate workspace-agnostic session mode (`workspace = null` filter in [chatSessions.ts:33](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/chatSessions.ts#L33)) | ✅ | Small |
| 1.2 | Auto-create "Personal" workspace on first launch (in `reconcileFolio`) | ✅ | Medium |
| 1.3 | Create CONTEXT.md per workspace when workspace is created | ✅ | Small |
| 1.4 | Onboarding wizard prompt for additional workspaces | ❌ | Medium |

---

## 🔵 §2 — Directory Folio Layout

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 2.1 | `workspaces/` parent directory structure | ✅ | — |
| 2.2 | `.workspace.yaml` metadata per workspace | ✅ | — |
| 2.3 | `MEMORIES.md` per workspace | ✅ | — |
| 2.4 | `daily-logs/` global directory | ✅ | — |
| 2.5 | `system/MEMORIES.md` global | ✅ | — |
| 2.6 | `system/USER.md` (N-line startup profile) | ✅ | — |
| 2.7 | `system/CORE.md` (immutable identity) | ✅ | — |
| 2.8 | Create CONTEXT.md per workspace + sync to/from disk | ✅ | Medium |
| 2.9 | `notes/` subfolder per workspace (manual, no CRUD UI yet) | ❌ | Small |
| 2.10 | `system/habits.md` global habit registry | ✅ (ELIMINATED) | — |
| 2.11 | Eliminate global `tasks/` and `events/` root folders, and workspace-scoped `tasks/`, `events/`, and `activity/` folders | ✅ | Small |

---

## 🔴 §3 — Dynamic Agent Persona (ELIMINATE Custom Personas)

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 3.1 | Remove `agent_personas` collection + CRUD UI (`src/app/agent/page.tsx`, `src/pb-compat/descriptors/personas.ts`, `src/pb-compat/hooks/use-pb-persona-mutations.ts`) | ✅ | Large |
| 3.2 | Remove per-session persona binding (`agentPersona` on `chat_sessions`, `src/app/api/chat/route.ts:111-118`) | ✅ | Medium |
| 3.3 | Remove per-workspace persona binding (`defaultAgentPersona`, workspace settings UI, `sync.ts:442,463,890`) | ✅ | Medium |
| 3.4 | Load CONTEXT.md into agent prompt assembly as Layer 2 (`src/mastra/agents/dialogueAgent.ts`) | ✅ | Small |
| 3.5 | Inject today's daily log summary as Layer 3 emotional attunement | ❌ | Medium |
| 3.6 | Remove chat agent write tools (post-Observer — see §8) | ⚠️ | Large |

---

## 🔵 §4 — Daily Log Specification

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 4.1 | Frontmatter (`date`, `type: daily-log`) | ✅ | — |
| 4.2 | `## Habits` section with checkboxes | ✅ | — |
| 4.3 | Suffix ID tags (`#tsk-xxx`, `#evt-xxx`, `#hab-xxx`) in generated logs | ✅ | Large |
| 4.4 | `@workspace-slug` binding on tasks/events in daily log | ✅ | Medium |
| 4.5 | Child-bullet notes (`* note`) → `history_logs` JSON field in PocketBase | ✅ | Large |
| 4.6 | Rename section to `## Journal & Raw Notes` (currently `## Chat Activity`) | ✅ | Small |

---

## 🔵 §5 — Sync & Watcher Protocol

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 5.1 | Chokidar watcher (bidirectional sync) | ✅ | — |
| 5.2 | Suffix ID scanning (`#tsk-`, `#evt-`, `#hab-`) in daily log watcher | ✅ | Large |
| 5.3 | Task/event `[x]`/`[ ]` checkbox status sync from daily log (habits-only currently) | ✅ | Medium |
| 5.4 | Inline title change detection + DB update | ✅ | Medium |
| 5.5 | Child-bullet notes ingestion → `history_logs` (requires 4.5) | ✅ | Large |
| 5.6 | Automatic task rollover (handled during Daily Log generation) | ✅ | Medium |
| 5.7 | Recurrence for habits in daily log generation (events have it, habits don't) | ✅ | Small |

---

## 🔵 §6 — Branching Chat Sessions

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 6.1 | Schema: `isTrunk`, `parentSession`, `branchedFromMessage`, `sessionType` on `chat_sessions` | ✅ | Medium |
| 6.2 | Auto-create trunk session per workspace on workspace creation | ✅ | Medium |
| 6.3 | Branch creation UI (button + slash command) | 🟡 | Large |
| 6.4 | Context inheritance: branch agent loads trunk context at branch point | ✅ | Large |
| 6.5 | Focus lock: disable proactive alerts inside branches | ✅ | Medium |
| 6.6 | Branch merge: synthesize summary → post to trunk as "Merge Commit" block | ✅ | Large |
| 6.7 | Branch archive: read-only mode, collapsed in sidebar | ✅ | Medium |
| 6.8 | Active branch limit enforcement (3 default, 5 max) | ✅ | Small |
| 6.9 | `origin_branch` field on tasks/events for "Jump to Context" | ✅ | Small |
| 6.10 | Multi-day log date-slicing by session group | ❌ | Large |

---

## 🟡 §7 — Memory Architecture

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 7.1 | Level 1: USER.md startup profile (creation + agent loading) | ✅ | — |
| 7.2 | Level 2: Workspace CONTEXT.md (see 2.8 + 3.4) | ✅ | Medium |
| 7.3 | Level 3A: Daily Logs | ✅ | — |
| 7.4 | Level 3B: Workspace-scoped tasks/events | ✅ | — |
| 7.5 | Level 4: Semantic memories with embeddings | ✅ | — |
| 7.6 | Cognitive inertia — automated USER.md synthesis cadence (weekly/N-log) | See §10.3 | Large |
| 7.7 | Cognitive inertia — automated CONTEXT.md synthesis on milestone | See §10.4 | Large |

---

## 🟡 §8 — The Observer (Background Synthesizer)

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 8.1 | Design Observer agent (Mastra workflow or plain job) | ✅ | Very Large |
| 8.2 | Trigger Observer on conversation idle / session end | ✅ | Large |
| 8.3 | Observer: daily log generation from conversation transcript | ✅ | Large |
| 8.4 | Observer: memory extraction → PocketBase + MEMORIES.md | ✅ | Large |
| 8.5 | Observer: CONTEXT.md synthesis on milestone | See §10.4 | Large |
| 8.6 | Observer: USER.md synthesis on weekly/N-log cadence | See §10.3 | Large |
| 8.7 | Remove write tools from Chat Agent (post-Observer) | ⚠️ | Large |

---

## 🟢 §9 — Proactive Behaviors

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 9.1 | Morning greetings / daily briefs | ✅ | — |
| 9.2 | Overdue task triage (dashboard card) | ✅ | — |
| 9.3 | Branch suggestion on overdue triage (requires §6) | ✅ | Medium |
| 9.4 | Habit check-ins (evening) | ✅ | — |
| 9.5 | Event prep (upcoming 2h) | ✅ | — |
| 9.6 | Intrusion protection: queue proactive in branch, show on trunk return (requires §6) | ❌ | Medium |

---

## 🔵 §10 — Cognitive Inertia & Personalization Engine

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 10.1 | Enhance CORE.md system prompt with explicit "Person-Responding" instructions | ✅ | Small |
| 10.2 | Inject today's daily log summary into agent prompt as Layer 3 emotional attunement | ✅ | Medium |
| 10.3 | Observer: Automated weekly USER.md profiling & behavioral pattern synthesis | ✅ | Large |
| 10.4 | Observer: Milestone-based CONTEXT.md updates from workspace activity | ✅ | Large |

---

## 🔴 §11 — Performance Optimization (Non-blocking UI & Worker Threads)

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 11.1 | Migrate synchronous file system calls (*Sync) in background jobs to asynchronous fs.promises | ❌ | Medium |
| 11.2 | Offload heavy CPU-bound Observer tasks (embeddings/synthesis) to Node.js Worker Threads | ❌ | Large |

## 🔵 §12 — Trust-Safe Database Access & Local Credentials

| # | Item | Status | Complexity |
|---|------|--------|------------|
| 12.1 | Local Credentials Config: auto-generate random PB admin credentials on first install | ❌ | Medium |
| 12.2 | Dev Settings Tab: expose Dashboard link, Admin email, and the generated password for database transparency | ❌ | Small |
| 12.3 | Enforce minimum 10 characters for user registration password to align with PocketBase requirements | ❌ | Small |

---

## Priority Order (Recommended)

| Priority | Item(s) | Why |
|----------|---------|-----|
| 🥇 **Next** | **9.2, 9.3, 9.6** — Proactive Behaviors & Intrusion Protection | Builds directly on the new branching session architecture to block/delay intrusion alerts and suggest branches. |
| 🥈 | **1.4 + 2.9** — Onboarding wizard & Workspace `notes/` CRUD UI | UI refinements to complete the workspace-first flow. |
| 🥉 | **3.6 + 8.7** — Eliminate Chat Agent Write Tools | Enforces 100% separation of concerns: Chat Agent becomes purely conversational, Observer handles all mutations. |
| 4 | **§12** — Trust-Safe Database Access & Local Credentials | Cleans up dummy credentials, secures the vault, and exposes local db details for developer transparency. |
| 5 | **§11** — Performance Optimization & Non-blocking Threading | Offloads disk I/O and heavy CPU-bound tasks (local embeddings) to async promises and Worker Threads, ensuring 60fps responsiveness. |


