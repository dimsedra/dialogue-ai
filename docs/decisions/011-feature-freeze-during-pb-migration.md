# ADR-011: Feature Freeze During the PocketBase Migration

- **Status**: Accepted
- **Date**: 2026-06-07
- **Authors**: User & opencode
- **Domain**: Contribution policy, migration governance, scope control

---

## 1. Context & Problem Statement

Dialogue is migrating from Convex + Vercel to a Tauri-packaged stack (PocketBase + Node + LadybugDB) to ship a single-binary desktop app. The plan in `docs/MIGRATION_POCKETBASE.md` is 9 phases, 6-10 weeks of one senior engineer full-time. Phase 5 alone (`usePaginatedQuery` SSE parity) and Phase 6 (the 36+ cross-function orchestration chain in `convex/background_jobs.ts`) are the highest-risk items; the latter is why the rough estimate leans toward the longer end of the window.

This is a structural rewrite, not a feature release. Each phase is a swap-and-verify cycle where the app must remain in a working state. Any new feature landing in parallel:

- Adds backend surface (Convex tables, functions, Mastra tools) that becomes migration debt the moment PocketBase cutover begins.
- Creates client UI surfaces that need to be re-ported to the PB-backed adapter layer (`src/pb-compat/`).
- Risks pulling in dependencies — especially from the broad Mastra 1.0 surface (processors, workflows, editor, MCP, workspace, browser, structured output, RAG) — whose migration path is not yet defined.
- Multiplies the QA matrix: each new feature must be tested against both backends (Convex = current, PocketBase = target) during dark launch, not just the adapter layer that connects them.

Without a contribution policy, the natural drift is "fix the migration bug AND add the new screen" — which historically has been how structural rewrites double in scope and miss their window.

## 2. Decision

Adopt a **uniform bug-fixes-only freeze** for the 6-10 week migration window. The freeze covers Phases 0-9 of `docs/MIGRATION_POCKETBASE.md`. **No Mastra 1.0 features are carved out.** In particular, the Mastra memory system (message history, working memory, semantic recall, observational memory) is explicitly declined by ADR-012, which rescinds the OM carve-out that an earlier draft of this ADR proposed. The custom memory system is retained and refined per ADR-012 §3.

### 2.1 Allowed

- **Critical bug fixes**: data loss, crash, broken happy path. Example: the 768d/384d dimensional mismatch class of bug that ADR-010 closed.
- **Security patches**: CVE fixes, dependency updates for known vulnerabilities, secret-handling fixes.
- **Migration work**: the phases defined in `docs/MIGRATION_POCKETBASE.md` (§5).
- **Migration-debt-reducing refactors**: changes that *remove* code the migration would otherwise have to port, and do not add new product surface. Examples:
  - Replacing `as any` casts with proper Convex `Id<"...">` types (a tax-fix pass is in flight; the rest of the remaining casts are scoped to migration-affected files).
  - Consolidating the three ad-hoc `new Mastra({...})` constructions in `src/mastra/index.ts:4`, `src/app/api/chat/route.ts:87`, and `src/app/api/cron/ocean/route.ts:38` into a single shared instance — needed for the Mastra server migration anyway.
  - Deleting the aspirational graph-edge schema (`BLOCKED_BY`, `MENTIONS_TASK`, etc.) if the Phase 1 decision (§3.5 of the migration plan) is to delete rather than populate.
  - Replacing the bespoke `searchWebTool` in `otherTools.ts` with Mastra's `AgentBrowser`/`Stagehand` integration.
- **Documentation, planning, ADR writing.**
- **Infrastructure stability**: Convex deploys, Vercel, observability, dependency upgrades that are strictly non-breaking.

### 2.2 Blocked

- **New user-facing features**: new screens, new commands, new tool types, new agent capabilities.
- **New Convex tables or functions** beyond what the migration requires.
- **New Mastra tools wrapping Convex state.**
- **New client UI surfaces requiring backend support.**
- **New agent personality, voice, or behavior changes** — these are product decisions, not refactors.

The judgment call on "is this a refactor that reduces debt, or a feature disguised as a refactor?" is made case by case against this section. When in doubt, the answer is "no."

### 2.3 ~~Carve-out: Mastra 1.0 Observational Memory (Phase 2)~~ — Rescinded by ADR-012

**This section is superseded.** The OM carve-out was rescinded on the same day it was accepted, after a re-read of the seven Mastra memory docs revealed that the "~500 LOC deletable" rationale was overstated and that the custom memory system is more sophisticated for our use case than Mastra's flat observation log.

