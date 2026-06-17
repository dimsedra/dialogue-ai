# Notes: Memory & Vault Integration

This document maps the integration of a BlockNote-based notes editor into Dialogue's vault system (Phase 3a in the [project timeline](../../PROJECT_TIMELINE.md)).

The vault layout ([workspace_vault_layout.md](../vault-system/workspace_vault_layout.md)) already defines `notes/` directories at both global and workspace levels. This doc fills in the data model, content format, editor component, agent tools, memory pipeline, and the sync-engine bridge that connects them.

---

## 1. Data Schema

### PocketBase `notes` Collection

| Field | Type | Vault YAML Equivalent | Purpose |
|---|---|---|---|
| `id` | Text | `id` | Stable UUID across both stores |
| `user` | Relation → users | — | PB auth link (derived from vault parent folder) |
| `workspace` | Relation → workspaces | — | Null for global notes; vault subfolder determines workspace |
| `title` | Text | `title` | First `# Heading` or explicit title |
| `content` | JSON | — | BlockNote block array (`Block[]`) for instant rendering |
| `body_md` | Text | (Markdown body) | Vault-compatible Markdown export/import |
| `summary` | Text | `summary` | AI-generated one-liner for list views |
| `tags` | JSON | `tags` | Auto-tagged topics |
| `pinned` | Bool | `pinned` | Pin to top of list |
| `source_id` | Text | `source_id` | Link to task/event/habit id |
| `source_type` | Text | `source_type` | `"Task"` / `"Event"` / `"Habit"` / null |
| `file_path` | Text | — | Set by sync engine in Phase 2; path relative to vault root |
| `createdAt` | Number | `created_at` | |
| `updatedAt` | Number | `updated_at` | |

### Content Format: Dual-Store Strategy

BlockNote's document model is a JSON array of block objects. The core MPL-2.0 packages (`@blocknote/core`, `@blocknote/react`) include built-in Markdown import/export utilities (`BlocksToMarkdown`, `MarkdownToBlocks`).

On every save, store **both** representations:

- **`content`** — BlockNote JSON (instant render, no re-parse on open)
- **`body_md`** — Markdown (human-readable, diffable, editable in any text editor, vault-compatible)

This avoids format lock-in. If the JSON cache is lost or stale, `MarkdownToBlocks(body_md)` regenerates it at render time with negligible cost.

---

## 2. Three-Phase Rollout

### Phase 1: PB-Backed Notes (Current Architecture)

BlockNote editor writes to PB as the primary store. Follows the exact pattern of tasks/events today.

```
┌──────────────────────────────────────────┐
│              BlockNote Editor            │
│  (saves PB notes collection directly)    │
└────────────────┬─────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────┐
│          PB notes collection             │
│  content (JSON) │ body_md (Markdown)     │
└───────┬──────────────────────────────────┘
        │
        ├──► ingestNoteNotes()
        │       chunkText → embed → hash → upsert into memories
        │       wireMentionsEdges() → graph_edges
        │
        └──► retrieveGraphContext() → returns notes in results
```

**New files to create:**

| File | Purpose |
|---|---|
| `pb_migrations/1718000006_create_notes.js` | PB collection with indexes on `user`, `workspace`, `tags`, `source_type` |
| `src/pb-compat/hooks/use-pb-notes.ts` | `usePbNotesList`, `usePbNoteGet` |
| `src/pb-compat/hooks/use-pb-note-mutations.ts` | `createNote`, `updateNote`, `deleteNote` |
| `src/pb-compat/descriptors/notes.ts` | `listQuery`, `getQuery`, `searchQuery` |
| `src/components/panel/NoteList.tsx` | Notes list view, same pattern as TaskList / EventList |
| `src/components/notes/NoteEditor.tsx` | BlockNote editor wrapper with auto-save |
| `src/mastra/tools/createNote.ts` | Agent tool: create note + ingest memory |
| `src/mastra/tools/updateNote.ts` | Agent tool: update note + re-index changed chunks |
| `src/mastra/tools/getNote.ts` | Agent tool: read full note content |
| `src/mastra/tools/searchNotes.ts` | Agent tool: PB full-text search across notes |
| `src/mastra/tools/deleteNote.ts` | Agent tool: remove note + cascade-delete memories |
| `src/lib/graph/ingest.ts` — add `ingestNoteNotes()` | Index note chunks into memories |
| `src/lib/graph/traversal.ts` — extend `retrieveGraphContext` | Return `notes` alongside tasks/events/habits |

