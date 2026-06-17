# Sync & Ingestion Engine Specifications

This document defines the technical specifications of the file watcher, Markdown parser, and SQLite database cache synchronization engine.

---

## 1. Core Architecture

The synchronization engine operates in the background, bridging the local folio files to the fast SQLite/PocketBase database:

```
[ Local Markdown Folio ]  <--- (Source of Truth, edited by user or agent)
         │
         ▼ (Node.js File Watcher / chokidar)
[ Sync & Ingestion Engine ]
         │
         ├─► AST / Frontmatter Parser (syncs metadata to SQLite)
         │       Supports: tasks, events, notes, habits, workspaces
         ├─► Markdown ↔ BlockNote JSON Converter (notes only)
         │       MarkdownToBlocks() for PB cache content field
         │       BlocksToMarkdown() for reverse write
         ├─► Chunk & Vectorize (Transformers.js / Xenova 384d)
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│             PocketBase / SQLite Database Cache                 │
│                                                                │
│  [tasks]  [events]  [notes]  [habits]  [workspaces]            │
│                                                                │
│  [memories]                                                    │
│  - id: m_1                                                     │
│  - text: "Ran into CORS issue with http://localhost:3000 origin"   │
│  - embedding: [0.15, -0.23, ...]                               │
│  - file_path: "folio/Personal/tasks/task-123.md"               │
│  - source_type: "Task"                                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Technical Specifications

1.  **File Watcher**: Built using Node.js's native `chokidar` package to receive low-latency file write notifications.
2.  **Parser**:
    *   Extracts YAML frontmatter to update/insert metadata columns in the `tasks` / `events` / `notes` / `workspaces` SQLite tables.
    *   For notes: parses `title`, `summary`, `tags`, `source_id`, `source_type`, `pinned`, `created_at`, `updated_at` from frontmatter. Converts the Markdown body to BlockNote JSON blocks via `MarkdownToBlocks()` for the `content` cache field, and stores the raw body as `body_md` for folio round-trip fidelity.
    *   For all other entity types: parses the Markdown body below the frontmatter into header-level or paragraph-level chunks for memory ingestion.
3.  **Smart Ingestion (In-Place Updates)**:
    *   Computes a SHA-256 hash of each markdown chunk.
    *   Compares chunk hashes to avoid generating unnecessary embeddings.
    *   Regenerates vector embeddings only for modified/new chunks.
    *   Deletes stale database memories when a chunk is removed.
4.  **Desync Reconciliation**: Runs a quick hash comparison check on startup to verify the database cache matches the files on the disk, resolving any writes that occurred while Dialogue was closed.
