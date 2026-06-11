# Dialogue Project Timeline

> **Last updated**: 2026-06-10
> This doc is the top-level roadmap superseding `docs/MIGRATION_POCKETBASE.md`. Each phase links to detailed design docs in `docs/future-impl/`.

---

## Overview

Dialogue's development is organized into three sequential phases:

| Phase | Focus | Why this order |
|---|---|---|
| **1. Mastra Orchestration** | Exploit Mastra's full agent orchestration capabilities | Prerequisite for everything after — MCP sidecar management, workflow engine, Workspace integration |
| **2. Vault System** | Filesystem source of truth + sync engine + database cache | The data foundation. All add-on features store their data vault-first from day one |
| **3. Add-on Features** | Notes, Deep Research, Community Skills | Clean integration on top of a settled agent layer and a vault-native data layer |

> Previous work (Convex → PocketBase migration) is considered complete. See [`docs/MIGRATION_POCKETBASE.md`](MIGRATION_POCKETBASE.md) for the migration record.

---

## Phase 1: Mastra Orchestration Enhancement

**Goal**: Move from a single-agent-with-19-tools pattern to a full multi-agent, workflow-driven, MCP-connected architecture.

### Current State

- Single `dialogueAgent` with 19 tools, constructed dynamically per-request
- No workflows, no Workspace integration, no MCP, no Editor, no Browser
- Mastra instance created fresh per request (never reused)
- Chat via `handleChatStream` from `@mastra/ai-sdk`; cron jobs via `.generate()`

### Work Items