**Agent system prompt update** — add to the priority decision tree:
> **4. Note-taking info** → call `createNote` or `updateNote`
> When the user dictates notes, journal entries, meeting minutes, or any free-form documentation. Do NOT duplicate into saveSemanticMemory — saveSemanticMemory is for standalone facts only.

#### Memory Pipeline: `ingestNoteNotes`

Follows the identical pattern as `ingestTaskNotes` at `src/lib/graph/ingest.ts:50`:

1. Extract plain text from `body_md` or concatenate BlockNote text segments
2. `chunkText()` into segments (max 500 chars per chunk)
3. `getLocalEmbedding()` per chunk (384d L2-normalized Xenova)
4. SHA-256 hash comparison — skip unchanged chunks
5. Upsert into `memories` with `source_type: "Note"` and `source_id: noteId`
6. `wireMentionsEdges()` — auto-detect task/event/habit mentions, create `MENTIONS_TASK`, `MENTIONS_EVENT`, `MENTIONS_HABIT` edges

#### Graph Context Extension

`retrieveGraphContext` (`src/lib/graph/traversal.ts:43`) currently resolves edges to Tasks/Events/Habits. Extend to include Notes:

- `graph_edges` gains a new `target_type: "Note"`
- `retrieveGraphContext` returns `notes: GraphContextEntity[]` alongside `tasks`, `events`, `habits`
- The agent receives note content in its context window when semantically relevant

---

### Phase 2: Sync Engine Bridge

The Electron sync engine (`notify` crate, per [sync_ingestion_engine.md](../vault-system/sync_ingestion_engine.md)) watches `vault/notes/` for changes and propagates them into PB.

```
External editor edits notes/my-note.md
    │
    ▼ (chokidar package)
[ Sync & Ingestion Engine ]
    │
    ├──► YAML frontmatter parser → PB notes metadata fields
    ├──► MarkdownToBlocks(body)  → PB notes.content (JSON cache)
    ├──► SHA-256 hash comparison → skip unchanged chunks
    ├──► ingestNoteNotes()       → re-index only changed chunks
    │
    ▼
[ PB notes collection ] (now has file_path set)
```

**Write direction during Phase 2:**

- **UI writes** (BlockNote editor) still go through PB directly — the sync engine does not need to write back to the vault for these; the PB record is already up to date
- **External writes** (user edits `notes/my-note.md` in VS Code) are detected by `notify`, parsed, and upserted into PB
- **`file_path` field** — set by the sync engine on first sync. PB records created by the editor (before the vault file exists) have `file_path: null` until the sync engine creates the vault file and backfills the path

**Hash-aware dedup** — same mechanism as `ingest.ts:84`. If the vault file's SHA-256 hash of each chunk matches the stored hash in PB, the engine skips re-embedding entirely.

---

### Phase 3: Vault-First

BlockNote editor reads/writes vault `.md` files directly through the Node.js fs API. PB is demoted to read-only search cache.

```
BlockNote Editor
    │
    ├──► reads: vault/notes/my-note.md
    │       parse frontmatter → metadata
    │       MarkdownToBlocks(body) → render in editor
    │
    ├──► saves: write body_md + YAML frontmatter to vault/notes/my-note.md
    │       (Node.js fs API write_file)
    │
    └──► PB cache: sync engine detects vault change → upserts PB
            → triggers reactive subscriptions (UI auto-updates)

Agent Tools
    └──► createNote
            → Node.js fs write: vault/notes/my-note.md
            → sync engine picks up → PB updates → UI updates
```

**Key differences from Phase 2:**

| Aspect | Phase 2 (Bridge) | Phase 3 (Vault-First) |
|---|---|---|
| Source of truth | PB | Vault `.md` file |
| Editor writes to | PB | Vault file (via Node.js fs) |
| PB `content` JSON | Primary render source | Optional cache (regenerated from `body_md` if missing) |
| Graph edges | Stored in PB `graph_edges` | Stored as frontmatter keys in the `.md` file (e.g. `mentions: [task-123, event-456]`), parsed by sync engine |
| Offline write | PB on-device DB | Vault file + sync engine reconciles on next open |

