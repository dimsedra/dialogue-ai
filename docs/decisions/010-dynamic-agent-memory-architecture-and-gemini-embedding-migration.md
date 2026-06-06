# ADR-010: Local-First Embeddings (Xenova) & Unified 384-Dimension Memory Pipeline

- **Status**: Accepted (Supersedes the Gemini embedding portion of the previous version of this ADR)
- **Date**: 2026-06-07
- **Authors**: User & opencode
- **Domain**: Vector Search, Semantic Memory Retention, Embedding Pipeline Unification, Server/Client Integration

---

## 1. Context & Problem Statement

By mid-2026, Dialogue's embedding pipeline had three critical correctness and operability problems:

1. **Dimensionality Mismatch (silent bug)**: Convex's `memories.vectorIndex("by_embedding", ...)` was declared with `dimensions: 384`, but the Convex actions still called `gemini-embedding-001` at `outputDimensionality: 768`. Every `vectorSearch` deduplication check was therefore querying a 768d vector against a 384d-indexed collection — returning either nothing or garbage. The Mastra tool path (Path A) and the action path (Path B) were both silently broken, though in different ways.
2. **Three Write Paths, Two Pipelines**: The codebase had two parallel embedding sources (Gemini API for Convex actions, local Xenova for the Mastra tool). Each required its own API key, rate-limit budget, and offline behavior. Path A and the extractor (Path C) used different mechanisms for the same job.
3. **Cloud API Failure Modes**: The Gemini embedding endpoint had previously been deprecated (`text-embedding-004`), and any cloud-only path reintroduced that risk. The hard constraint was that the app must remain installable and runnable for non-technical users without API keys, including offline.

How do we unify the entire memory write pipeline on a single local 384d embedding model, eliminate the dimensional mismatch, and keep the system zero-dependency, offline-capable, and accessible?

---

## 2. Decision

We adopted **Xenova/multilingual-e5-small** as the single source of embeddings for every write path, served by a Next.js API route so Convex actions can fetch it server-to-server, and we added dimension guards to every write surface.

### 2.1. Local 384-Dimensional Embeddings (Xenova/multilingual-e5-small)

- **Model**: `Xenova/multilingual-e5-small` from the `@huggingface/transformers` (Transformers.js) library.
- **Output**: 384d float vector, already L2-normalized by the model — no client-side normalization needed.
- **Runtime**: Node.js (the `@huggingface/transformers` package works in both browser and Node; the app currently invokes it server-side via the API route and server actions, never the browser, to keep the bundle small for non-technical users).
- **Module**: `src/lib/graph/embedding.ts` exports `getLocalEmbedding(text: string): Promise<number[]>`.

This replaced the previous `getEmbedding()` helper in `convex/background_jobs.ts`, which used `GoogleGenerativeAI.embedContent(...)` with `outputDimensionality: 768`.

### 2.2. New `/api/embeddings` Route (Convex ↔ Next.js Bridge)

- **Route**: `src/app/api/embeddings/route.ts` (POST, accepts `{ text: string }`, returns `{ embedding: number[] }`).
- **Convex-side fetcher**: `fetchEmbeddingFromApp(text: string): Promise<number[]>` in `convex/background_jobs.ts` calls the route using `process.env.APP_URL`. The Convex dashboard must have `APP_URL` set to the deployed Next.js origin (e.g. `https://dialogue.example.com`); locally this is `http://localhost:3000`.
- **Why a route and not a direct import?**: Convex's Node runtime cannot bundle `@huggingface/transformers` (WASM, dynamic imports, file system access to the model cache). Fetching from the Next.js process keeps the heavy model loaded in a single Node process that already exists.
- **Single source of truth**: The model is now loaded by the Next.js process exactly once. Every other path — Mastra, Convex actions, settings UI — calls into that single loader.

### 2.3. Unifying All Three Write Paths

Three write paths existed; all now use 384d and write to both Convex and LadybugDB.

| Path | Trigger | Old embedding | New embedding | Graph mirror |
|------|---------|---------------|---------------|--------------|
| A — Mastra tool `saveSemanticMemory` | LLM tool call (Gemini/GPT/Anthropic/...) | 384d local (Xenova) | unchanged | unchanged (already dual) |
| B — Convex action `saveSemanticMemoryAction` | `useAction` in client | 768d Gemini | **384d, caller-provided** (action now requires `embedding: v.array(v.number())`) | **added** via `writeMemoryToGraph` |
| C — `extractAndSaveMemory` (internal action) | Auto-fires after user message | 768d Gemini | **384d via `fetchEmbeddingFromApp`** | **added** via `writeMemoryToGraph` |