Mastra 1.0 memory components (message history, working memory, semantic recall, observational memory) are **not adopted** during the migration freeze. The custom memory system — `saveSemanticMemory` tool + `retrieveGraphContext` tool + LadybugDB vector+graph + 384d Xenova local embeddings + 0.85 cosine dedup — is retained and refined per the roadmap in ADR-012 §3.

No other Mastra 1.0 features are carved out. The following all wait until post-migration unless explicitly added by a future ADR: processors, guardrails, agent approval, structured output, workflows, editor, MCP, workspace, browser, Mastra server, RAG.

### 2.4 Licensing policy (related)

Until a commercial decision is made for Dialogue, the dependency tree defaults to **Apache 2.0 / MIT / BSD only**. GPL3 and AGPL are off-limits. This rules out OpenHuman, Neocortex, and any AGPL-licensed dependency. Honcho remains an architectural reference only (not deployed as a sidecar — would break the single-binary install target by adding Docker/Postgres/Redis). Phase 0 includes a license audit to confirm no GPL3/AGPL transitive dependencies ship in the Tauri distribution.

## 3. Rationale & Consequences

### 3.1 Rationale

- **Migration surface stays minimal.** The diff between the "Convex" and "PB-backed" branches is dominated by the adapter layer, not by feature drift. Each phase lands as a clean swap, not a port of accumulated work.
- **QA matrix stays bounded.** During dark launch (Phase 9), the matrix is `1 feature set × 2 backends`, not `1 + n × 2` where `n` is the number of new features accepted during the freeze.
- **Cutover can land in one direction.** Convex → PocketBase happens once, cleanly, without a feature freeze having to revert half-built work.
- **The Mastra 1.0 OM carve-out was rescinded by ADR-012.** It is not a feature, not a deletion — it is a non-adoption. The custom memory system is retained, not replaced. The "~500 LOC deletable" claim was overstated on closer reading of the Mastra docs.

### 3.2 Consequences

Positive:
- Predictable migration timeline. The 6-10 week estimate stays credible.
- Forced discipline on scope: "should this wait for after cutover?" is the default question, not "should this ship before cutover?"
- Existing user trust is preserved: no half-built features shipped, no new bugs introduced by parallel work.

Negative:
- Users who have requested features wait 6-10 weeks. This must be communicated in `README.md` and `CHANGELOG` so it is not a surprise.
- A bug-fixes-only freeze is socially harder to enforce than a code freeze (no `main` branch lock). Judgment calls on refactor-vs-feature must be made case by case, and that judgment is fallible.
- Several quick wins from the Mastra 1.0 surface — processors for prompt-injection detection, structured output for tool-call parsing, agent approval for the consent gate that today is enforced through tool description strings — must wait, even though their adoption surface is small.
- A "no" on new features during a public-facing period can read as project stagnation if not communicated clearly. The README notice and the explicit ADR are the load-bearing communication.

## 4. Verification & Grounding

- **README notice**: `README.md` carries a visible "Current Operating Mode" line near the top, pointing at this ADR. Contributors see the freeze state before opening a PR.
- **Migration plan cross-reference**: `docs/MIGRATION_POCKETBASE.md` §5 (Phases) cites this ADR as the governing policy for contribution scope. Phase 2 no longer adopts Mastra 1.0 OM; see ADR-012 for the refinement roadmap.
- **Phase 0 license audit**: a `docs/migration/phase-0-license-audit.md` is produced (or appended to) listing every transitive dependency that ends up in the Tauri distribution, with a license column. Any GPL3/AGPL finding is a blocker for that phase.
- **No enforcement mechanism in code.** The freeze is policy, not a CI guard. PRs that violate it are reverted manually with reference to this ADR. The migration lead is the decision-maker on borderline cases.

## 5. Reversal

The freeze ends when Phase 9 (cutover) of `docs/MIGRATION_POCKETBASE.md` is complete and PocketBase is the only `NEXT_PUBLIC_BACKEND` value shipped to users. A new ADR (013 or later — note: ADR-012 was used for the custom memory system decision) is required to lift the freeze and describe which deferred Mastra 1.0 features and which queued user requests will be picked up first.

## 6. Related Documents

- `docs/MIGRATION_POCKETBASE.md` — the 9-phase plan that this freeze governs.
- `docs/decisions/010-dynamic-agent-memory-architecture-and-gemini-embedding-migration.md` — Xenova 384d embedding pipeline; precedent for migration-era ADRs and the dimensional contract the custom memory system inherits.
- `docs/decisions/012-custom-memory-system-over-mastra-memory.md` — Custom memory system over Mastra memory; the explicit override of the OM carve-out in §2.3.
- `README.md` — carries the visible "Current Operating Mode" notice that points here.
- `AGENTS.md` — repo-level guidelines; should reference this ADR in its "End goal" section.