| Item | What | Depends On | Reference |
|---|---|---|---|
| 1.1 | **MCP Client infrastructure** — connect to external MCP servers (STDIO sidecars, HTTP) with lifecycle management (spawn, health-check, kill) | `@mastra/mcp` install | [`mastra_orchestration_upgrade.md`](future-impl/mastra_orchestration_upgrade.md#3-mcp) |
| 1.2 | **MCP Sidecar lifecycle** — Tauri manages Python/Node child processes alongside PocketBase; health-check, restart, graceful shutdown | 1.1 | — |
| 1.3 | **Workflow engine** — replace ad-hoc agent tool-chaining with `createWorkflow` + `createStep` for compound operations: daily log synthesis, playbook generation, task execution loops | `@mastra/core` (already installed) | [`mastra_orchestration_upgrade.md`](future-impl/mastra_orchestration_upgrade.md#1-workflows) |
| 1.4 | **Workspace integration** — wire `@mastra/core/workspace` pointed at `vault/` for native file read/write/list/grep, sandboxed CLI execution, and BM25/vector/hybrid search | `@mastra/core` (already installed) | [`mastra_orchestration_upgrade.md`](future-impl/mastra_orchestration_upgrade.md#4-workspace) |
| 1.4b | **Workspace Skills** — configure a `skills/` directory on the Workspace. Agent gains `skill`, `skill_read`, `skill_search` tools automatically, discovering any community skill installed as a folder with `SKILL.md` + scripts. Follows the [Agent Skills](https://agentskills.io) open standard. Includes authoring **`dialogue-core` skill** — a first-party skill always loaded on the Workspace that teaches the agent vault conventions (directory layout, YAML frontmatter schemas, memory ingestion pipeline, graph edge wiring). Community skills return raw results; `dialogue-core` shows the agent how to store them properly in Dialogue's ecosystem. | 1.4 | [`mastra_orchestration_upgrade.md`](future-impl/mastra_orchestration_upgrade.md#4-workspace) |
| 1.5 | **Structured agents** — agent approval (human-in-the-loop), processors (message intercept/transform), guardrails, supervisor agents for multi-agent orchestration | 1.1–1.4 | [`mastra_orchestration_upgrade.md`](future-impl/mastra_orchestration_upgrade.md#6-structured-agents) |
| 1.6 | **Studio integration** — use Mastra Studio for interactive dev, inspection, and debugging | — | [`mastra_orchestration_upgrade.md`](future-impl/mastra_orchestration_upgrade.md#2-editor) |

### Deliverable

Dialogue's agent layer becomes a proper Mastra application: a persistent agent server with MCP-connected tools, graph-based workflows for compound operations, Workspace-backed file access, human-in-the-loop safeguards, and a skills system that taps the entire [Agent Skills ecosystem](https://agentskills.io). Ready to integrate any MCP-capable tool or community skill as an agent primitive.

---

## Phase 2: Vault System

**Goal**: Replace PocketBase as the source of truth with a local filesystem vault. PB becomes a derived database cache.

### Design Docs

All vault design blueprints live in `docs/future-impl/`. The index document is:

- **[`filesystem_notes_workspace_architecture.md`](future-impl/filesystem_notes_workspace_architecture.md)** — entry point linking all modular guides

### Vault Layout

```
dialogue-vault/
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

| Item | What | Reference |
|---|---|---|
| 2.1 | **Sync engine** (Rust, `notify` crate) — file watcher, YAML frontmatter parser, SHA-256 change tracking, SQLite cache upsert | [`sync_ingestion_engine.md`](future-impl/sync_ingestion_engine.md) |
| 2.2 | **Workspace isolation** — per-workspace vault subdirectories, scope-pinned memory lookup, zero-cloud collaboration via folder sync (Dropbox / Syncthing / Git) | [`workspace_vault_layout.md`](future-impl/workspace_vault_layout.md) |
| 2.3 | **Auditable memory** — `vault/system/memories.md` as editable source of truth, time-decay ranking, semantic deduplication | [`unified_memory_architecture.md`](future-impl/unified_memory_architecture.md) |
| 2.4 | **Dynamic agent personas** — `vault/personas/` as editable Markdown, length-capped prompt refinement on updates | [`dynamic_agent_personas.md`](future-impl/dynamic_agent_personas.md) |
| 2.5 | **Daily log synthesis** — `vault/daily-logs/YYYY-MM-DD.md`, N-log behavioral profile refinement on app open | [`unified_memory_architecture.md`](future-impl/unified_memory_architecture.md) |
| 2.6 | **Self-improving playbooks** — agent compiles multi-step traces into `vault/playbooks/`, retrieved via vector search | [`task_playbook_synthesis.md`](future-impl/task_playbook_synthesis.md) |
| 2.7 | **Build & deploy** — bundle PocketBase + Node + Python sidecars into single Tauri installer | [`build_and_deploy.md`](future-impl/build_and_deploy.md) |

### Migration Path

Existing PB data migrates to vault files via an export-on-upgrade script: read each PB collection, write vault files with matching YAML frontmatter, then start the sync engine pointed at the new vault root. PB stays as a read-only cache.

---

## Phase 3: Add-on Features

**Goal**: Ship value-added features on top of a settled agent layer (Phase 1) and vault-native storage (Phase 2).

### 3a: Notes

| Item | What | Reference |
|---|---|---|
| 3a.1 | BlockNote editor component with auto-save | [`notes_memory_vault_integration.md`](future-impl/notes_memory_vault_integration.md) |
| 3a.2 | NoteList panel tab (alongside Tasks/Events/Habits) | same |
| 3a.3 | Mastra tools: `createNote`, `updateNote`, `getNote`, `searchNotes`, `deleteNote` | same |
| 3a.4 | `ingestNoteNotes` memory pipeline — chunk, embed, hash, upsert into memories | same |
| 3a.5 | Vault-native storage: dual-format (BlockNote JSON + Markdown), `vault/notes/` | same |

Notes are stored vault-first from day one, following the same file format and directory layout defined in [`workspace_vault_layout.md`](future-impl/workspace_vault_layout.md).

### 3b: Deep Research (GPT Researcher)

| Item | What | Depends On |
|---|---|---|
| 3b.1 | **Python sidecar** — Tauri spawns `gptr-mcp` (Python MCP server) on app startup, health-checks, reaps on shutdown | Phase 1: MCP sidecar lifecycle (1.2) |
| 3b.2 | **`deep_research` MCP tool** — agent calls `deep_research(query, depth, breadth)` → Python multi-agent pipeline → cited report returned via MCP | 3b.1 |
| 3b.3 | **Research report storage** — `vault/research/YYYY-MM-DD-topic.md` with YAML frontmatter, inline citations, source list | Phase 2: vault layout |
| 3b.4 | **Research → memory pipeline** — `ingestResearchNotes()` indexes report chunks into memories, same pattern as notes | Phase 2: memory system |

GPT Researcher is a Python 3.10+ process. It runs as a Tauri-managed sidecar — the same pattern as PocketBase and the Next.js server. The MCP protocol hides the language boundary; Dialogue's agent sees it as just another tool.

### 3c: Community Skills (last30days, etc.)

**No custom integration needed.** Once Workspace Skills (1.4b) is wired, any skill following the [Agent Skills](https://agentskills.io) open standard can be installed by placing its folder in the `skills/` directory. The agent discovers it automatically and learns its capabilities from the `SKILL.md` instructions.

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
Phase 1: Mastra Orchestration
    │
    ├── 1.1 MCP Client ────────────────────────────────────────────────
    ├── 1.2 MCP Sidecar Lifecycle ──────────────────────────────┐
    ├── 1.3 Workflow Engine ──────────────────────────┐          │
    ├── 1.4 Workspace Integration ───────────┐         │          │
    ├── 1.4b Workspace Skills ───────────────┤         │          │
    ├── 1.5 Structured Agents                │         │          │
    └── 1.6 Studio Integration               │         │          │
                                               │         │          │
Phase 2: Vault System                          │         │          │
    │                                          │         │          │
    ├── 2.1 Sync Engine (Rust)                 │         │          │
    ├── 2.2 Workspace Isolation                │         │          │
    ├── 2.3 Auditable Memory                   │         │          │
    ├── 2.4 Dynamic Personas                   │         │          │
    ├── 2.5 Daily Log Synthesis                │         │          │
    ├── 2.6 Playbooks                          │         │          │
    └── 2.7 Build & Deploy                     │         │          │
                                               │         │          │
Phase 3: Add-on Features                       │         │          │
    │                                          │         │          │
    ├── 3a Notes                               │         │          │
    │   └── 3a.5 Vault-native storage ─────────┘         │          │
    │                                                    │          │
    ├── 3b Deep Research (GPT Researcher)
    │   ├── 3b.1 Python sidecar ─────────────────────────┤
    │   ├── 3b.2 deep_research MCP tool ─────────────────┤
    │   ├── 3b.3 vault/research/ storage ────────────────┼──────────┘
    │   └── 3b.4 Research → memory ──────────────────────┼────────────
    │
    └── 3c Community Skills (last30days, etc.)
        └── Workspace Skills already done in 1.4b ───────┘
```

Each phase depends on the one before it. Notes, Deep Research, and Community Skills are vault-native from the start — no PB intermediate, no migration later.
