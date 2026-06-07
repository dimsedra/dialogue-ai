# ADR-012: Custom Memory System over Mastra Memory

- **Status**: Accepted
- **Date**: 2026-06-07
- **Authors**: User & opencode
- **Domain**: Memory architecture, agent cognition, dependency footprint

---

## 1. Context & Problem Statement

Mastra 1.0 ships a complete memory subsystem (`@mastra/memory`) with four components:

1. **Message history** — last N messages per thread, automatic persistence.
2. **Working memory** — template or schema for persistent per-user state.
3. **Semantic recall** — RAG over past messages via a vector store.
4. **Observational Memory (OM)** — background Observer + Reflector agents that compress message history into a dense observation log (5–40× compression), with optional retrieval mode for exact wording.

ADR-011 carved out OM as the only Mastra 1.0 feature permitted during the migration freeze, on the rationale that it would *delete* ~500 LOC of custom `saveMemory` / `saveMemoryBackendSync` / `extractAndSaveMemory` pipeline.

The seven Mastra memory docs (`/storage`, `/message-history`, `/observational-memory`, `/working-memory`, `/semantic-recall`, `/memory-processors`, `/multi-user-threads`) were re-read end-to-end on 2026-06-07. The cost/benefit case for adopting any of the four components has shifted. The custom memory system Dialogue has built — `saveSemanticMemory` tool + `retrieveGraphContext` tool + LadybugDB vector+graph storage + 384d Xenova local embeddings + 0.85 cosine dedup — is *more sophisticated for our specific use case* than Mastra's stack, even though Mastra's stack is *more elegant as a product*.

## 2. Decision

**Decline all four Mastra memory components** (message history, working memory, semantic recall, observational memory). Continue refining the custom memory system per the roadmap in §3. Mastra memory is not adopted during the migration freeze and is not on the post-cutover roadmap unless a trigger condition in §5 is met.

The OM carve-out in ADR-011 §2.3 is **superseded** by this decision on the same day it was accepted.

## 3. Refinement Roadmap (the custom system we keep)

The custom system has rough edges. The freeze is the right time to address them — none require a new dependency, all are additive or simplification. Order is loose, not strict.

1. **Wire `MENTIONS_TASK/EVENT/HABIT` edges in `saveSemanticMemory`** (~1–2 h, Phase 2 first step). Additive. Proves the trimmed graph schema (4 keep / 6 delete edges per Phase 1.3) works at runtime. — ✅ **DONE** (commit `4fdb9c9`, Stream A.1 of `docs/migration/phase-2-adapter.md`). Helper: `src/lib/graph/edges.ts`. Schema extended in `src/mastra/tools/saveSemanticMemory.ts`. 10 tests in `src/lib/graph/edges.test.ts`. Stale IDs are silent no-ops; the `MemoryHealth` view (item 3) surfaces them.
2. **Add graph traversal to `retrieveGraphContext`** — single-call expansion: given a memory, return its `RELATES_TO` neighbors and `MENTIONS_*` entities. Currently each step needs separate queries. — ✅ **DONE** (commit `4ed7f3d`, Stream A.2). Helper: `src/lib/graph/traversal.ts`. The "expansion" was bigger than the original roadmap item implied: a **cartesian-product bug** in the original query was also fixed (chained `OPTIONAL MATCH`es without `WITH` between them caused `collect()` to duplicate across fan-out rows). MENTIONS_HABIT added. Threshold now configurable (default 0.6). 10 tests in `src/lib/graph/traversal.test.ts`. Three Cypher gotchas surfaced and documented in `phase-2-adapter.md` §9 (CAST for cosine param, null→[] for empty OPTIONAL MATCH, MATCH (n) DETACH DELETE n for test isolation).
3. **Add a `MemoryHealth` admin view** — counts, dedup ratio, oldest memory, sources. Helps verify the system is working without relying on gut feel. — ✅ **DONE** (commit `e534f01`, Stream A.3). Helper: `src/lib/graph/health.ts`. API: `GET /api/admin/memory-health`. UI: `src/app/admin/memory-health/page.tsx` (server-rendered, 3 cards + sample list). 6 tests in `src/lib/graph/health.test.ts`. Scope was trimmed from the original roadmap item: "oldest memory" deferred (Memory node schema has no `createdAt` field), "dedup ratio" deferred (the `hash` field lives in Convex, not LadybugDB; cross-store dedup is a Phase 4+ concern), "orphan edges" reframed as "lonely memories" (because the silent-no-op on stale IDs means there are no dangling edges — see `phase-2-adapter.md` §4 decision 7). The integration point with A.1 is verified by `health.test.ts`: a Memory created with a stale `taskIds` value shows up in the lonely list.
4. **Delete dual-write (Phase 4)** — LadybugDB becomes the sole memory store. The Convex `memories` table mirror and the `saveMemoryBackendSync` / `saveMemory` paths are deleted in favor of direct LadybugDB writes.
5. **Stress-test the dedup pipeline** at scale — 10k synthetic messages, measure dedup ratio. The 0.85 cosine + hash pre-filter should be validated, not assumed.
6. **Document the memory system end-to-end** in `docs/architecture/memory-system.md`. The system is currently scattered across `saveSemanticMemory.ts`, `convex/ai.ts`, `convex/background_jobs.ts`, `retrieveGraphContext.ts`. One doc that explains the architecture, the write path, the read path, the dedup pipeline, the graph schema, and the failure modes.

