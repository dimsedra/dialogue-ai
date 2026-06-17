# Workspace Isolation & Folio Layout

This document outlines the layout, format, and zero-cloud collaboration design for Dialogue's local-first directory folio.

---

## 1. Directory Folio Layout

The root directory (e.g., `dialogue-folio/`) is organized into folders representing isolated **Workspaces**. Each entity (Task, Event, Habit, or General Note) is represented as a physical `.md` file.

```
dialogue-folio/
├── workspaces/
│   ├── apartment-hunt-ws123/   <--- Workspace Folder (Personal Life Project)
│   │   ├── .workspace.yaml     <--- Workspace Config
│   │   ├── workspace_memories.md <--- Workspace-specific specialized memories
│   │   ├── tasks/
│   │   │   └── task-123.md     <--- Workspace Task Notes (e.g. "Call landlord")
│   │   ├── events/
│   │   │   └── event-456.md    <--- Workspace Event (e.g. "Apartment Viewing")
│   │   ├── notes/
│   │   │   └── rental-agreements.md <--- Workspace General Note
│   │   └── activity/
│   │       └── 2026-06-09.md   <--- Workspace daily activity timeline & logs
│   │
│   └── dialogue-app-ws456/     <--- Workspace Folder (Software Project)
│       ├── .workspace.yaml       
│       ├── tasks/
│       ├── events/
│       └── activity/
│           └── 2026-06-09.md   <--- Workspace daily activity timeline & logs
│
├── tasks/                    <--- Global / Workspace-Agnostic Tasks
│   └── grocery-shopping.md   <--- Personal task notes
│
├── events/                   <--- Global / Workspace-Agnostic Events
│   ├── dentist-appointment.md <--- Personal event outcome/prep
│   └── archive/              <--- Archive folder for rotated events
│       └── weekly-team-sync.archive.md <--- Consolidated historical logs
│
├── notes/                    <--- Global / Workspace-Agnostic General Notes
│   └── gift-ideas.md         <--- Personal note
│
├── daily-logs/               <--- Daily Journal & Habits Vault
│   └── 2026-06-09.md         <--- Habit completions & daily thoughts
│
├── personas/                 <--- Agent Personas Folder
│   ├── dialogue.md           <--- Default Persona Config & Prompts
│   └── tech-companion.md
│
├── playbooks/                <--- Synthesized Task Playbooks (Global pool)
│   └── webpack-setup.md      <--- Reusable task roadmap & logs
│
└── system/                   <--- Auditable Memory & System Configurations
    ├── memories.md           <--- User facts and semantic index source
    ├── habits.md             <--- Habit definitions (schedules, goals, streaks)
    ├── user_profile.md       <--- Active N-Line Startup Profile + Last Refined metadata
    └── digests/              <--- Historical N-Log Digests (e.g. 2026-W23.md)
```

---

## 2. Document Format (YAML Frontmatter + Markdown Body)

To allow the database cache to index records, each document starts with a YAML frontmatter section.

### Task Document (`folio/workspaces/apartment-hunt-ws123/tasks/task-123.md`)
```yaml
---
id: task-123
title: "Fix CORS issue"
priority: "high"
dueDate: 2026-06-15
status: "in-progress"
---

### Progress Journal
[2026-06-09 22:30]
Ran into a CORS issue when trying to connect the local Electron dev environment to the PocketBase backend. It seems like the origin header is set to `http://localhost:3000` and need to allow it on PB.

[2026-06-09 22:45]
Added http://localhost:3000 to PB allowed origins. Connection is now successful.
```

### Note Document (`folio/notes/rag-research.md`)
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

---

## 3. Handling Recurrence (Events & Habits)

To keep files simple, intuitive, and human-readable, recurrence uses standard markdown conventions instead of complex configuration schemas:

### A. Habits: Standard Markdown Checklists
*   **The Rule**: Habits are written directly in the body of the Daily Log file (`folio/daily-logs/YYYY-MM-DD.md`) as standard Markdown checkboxes.
*   **Format**:
    ```markdown
    ## Today's Habits
    - [x] Meditation
    - [ ] Gym (Skipped: Knee was sore)
    - [x] Drink 2L Water
    ```
*   **Ingestion**: The sync engine reads the Markdown body and parses `- [x]` or `- [ ]` lines under the `# Habits` header to update completion statistics in the database. No external habit log files are created.

### B. Recurring Events: Single Chronological Log Files
*   **The Rule**: A recurring event series is stored as a **single Markdown file** inside the `events/` folder.
*   **Format**:
    ```markdown
    # Weekly Team Sync
    Schedule: Every Tuesday at 14:00

    ## 2026-06-09 Sync Notes
    * Max completed the Webpack configuration.
    * Rescheduled to 15:00 today due to sync delays.

    ## 2026-06-02 Sync Notes
    * Discussed memories database schema design.
    ```
*   **Ingestion & Log Rotation (Preventing Infinite Growth)**:
    *   When a meeting occurs, the agent or user appends a new date header at the top of the notes section.
    *   **Strict Sliding Window (Max 5 Entries)**: To keep the file small and prevent infinite growth, the active event file only keeps the **most recent 5 occurrences**.
    *   **Auto-Archiving**: When a 6th occurrence is added, the oldest occurrence is automatically moved by the sync engine to a matching archive file under `events/archive/weekly-team-sync.archive.md`.
    *   This keeps the active event notes extremely lightweight (perfect for context window efficiency) while preserving historical records in a single separate archive file.

---

## 4. Workspace Isolation & Zero-Cloud Collaboration

Workspaces are folders on the disk. This gives users powerful capabilities:

1.  **Perfect Context Isolation**: When the agent operates within the `apartment-hunt-ws123` workspace, the vector similarity retrieval restricts its search window strictly to the `folio/workspaces/apartment-hunt-ws123/` subdirectory.
2.  **Zero-Cloud Collaboration**: Sharing a workspace is as simple as sharing a folder (via **Dropbox**, **iCloud**, **Syncthing**, or **Git**). If two users share `folio/workspaces/dialogue-app-ws456/`, their local Dialogue instances watch the same files and update their respective local caches. They collaborate on project notes, tasks, and calendar events with no central server.
3.  **Easy Archiving**: Moving a workspace folder to an external hard drive archives it. The local database cache automatically deletes the records to keep lists fast, but the historical data is safely preserved.