`saveSemanticMemoryInternal(ctx, text, embedding, options)` is now the single internal helper. It performs the Convex write, the hash-based dedup, and the LadybugDB mirror write. Graph write failures are caught and logged but not fatal — the Convex write is the source of truth.

### 2.4. Dimension Guards

To prevent future regressions:

- `EXPECTED_EMBEDDING_DIM = 384` constant exported from `convex/background_jobs.ts`.
- Runtime length check in `convex/ai.ts:saveMemory` and `convex/ai.ts:saveMemoryBackendSync` rejects any embedding whose length is not exactly 384.
- `convex/memory.test.ts` updated to use `Array(384)` and includes explicit "rejects wrong-dim" tests for both 768d and 256d inputs.

### 2.5. LadybugDB Idempotency

The graph mirror uses **MERGE**, not CREATE, so re-runs of the hash-update path do not throw on duplicate IDs. Convex `_id` is reused as the LadybugDB `id` for stable graph references.

---

## 3. Rationale & Consequences

### 3.1. Rationale

- **Correctness**: 384d query against 384d index is the only configuration that actually uses the `vectorSearch` index. The previous setup was a silent bug.
- **Accessibility**: Zero API keys, no rate limits, no deprecation risk, works offline. Critical for the non-technical user base.
- **Operational simplicity**: One model, one loader, one place to upgrade. No more dual-normalization, dual-dimension, or dual-key-rotation ceremonies.
- **Performance**: The Xenova model is small (~120MB on disk, loaded once) and runs in pure WASM; on a modern CPU an embedding takes single-digit ms after first load.

### 3.2. Consequences

- **Positive**: The dimensional mismatch bug is eliminated. Deduplication via `vectorSearch` now functions as designed (cosine-similarity threshold `0.85`).
- **Positive**: Graph context retrieval (`retrieveGraphContext` in Mastra) and Convex vector search return consistent, comparable results.
- **Positive**: No third-party API dependency for embeddings.
- **Trade-off**: First-message embedding has a one-time model-load latency (~1-2s on cold start, then sub-50ms per query). Acceptable because the model is loaded once at process start and cached.
- **Trade-off**: `APP_URL` env var must be set in both `.env.local` (for dev) and the Convex dashboard (for prod). The Convex Node runtime does not read Next.js env vars.

---

## 4. Verification & Grounding

- **Dimension assertions**: `convex/memory.test.ts` now explicitly tests that 768d, 256d, and 384d inputs behave correctly against the `saveMemory` and `saveMemoryBackendSync` mutations.
- **Hash dedup**: The existing `by_hash` index dedup logic in `saveMemory` and `saveSemanticMemoryInternal` is preserved; updated tests cover the hash-update path.
- **Routes**: `/api/embeddings` and `/api/graph/memory` are thin Next.js route handlers; both can be unit-tested via the standard Next.js test harness.
- **Build**: `npm run build` succeeds; `npm test` covers the dimension assertions and dedup invariants.
- **Manual**: After deployment, verify (a) Mastra path A writes to both stores, (b) Convex action path B writes to both stores with caller-provided 384d, (c) extractor path C fetches via `/api/embeddings` and writes to both stores, (d) dedup triggers on identical second write, (e) wrong-dim writes are rejected with a clear error message.

---

## 5. Related Documents

- `docs/future-impl/transformers_js_embedding.md` — original proposal; now reality, kept for historical context.
- `src/lib/graph/embedding.ts` — Xenova loader and `getLocalEmbedding` helper.
- `src/app/api/embeddings/route.ts` — Next.js embedding endpoint.
- `src/app/api/graph/memory/route.ts` — Next.js LadybugDB write endpoint (used by `writeMemoryToGraph`).
- `convex/background_jobs.ts` — Path B + C, `EXPECTED_EMBEDDING_DIM`, `fetchEmbeddingFromApp`, `writeMemoryToGraph`.
- `convex/ai.ts` — `saveMemory` and `saveMemoryBackendSync` with dimension guards.
- `convex/schema.ts` — `vectorIndex("by_embedding", { dimensions: 384 })`.