## 4. Why Custom Wins for Dialogue

### 4.1 The graph is the relationship

Dialogue is "relationship-first AI." The LadybugDB graph is what lets us answer queries that no flat observation log can:

- "What tasks is this memory connected to?" → `MENTIONS_TASK` traversal
- "What events is this task scheduled around?" → `MENTIONS_EVENT` + event-time query
- "Show me everything related to the user mentioning 'project deadline' last week" → graph expansion from a vector search

Mastra's observation log is a flat, ordered list with `range` pointers back to raw messages. It cannot do graph queries. Replacing LadybugDB with Mastra memory would be a regression in the memory model.

### 4.2 Local 384d embeddings are a privacy and cost win

ADR-010 standardized on 384d Xenova local embeddings. The pipeline is:

- Server-side Xenova runs in the Tauri-spawned Node process.
- No external API call per embedding.
- Dimensional contract is enforced at three points (`EXPECTED_EMBEDDING_DIM`, runtime length assertions in `saveMemory` / `saveMemoryBackendSync`).
- Cosine-similarity dedup at 0.85 + hash pre-filter.

Mastra's memory stack uses the model router for embeddings (`@mastra/core/llm`, `ModelRouterEmbeddingModel`). Adopting Mastra memory partially undoes the 384d unification: we either use Mastra's embeddings (giving up local/private) or we override the embedder and inherit whatever the override doesn't cover.

### 4.3 Transparency

The custom pipeline is debuggable. We can:

- Read `saveSemanticMemory.ts` and see the extraction prompt.
- Read `convex/background_jobs.ts` and see the batch extraction logic.
- Read `retrieveGraphContext.ts` and see the query construction.
- Run `npx convex dev` and inspect the `memories` table directly.

Mastra's OM is an LLM call. We don't see what the Observer chose to extract or skip. When the agent says "I remember you mentioned X", we have no audit trail. For a "relationship" product, the relationship should be inspectable.

### 4.4 Scale mismatch

Mastra's OM is designed for 30k+ token conversations that need compression. The 5–40× compression ratio, async buffering, and three-tier memory model all address problems that exist at 100k+ tokens of accumulated message history.

Dialogue's current scale: ~1k tokens per session, ~50 messages. We do not have the problem OM solves. Adopting OM is solving tomorrow's problem with today's complexity.

### 4.5 No vendor risk

Mastra can pivot, deprecate OM, change the API, change the storage shape, change the embedder defaults. The migration to Mastra memory would create a new lock-in surface that does not exist today. The custom system is forever — we own it, we refactor it, we keep it.

## 5. Trigger Conditions for Reconsideration

This decision is reversible. The custom system should be re-evaluated against Mastra memory **if and only if** any of the following become true:

1. **Context rot becomes measurable.** After 6+ months of daily use, the agent starts producing noticeably worse responses in long sessions (e.g. > 20k tokens of accumulated history). Data-driven: "responses in 20k-token sessions score X lower on coherence than 5k-token sessions."
2. **Maintenance burden.** The custom system accumulates enough surface area that refactoring it takes > 20% of an engineer's time. Estimated by counting PRs against the memory code paths per quarter.
3. **A specific Mastra memory feature lands that solves a problem we cannot solve.** Example: if Mastra adds a graph layer to OM and we still want auto-compression, the calculus changes.