**Graph relations in frontmatter** — the vault file stores explicit links:

```yaml
---
id: note-a1b2c3
title: "RAG Research Notes"
mentions:
  - type: Task
    id: task-xyz
  - type: Event
    id: event-789
tags: [ai, research]
source_id: task-xyz
source_type: Task
pinned: false
created_at: 2026-06-08
updated_at: 2026-06-10
---
```

The sync engine's AST parser extracts `mentions` from frontmatter and creates `graph_edges` rows in PB. This makes the graph auditable too — open the note file and see what it's linked to.

---

## 3. Vault File Format

Per the vault layout in [workspace_vault_layout.md](../vault-system/workspace_vault_layout.md), notes live at either:

- `vault/notes/my-note.md` — global/workspace-agnostic
- `vault/My-Project/notes/my-note.md` — workspace-scoped

```markdown
---
id: note-a1b2c3
title: "Retrieval-Augmented Generation Notes"
summary: "Summary of three key RAG papers and their tradeoffs"
tags: [ai, research, thesis]
source_id: task-xyz
source_type: Task
pinned: false
created_at: 2026-06-08
updated_at: 2026-06-10
---

## Core Concepts

RAG combines retrieval from a knowledge base with generative language models.
The retriever fetches relevant documents, then the generator produces an answer
conditioned on those documents.

## Key Papers

- Lewis et al. (2020): "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
- Borgeaud et al. (2022): "Improving Language Models by Retrieving from Trillions of Tokens"
```

The `title`, `summary`, `tags`, and `source_*` fields are editable by the user directly in any text editor. The sync engine picks up changes on the next file watch event.

---

## 4. Migration Path

| Step | Phase | What Changes | Risk |
|---|---|---|---|
| 1 | 1 | PB `notes` collection + migration | None (new table) |
| 2 | 1 | BlockNote editor + NoteList panel UI | None (new components) |
| 3 | 1 | Mastra tools (`createNote`, `updateNote`, `getNote`, `searchNotes`, `deleteNote`) | None (new tools, registered in agent) |
| 4 | 1 | `ingestNoteNotes()` in `src/lib/graph/ingest.ts` | Low — follows existing pattern |
| 5 | 1 | Extend `retrieveGraphContext` to resolve `Note` edges | Low — adds parallel case to existing switch |
| 6 | 1 | Update agent system prompt with note priority rule | Low — text change |
| 7 | 2 | Sync engine watches `vault/notes/` directory | Medium — Node.js `chokidar` package integration |
| 8 | 2 | `MarkdownToBlocks()` conversion in parser pipeline | Low — `@blocknote/core` handles this |
| 9 | 2 | `notes` records gain `file_path` field (nullable) | None — additive schema change |
| 10 | 3 | BlockNote editor reads/writes vault files via Node.js fs API | High — editor becomes fs-aware, dual-path writes during transition |
| 11 | 3 | PB `content` field becomes optional cache | Medium — render fallback path must regenerate from `body_md` |

Steps 1–6 (Phase 1) are fully independent of the vault migration. The notes feature can be built and shipped entirely within the current PB architecture. When the sync engine lands (Phase 2), every note already has `body_md` stored and the schema matches vault frontmatter — zero data migration required.

---

## 5. Agent Integration

### Tools

| Tool | Description | Memory Side-Effect |
|---|---|---|
| `createNote` | Creates a new note with title + content (BlockNote JSON + body_md) | Auto-indexes via `ingestNoteNotes()` |
| `updateNote` | Appends/edits existing note content; re-generates body_md | Re-indexes changed chunks |
| `getNote` | Returns title + body_md for a note by id | — |
| `searchNotes` | Full-text search across title + body_md; returns matching note summaries | — |
| `deleteNote` | Removes note from PB; cascade-deletes associated memories | `deleteSourceMemories(pb, noteId, "Note")` |

### System Prompt Priority

The agent's decision tree gains a new layer:

> **1. Task/Event/Habit notes** → `appendTaskNotes` / `appendEventNotes` / `log_habit`
> **2. Standalone user facts** → `saveSemanticMemory` (last resort)
> **3. Note-taking info** → `createNote` or `updateNote`
> When the user dictates notes, journal entries, meeting minutes, or free-form documentation. Notes are NOT duplicated into semantic memory — `ingestNoteNotes` handles that automatically.

