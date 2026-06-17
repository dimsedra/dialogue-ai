# Local-First Filesystem-Backed Notes & Workspaces

This index documents the folio system (Phase 1 of the [project timeline](../PROJECT_TIMELINE.md)). The documentation is split into modular, focused guides:

1.  **[Workspace Isolation & Folio Layout](workspace_folio_layout.md)**: Details the filesystem directory structure, markdown document formats, frontmatter schemas, and zero-cloud directory sharing.
2.  **[Sync & Ingestion Engine](sync_ingestion_engine.md)**: Specifications for the file watcher, AST parser, hash-based change tracking, and SQLite caching database.
3.  **[Unified Memory & Profile Synthesis](../memory-and-sessions/unified_memory_architecture.md)**: Details the design for user control of facts in `memories.md`, app-start consolidation of `user_profile.md` from daily logs, and the hybrid logical + semantic graph RAG engine.
4.  **[Dynamic Agent Personas](../agent-orchestration/dynamic_agent_personas.md)**: Details the filesystem storage of persona instructions and the real-time, length-capped prompt refinement protocol.
5.  **[Self-Improving Task Playbooks](task_playbook_synthesis.md)**: Design blueprints for how the agent compiles tool runs and CLI traces into reusable playbooks.
6.  **[Notes: Memory & Folio Integration](../addons-and-skills/notes_memory_folio_integration.md)**: Three-phase integration plan for BlockNote editor, PB notes collection, memory pipeline, sync engine bridge, and folio-first architecture.
7.  **[Branching Chat Sessions](../memory-and-sessions/branching_chat_sessions.md)**: Specifications for Git-like conversation branching, message-level date slicing, and proactive workflow scoping.
8.  **[Dialogue Skills Ecosystem](../addons-and-skills/dialogue_skills_ecosystem.md)**: Architecture for first-party operation skills, community integrations, dynamic tool parsing, and folio-first writes.
