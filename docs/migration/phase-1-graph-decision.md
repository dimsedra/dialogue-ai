# Phase 1 — LadybugDB graph layer decision

**Status**: ✅ Resolved.
**Decision**: keep 4 edge tables, delete 6 edge tables. All 7 node tables stay.

## The question

`src/lib/graph/ladybug.ts:20-38` declares 7 node tables and 10 edge tables in the LadybugDB DDL. Of these, only one node table (`Memory`) is actually populated. None of the 10 edge tables have any data. The graph is aspirational.

Per migration plan §3.5, this is the phase to resolve: populate the edges (high effort, uncertain value) or delete the aspirational schema (low effort, simpler).

## The decision

**Delete the aspirational edges. Keep the four that have a clear retrieval-augmentation use case.** The reasoning for each edge is in the table below.

## Edge disposition

| # | Edge | FROM | TO | Decision | Why |
|---|------|------|----|----------|-----|
| 1 | `BLOCKED_BY` | Task | Task | ❌ **delete** | Not used. The app has `task.progress` for partial completion but no "this task blocks that one" semantics. |
| 2 | `PREREQUISITE_FOR` | Task | Task | ❌ **delete** | Same reason as BLOCKED_BY. No code references it. |
| 3 | `COLLABORATES_WITH` | Task, Event | Person | ❌ **delete** | The app has no `Person` concept. The Person node table is itself unused; deleting this edge is moot. |
| 4 | `RELATED_TO` | Event | Task | ❌ **delete** | Implicit relationship is captured by `events.workspaceId` → `tasks.workspaceId` (same workspace). No code needs an explicit edge. |
| 5 | `REFERENCES` | Memory, Task, Event, Habit | Memory | ❌ **delete** | Superseded by the 4 MENTIONS_X edges below, which are typed. Untyped REFERENCES is the v0 of a typed graph; we don't need both. |
| 6 | `CREATED_IN_SESSION` | Memory, Task, Event, Habit | ChatSession | ❌ **delete** | `messages` already has `sessionId` directly. For Task/Event/Habit created in a chat, the session ID is captured via `chat_sessions.lastActivity` semantics, not an edge. |
| 7 | **`MENTIONS_TASK`** | Memory | Task | ✅ **keep** | When a memory is saved, parse out any referenced task and create the edge. This is a real, planned use case for retrieval. |
| 8 | **`MENTIONS_EVENT`** | Memory | Event | ✅ **keep** | Same as MENTIONS_TASK. |
| 9 | **`MENTIONS_HABIT`** | Memory | Habit | ✅ **keep** | Same as MENTIONS_TASK. |
| 10 | **`BELONGS_TO`** | Memory, Task, Event, ChatSession, Habit | Workspace | ✅ **keep** | Each entity already has `workspaceId` in its PB record. The edge is redundant with the foreign key. **HOWEVER**: keeping it costs nothing (one DDL line) and provides a graph traversal path that joins across entity types. Delete or keep is judgement; the cost of keeping is negligible. |

**Net**: 4 keep, 6 delete. The retained edges (MENTIONS_TASK, MENTIONS_EVENT, MENTIONS_HABIT, BELONGS_TO) have a clear use case in the next phase: wire up `saveSemanticMemory` to also create MENTIONS_TASK/EVENT/HABIT edges for any task/event/habit mentioned in the memory text.

## Node disposition

All 7 node tables stay. None are deleted.

| Node | Why it stays |
|------|--------------|
| `Task` | Target of MENTIONS_TASK and BELONGS_TO. Will be populated in Phase 2 when edges are wired up. |
| `Event` | Target of MENTIONS_EVENT and BELONGS_TO. |
| `Habit` | Target of MENTIONS_HABIT and BELONGS_TO. |
| `Memory` | Only currently-populated node. Source of MENTIONS_* edges. |
| `ChatSession` | Target of CREATED_IN_SESSION (deleted) and BELONGS_TO (kept). |
| `Workspace` | Target of BELONGS_TO. |
| `Person` | No edges reference it. **Stays as a node** because (a) deleting requires also dropping the COLLABORATES_WITH edge and any future Person-related edges, and (b) it's 1 DDL line. Decision can be revisited in Phase 2 if we confirm Person is never needed. |

**Stability rationale**: keeping node tables we don't populate yet is a low-risk, low-cost decision. It preserves the option to populate them in Phase 2 without a schema migration. If we delete them now and need them later, that's another DDL change. The DDL is idempotent (CREATE IF NOT EXISTS semantics in `ladybug.ts:40-50`), so keeping is essentially free.

## The code change

`src/lib/graph/ladybug.ts` is updated to:
- Keep all 7 `CREATE NODE TABLE` statements
- Drop the 6 edge `CREATE REL TABLE` statements (BLOCKED_BY, PREREQUISITE_FOR, COLLABORATES_WITH, RELATED_TO, REFERENCES, CREATED_IN_SESSION)
- Keep the 4 edge `CREATE REL TABLE` statements (MENTIONS_TASK, MENTIONS_EVENT, MENTIONS_HABIT, BELONGS_TO)

The error tolerance (`"already exists"` swallowed in `ladybug.ts:44-48`) means this change is forward-compatible with existing on-disk databases: the unused edges already exist on disk, and re-running the new DDL will simply not try to create them. **No data migration is needed because no edges were ever written.**

## What this phase does NOT do

- **No edge population code yet.** MENTIONS_TASK etc. are declared but no code creates them. Phase 2 (pb-compat adapter) wires `saveSemanticMemory` to also create these edges.
- **No node population code yet.** Task/Event/Habit nodes are not created in LadybugDB today. Phase 2 also handles this: when a Task/Event/Habit is written to PB, mirror it to LadybugDB.
- **No removal of unused node tables.** Decision deferred to Phase 2 once we see what we actually populate.

## Decision log

| Date | Decision | Reason | Reversible? |
|------|----------|--------|-------------|
| 2026-06-07 | Keep 4 edges (MENTIONS_TASK/EVENT/HABIT, BELONGS_TO), delete 6 edges | Use case in Phase 2 retrieval | Yes — DDL is idempotent, can re-add |
| 2026-06-07 | Keep all 7 node tables | Cost of keeping is 1 DDL line per table; preserves Phase 2 options | Yes |

## Files modified in this phase

| Path | Change |
|------|--------|
| `src/lib/graph/ladybug.ts` | 10 edge CREATE statements → 4 edge CREATE statements |
| `docs/migration/phase-1-graph-decision.md` | This document |