---

## 6. Daily Log Integration

Per [unified_memory_architecture.md](../memory-and-sessions/unified_memory_architecture.md), note creation/updates become a trigger source:

### Global Log Triggers (Phase 1+)
*   **Note Creation/Updates**: Significant notes authored in conversation are referenced in the Companion Synthesis section of the daily log. The agent summarizes what was noted relevant to the user's growth.

### Workspace Log Triggers (Phase 2+)
*   **Workspace Note Mutations**: When the sync engine detects a new or modified note in `vault/My-Project/notes/`, it appends a `### Workspace Timeline` entry: "Added note: RAG Research Notes to workspace."

---

## 7. Architecture Diagrams

### Phase 1 (PB Source of Truth)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ BlockNote    │    │ NoteList     │    │ Mastra Agent │
│ Editor       │    │ (Panel tab)  │    │ (tools)      │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │   ┌───────────────┴───────────────────┘
       │   │
       ▼   ▼
┌──────────────────────────────────────────────┐
│           PB notes collection                 │
│  content(JSON) + body_md + metadata           │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│           ingestNoteNotes()                   │
│  chunkText → embed → hash → memories          │
│  wireMentionsEdges → graph_edges              │
└──────────────────────────────────────────────┘
```

### Phase 2 (Sync Engine Bridge)

```
┌──────────────┐         ┌──────────────────┐
│ BlockNote    │         │ External Editor  │
│ Editor       │         │ (VS Code, etc.)  │
└──────┬───────┘         └────────┬─────────┘
       │                          │
       ▼ (PB write)               ▼ (file save)
┌──────────────┐         ┌──────────────────┐
│ PB notes     │         │ vault/notes/     │
│ (cache)      │ ◄────── │ my-note.md       │
└──────────────┘         │ (source of truth) │
       │                 └──────────────────┘
       │                          │
       │                    ┌─────┴─────┐
       │                    │ sync      │
       │                    │ engine    │
       │                    │ (notify)  │
       │                    └─────┬─────┘
       │                          │
       └──────────────────────────┘
         (MarkdownToBlocks + upsert)
```

### Phase 3 (Vault Source of Truth)

```
┌──────────────┐         ┌──────────────────┐
│ BlockNote    │         │ External Editor  │
│ Editor       │         │ (VS Code, etc.)  │
└──────┬───────┘         └────────┬─────────┘
       │                          │
       ▼ (Node.js fs write)         ▼ (file save)
┌──────────────────────────────────────────────┐
│           vault/notes/my-note.md             │
│           (source of truth)                  │
└────────────────────┬─────────────────────────┘
                     │
                     ▼ (chokidar package)
┌──────────────────────────────────────────────┐
│           Sync & Ingestion Engine            │
│  parse frontmatter → MarkdownToBlocks → PB   │
│  chunkText → embed → memories                │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│           PB notes (read-only cache)          │
│  content(JSON) regenerated from body_md       │
└────────────────────┬─────────────────────────┘
                     │
                     ▼ (PB reactive subscription)
┌──────────────────────────────────────────────┐
│           UI (list + editor) auto-updates     │
└──────────────────────────────────────────────┘
```

---

## 8. Key Design Decisions

1. **Dual-format storage** — BlockNote JSON for instant render, Markdown for vault compatibility. No format lock-in.
2. **`body_md` as the vault bridge** — stored from Phase 1, zero migration when the sync engine lands.
3. **`ingestNoteNotes` reuses `ingestTaskNotes` pattern** — identical chunking, hashing, embedding, and edge-wiring logic. Low implementation risk.
4. **No `@blocknote/xl-ai`** — AI features (summarize, tag, search) use the existing Vercel AI SDK + Mastra stack. The XL packages (`@blocknote/xl-*`) are GPL-3.0 or paid; core packages (`@blocknote/core`, `@blocknote/react`) are MPL-2.0 and fully sufficient.
5. **`file_path` is nullable** — records created before Phase 2 (or without a vault file) are not blocked from existing. The field is populated lazily on first sync.
6. **Graph edges move to frontmatter in Phase 3** — `mentions:` in the YAML block makes the knowledge graph auditable like everything else in the vault. The sync engine parses this declaratively rather than requiring inline agent writes to `graph_edges`.
