# Dialogue Project Timeline

> **Last updated**: 2026-06-18
> This doc is the top-level roadmap superseding `docs/MIGRATION_POCKETBASE.md`. Each phase links to detailed design docs in `docs/future-impl/`.

---

## Overview

Dialogue's development is organized into three sequential phases:

| Phase | Focus | Why this order |
|---|---|---|
| **1. Folio System** | Filesystem source of truth + sync engine + database cache | The data foundation. The sync engine and layout boundaries must be established first so agent tools and sandbox runtimes can securely write folio-first from day one. |
| **2. Mastra Orchestration** | Exploit Mastra's full agent orchestration capabilities | Move from a single-agent model to a multi-agent, workflow-driven execution model, connecting sandboxed workspace access scopes directly to the established folio system. |
| **3. Add-on Features** | Notes, Deep Research, Community Skills | Clean integration on top of a settled agent layer and a folio-native data layer |

> Previous work (Convex → PocketBase migration) is considered complete. See [`docs/MIGRATION_POCKETBASE.md`](MIGRATION_POCKETBASE.md) for the migration record.

---

## Phase 1: Folio System

**Goal**: Replace PocketBase as the source of truth with a local filesystem folio. PB becomes a derived database cache.

### Design Docs

All folio design blueprints live in `docs/future-impl/`. The index document is:

- **[`filesystem_notes_workspace_architecture.md`](future-impl/folio-system/filesystem_notes_workspace_architecture.md)** — entry point linking all modular guides

### Folio Layout

```
dialogue-folio/
├── tasks/                    # Task files with YAML frontmatter
├── events/                   # Event files, archive subfolder
├── notes/                    # Note files
├── daily-logs/               # YYYY-MM-DD.md habit + reflection files
├── personas/                 # Agent persona Markdown files
├── playbooks/                # Reusable step execution playbooks
├── research/                 # Research reports (Phase 3)
└── system/
    ├── memories.md           # User facts and semantic index
    ├── habits.md             # Habit definitions
    ├── user_profile.md       # Active startup profile
    └── digests/              # Historical N-log digests
```

### Work Items

| Item | Status | What | Reference |
|---|---|---|---|
| 1.1 | **Done** | **Sync engine** — Node-based file watcher, YAML frontmatter parser, JSON object frontmatter support, SHA-256 change tracking, PocketBase cache upsert, JIT recurrence detachment, and `[slug]-[id].md` filenames (implemented in `src/lib/folio/sync.ts` and `src/lib/pb-actions/`) | [`sync_ingestion_engine.md`](future-impl/folio-system/sync_ingestion_engine.md) |
| 1.2 | **Done** | **Workspace isolation** — per-workspace folio subdirectories (`workspaces/[slug]-[id]`), scope-pinned memory lookup, folder operations, and deletion/archive capabilities | [`workspace_folio_layout.md`](future-impl/folio-system/workspace_folio_layout.md) |
| 1.3 | **Done** | **Auditable memory** — `folio/system/memories.md` and workspace-scoped memories as editable sources of truth, local vector embeddings, and semantic deduplication | [`unified_memory_architecture.md`](future-impl/memory-and-sessions/unified_memory_architecture.md) |
| 1.4 | **Pending** | **Dynamic agent personas** — `folio/personas/` as editable Markdown, length-capped prompt refinement on updates | [`dynamic_agent_personas.md`](future-impl/agent-orchestration/dynamic_agent_personas.md) |
| 1.5 | **Pending** | **Daily log synthesis** — `folio/daily-logs/YYYY-MM-DD.md`, N-log behavioral profile refinement on app open | [`unified_memory_architecture.md`](future-impl/memory-and-sessions/unified_memory_architecture.md) |
| 1.6 | **Pending** | **Self-improving playbooks** — agent compiles multi-step traces into `folio/playbooks/`, retrieved via vector search | [`task_playbook_synthesis.md`](future-impl/folio-system/task_playbook_synthesis.md) |
| 1.7 | **In Progress**| **Build & deploy** — bundle PocketBase + Node + Python sidecars into single Electron installer | — |

### Migration Path

Existing PB data migrates to folio files via an export-on-upgrade script: read each PB collection, write folio files with matching YAML frontmatter, then start the sync engine pointed at the new folio root. PB stays as a read-only cache.

---

## Phase 2: Mastra Orchestration Enhancement

**Goal**: Move from a single-agent-with-19-tools pattern to a full multi-agent, workflow-driven, MCP-connected architecture operating securely on top of the local-first folio.

### Current State