Any reversal must be a new ADR. The current decision is not silently reversible.

## 6. Consequences

### 6.1 Positive

- No new dependency during the freeze. The migration plan stays at the dependency footprint agreed in ADR-011 §2.4 (Apache 2.0 / MIT / BSD).
- The graph is preserved as the *unique* feature of "relationship-first AI."
- 384d Xenova local embedding pipeline stays intact. Privacy and cost advantages are not given up.
- Every memory write is auditable in source code.
- No third-store addition. Migration cutover is PB + LadybugDB only, not PB + LadybugDB + libSQL.
- The "~500 LOC deletable" claim from ADR-011 §2.3 was overstated on closer reading of the Mastra docs. The realistic deletion was ~300 LOC of message-history glue; the rest (vector extraction, graph queries, structured facts) is not duplicated by Mastra. By declining OM, we do not promise a deletion that was not there.

### 6.2 Negative

- We do not get auto-compression of message history. Sessions over 30k tokens will be slow. Mitigation: in `docs/architecture/memory-system.md`, document the expected session-length budget and flag context rot as a known risk.
- We do not get the "agent never pauses" async buffering. Agent tool calls block during `saveSemanticMemory` and `extractAndSaveMemory`. Mitigation: 384d local embeddings are fast (< 50 ms per call), LLM extraction is the slow part (~1–3 s), and we already do this in the background via the cron in Path C.
- Working memory is implicit, not template-based. The custom `userProfile` and `pageSettings` tables serve this role. Mitigation: document the working-memory-like fields in `docs/architecture/memory-system.md` so future work knows where to look.
- All memory maintenance is on us. No upstream fixes, no upstream improvements. Trade-off accepted per §4.5.

## 7. Verification & Grounding

- **ADR-011 update**: the OM carve-out in §2.3 is removed (replaced with a rescission note pointing here). The "deletion of custom pipeline" rationale in §3.1 is updated. Cross-references in §5 and §6 are updated.
- **Migration plan update**: `docs/MIGRATION_POCKETBASE.md` Phase 2 step "Adopt Mastra 1.0 OM" is replaced with the refinement roadmap in §3 of this ADR.
- **Phase 2 Stream A complete** (commits `4fdb9c9`, `4ed7f3d`, `e534f01`; `docs/migration/phase-2-adapter.md` rev 2). Items 1, 2, 3 of the §3 roadmap are shipped. Items 4, 5, 6 remain (Phase 4+, doc).
- **Test count progression**: 24 (pre-Phase-2) → 34 (after 1.1) → 44 (after 1.2) → 50 (after 1.3). 0 failures. `npx tsc --noEmit` clean throughout.
- **Three Cypher gotchas surfaced and documented**: `CAST($emb AS FLOAT[384])` for `array_cosine_similarity`, `null`→`[]` normalisation for `collect(...)` over `OPTIONAL MATCH` misses, and `MATCH (n) DETACH DELETE n` for `beforeEach` test isolation. See `phase-2-adapter.md` §9.
- **ESLint nuance**: Stream A introduced 4 new `@typescript-eslint/no-explicit-any` errors on `as any` casts used to satisfy LadybugDB's recursive `LbugValue` param type. `health.ts` carries `// eslint-disable-next-line` comments matching the project convention; `edges.ts` and `traversal.ts` (which predate this commit) are unchanged. Tracked in the post-freeze ESLint pass per ADR-011 §6.
- **Architecture doc**: `docs/architecture/memory-system.md` is created per refinement item 6. (Pending — Stream C.4.)
- **README notice**: the "Current Operating Mode" line in `README.md` is unchanged (the freeze is still in effect); this ADR is the next decision layer down.

## 8. Related Documents

- `docs/decisions/010-dynamic-agent-memory-architecture-and-gemini-embedding-migration.md` — Xenova 384d embedding pipeline; the dimensional contract this decision inherits.
- `docs/decisions/011-feature-freeze-during-pb-migration.md` — Feature freeze; this ADR is the explicit override of its §2.3 carve-out.
- `docs/migration/phase-1-graph-decision.md` — 4 keep / 6 delete edges in the LadybugDB graph; the graph this decision protects.
- `docs/MIGRATION_POCKETBASE.md` — 9-phase plan; Phase 2 will be updated to reflect this decision.
- `docs/architecture/memory-system.md` (to be created) — single end-to-end doc of the custom memory system.