- Single `dialogueAgent` with 19 tools, constructed dynamically per-request
- No workflows, no Workspace integration, no MCP, no Editor, no Browser
- Mastra instance created fresh per request (never reused)
- Chat via `handleChatStream` from `@mastra/ai-sdk`; cron jobs via `.generate()`

### Work Items

| Item | Status | What | Depends On | Reference |
|---|---|---|---|---|
| 2.1 | **Done** | **MCP Client infrastructure** — connect to external MCP servers (STDIO sidecars, HTTP) with lifecycle management | `@mastra/mcp` install | [`mastra_orchestration_upgrade.md`](future-impl/agent-orchestration/mastra_orchestration_upgrade.md#3-mcp) |
| 2.2 | **Pending** | **MCP Sidecar lifecycle** — Electron manages Python/Node child processes alongside PocketBase; health-check, restart, graceful shutdown | 2.1 | — |
| 2.3 | **Pending** | **Workflow engine** — replace ad-hoc agent tool-chaining with `createWorkflow` + `createStep` for compound/cron operations: **Reflector Agent** (daily log profile/trait refinement on app open), playbook generation, task execution loops | `@mastra/core` (already installed) | [`mastra_orchestration_upgrade.md`](future-impl/agent-orchestration/mastra_orchestration_upgrade.md#1-workflows) |
| 2.4 | **Done** | **Workspace integration** — wire `@mastra/core/workspace` Pointed at `folio/` for native file read/write/list/grep, sandboxed CLI execution, and BM25/vector/hybrid search | `@mastra/core` (already installed), Phase 1 (1.1, 1.2) | [`mastra_orchestration_upgrade.md`](future-impl/agent-orchestration/mastra_orchestration_upgrade.md#4-workspace) |
| 2.4b | **Done** | **Workspace Skills** — configure a `skills/` directory on the Workspace. Agent gains `skill` tools discovering community skills. Author first-party **`dialogue-core` skill** always loaded on Workspace for layout schemas, pipelines, and graph edges. | 2.4 | [`mastra_orchestration_upgrade.md`](future-impl/agent-orchestration/mastra_orchestration_upgrade.md#4-workspace) |
| 2.5 | **Partial** | **Structured agents** — multi-agent/supervisor orchestration: **3rd-Person Watcher Agent** (pre-turn proactive memory retrieval & post-turn real-time fact ingestion), agent approval (human-in-the-loop snapshot cards wired), processors, guardrails | 2.1–2.4 | [`mastra_orchestration_upgrade.md`](future-impl/agent-orchestration/mastra_orchestration_upgrade.md#6-structured-agents) |
| 2.6 | **Pending** | **Studio integration** — use Mastra Studio for interactive dev, inspection, and debugging | — | [`mastra_orchestration_upgrade.md`](future-impl/agent-orchestration/mastra_orchestration_upgrade.md#2-editor) |

### Deliverable

Dialogue's agent layer becomes a proper Mastra application: a persistent agent server with MCP-connected tools, graph-based workflows for compound operations, Workspace-backed file access, human-in-the-loop safeguards, and a skills system that taps the entire [Agent Skills ecosystem](https://agentskills.io). Ready to integrate any MCP-capable tool or community skill as an agent primitive.

---

## Phase 3: Add-on Features

**Goal**: Ship value-added features on top of a settled agent layer (Phase 2) and folio-native storage (Phase 1).

### 3a: Notes

| Item | What | Reference |
|---|---|---|
| 3a.1 | BlockNote editor component with auto-save | [`notes_memory_folio_integration.md`](future-impl/addons-and-skills/notes_memory_folio_integration.md) |
| 3a.2 | NoteList panel tab (alongside Tasks/Events/Habits) | same |
| 3a.3 | Mastra tools: `createNote`, `updateNote`, `getNote`, `searchNotes`, `deleteNote` | same |
| 3a.4 | `ingestNoteNotes` memory pipeline — chunk, embed, hash, upsert into memories | same |
| 3a.5 | Folio-native storage: dual-format (BlockNote JSON + Markdown), `folio/notes/` | same |

Notes are stored folio-first from day one, following the same file format and directory layout defined in [`workspace_folio_layout.md`](future-impl/folio-system/workspace_folio_layout.md).

### 3b: Deep Research (GPT Researcher)

| Item | What | Depends On |
|---|---|---|
| 3b.1 | **Python sidecar** — Electron spawns `gptr-mcp` (Python MCP server) on app startup, health-checks, reaps on shutdown | Phase 2: MCP sidecar lifecycle (2.2) |
| 3b.2 | **`deep_research` MCP tool** — agent calls `deep_research(query, depth, breadth)` → Python multi-agent pipeline → cited report returned via MCP | 3b.1 |
| 3b.3 | **Research report storage** — `folio/research/YYYY-MM-DD-topic.md` with YAML frontmatter, inline citations, source list | Phase 1: folio layout |
| 3b.4 | **Research → memory pipeline** — `ingestResearchNotes()` indexes report chunks into memories, same pattern as notes | Phase 1: memory system |

GPT Researcher is a Python 3.10+ process. It runs as an Electron-managed sidecar — the same pattern as PocketBase and the Next.js server. The MCP protocol hides the language boundary; Dialogue's agent sees it as just another tool.

### 3c: Community Skills (last30days, etc.)

**No custom integration needed.** Once Workspace Skills (2.4b) is wired, any skill following the [Agent Skills](https://agentskills.io) open standard can be installed by placing its folder in the `skills/` directory. The agent discovers it automatically and learns its capabilities from the `SKILL.md` instructions.

Examples of what becomes available:

| Skill | What it does | Language | How the agent uses it |
|---|---|---|---|
| **last30days** (38.7k ⭐) | Searches Reddit, X, YouTube, HN, Polymarket, GitHub for social pulse on any topic; ranks by engagement | Python 3.12+ (scripts) | Agent reads `SKILL.md` → calls scripts via Workspace sandbox → synthesizes results |
| Hundreds more on [agentskills.io](https://agentskills.io) | Varies | Varies | Same pattern — discover, read, execute |

**How it works in practice:**

1. User finds a skill: `npx skills add mvanhorn/last30days-skill`
2. Skill folder lands in `skills/last30days/` with `SKILL.md` + Python scripts + config
3. On next conversation, the agent sees `/last30days` in its skill tools
4. User says "what's the community saying about Mastra lately?"
5. Agent loads skill instructions → runs scripts via Workspace sandbox → returns brief

**Skills vs MCP sidecars:**

| Aspect | Skills (Workspace) | MCP Sidecars |
|---|---|---|
| Runtime | One-shot scripts (sandbox) | Long-running server process |
| Language | Any executable (Python, Node, shell) | Any (protocol is MCP) |
| State | Stateless per invocation | Persistent connection |
| Example | last30days (search, synthesize, return) | GPT Researcher (multi-agent pipeline, 30-120s) |

Skills handle the "call a tool, get a result" pattern. MCP handles the "spawn a daemon, stream results back" pattern. Both coexist in Phase 3.

---

## Dependency Graph

```
Phase 1: Vault System
    │
    ├── 1.1 Sync Engine (Rust) ────────────────────────┐
    ├── 1.2 Workspace Isolation ───────────────────────┼─────────┐
    ├── 1.3 Auditable Memory                           │         │
    ├── 1.4 Dynamic Personas                           │         │
    ├── 1.5 Daily Log Synthesis                        │         │
    ├── 1.6 Playbooks                                  │         │
    └── 1.7 Build & Deploy                             │         │
                                                       │         │
Phase 2: Mastra Orchestration                          │         │
    │                                                  │         │
    ├── 2.1 MCP Client ────────────────────────────────┼─────────┼──────────┐
    ├── 2.2 MCP Sidecar Lifecycle ─────────────────────┼─────────┼──────────┼────────┐
    ├── 2.3 Workflow Engine                            │         │          │        │
    ├── 2.4 Workspace Integration ─────────────────────┼─────────┘          │        │
    ├── 2.4b Workspace Skills ─────────────────────────┘                    │        │
    ├── 2.5 Structured Agents                                               │        │
    └── 2.6 Studio Integration                                              │        │
                                                                            │        │
Phase 3: Add-on Features                                                    │        │
    │                                                                       │        │
    ├── 3a Notes                                                            │        │
    │   └── 3a.5 Folio-native storage ──────────────────────────────────────┘        │
    │                                                                                │
    ├── 3b Deep Research (GPT Researcher)                                            │
    │   ├── 3b.1 Python sidecar ─────────────────────────────────────────────────────┤
    │   ├── 3b.2 deep_research MCP tool ─────────────────────────────────────────────┤
    │   ├── 3b.3 folio/research/ storage                                             │
    │   └── 3b.4 Research → memory                                                   │
    │                                                                                │
    └── 3c Community Skills (last30days, etc.)                                       │
        └── Workspace Skills already done in 2.4b ───────────────────────────────────┘
```

Each phase depends on the one before it. Notes, Deep Research, and Community Skills are folio-native from the start — no PB intermediate, no migration later.
