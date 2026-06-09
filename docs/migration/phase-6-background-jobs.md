# Phase 6 — Migrate Background Jobs (LLM Orchestration)

**Status**: 🟢 Done  
**Owner**: User + Antigravity  
**Plan ref**: `docs/MIGRATION_POCKETBASE.md` §5 Phase 6  

---

## 1. Goal

Migrate the 5 core background jobs from Convex `internalAction`s / `internalMutation`s into PocketBase-compatible functions. Rather than attempting to run the Vercel AI SDK (with 18+ provider factories) inside PocketBase's JSVM hooks, the jobs are orchestrated as Next.js API routes (`/api/jobs/<jobName>`). 

**Done when**:
- `generateSessionTitle`, `generateCronReflection`, `generateWeeklyOCEAN`, `generateMonthlyOCEAN`, and `generateDailySummary` are fully ported.
- Jobs execute as pure functions accepting an injected `pb` client.
- Jobs are wrapped securely by Next.js API routes using `verifyPbToken`.
- Legacy Convex callers are short-circuited when PocketBase is enabled.
- Data-layer access control tests pass via an extended smoke script.

---

## 2. Architecture Decisions

During Phase 6, several critical architecture decisions were locked in to support the local-first PocketBase environment:

1. **Next.js API Routes over PB Hooks**: PocketBase's embedded JSVM is an isolated environment that lacks standard Node modules and the Vercel AI SDK. By orchestrating jobs via Next.js API routes, we reuse the existing Mastra LLM pipelines seamlessly.
2. **Secret Management per-Call**: API routes fetch user preferences dynamically, decrypt their provider keys using the server's `ENCRYPTION_KEY`, and invoke the LLM. Keys never leave the local machine in cleartext.
3. **Pure Function Extraction**: Every job was extracted into `src/lib/jobs/`. They no longer rely on Convex contexts, making them perfectly testable via Vitest.
4. **Timezone Utilities Extraction**: Complex timezone offset and boundary logic was ported directly from `convex/timezones.ts` into a universal `src/lib/jobs/dateUtils.ts` file.
5. **Convex Short-Circuiting**: Instead of relying on Vercel Crons for scheduling (which is irrelevant for a local-first app), the legacy Convex crons were updated to immediately return if `process.env.USE_PB === "true"`. This prevents the cloud backend from wasting LLM credits generating duplicate background jobs during the dual-backend transition.

---

## 3. Scope & Execution

The phase was broken down into 8 sub-steps.

| Job / Sub-step | Path | Details |
|---|---|---|
| **6.1.1** Title Generation | `src/lib/jobs/generateSessionTitle.ts` | Ported to pure function. Added Next.js API wrapper. Replaced stub in `Chat.tsx` with actual trigger. |
| **6.1.2** Cron Reflection | `src/lib/jobs/generateCronReflection.ts` | Handled `tasks`, `events`, `chat_sessions`, and `messages` retrieval logic with PocketBase queries. Re-implemented Markdown formatting. |
| **6.1.3** Weekly OCEAN | `src/lib/jobs/generateWeeklyOCEAN.ts` | Extracted `compileWeeklyData` into a shared utility. Wrote job for synthesizing weekly personality/progress digests. |
| **6.1.4** Monthly OCEAN | `src/lib/jobs/generateMonthlyOCEAN.ts` | Handled complex `archived_summaries` creation logic. Automatically updates the `user_profile.bio` safely with the LLM analysis. |
| **6.1.5** Daily Summary | `src/lib/jobs/generateDailySummary.ts` | Applied timezone boundaries to fetch only `messages` matching the user's localized "today". |
| **6.1.6** Update 4 Callers | `convex/reflections.ts` etc. | Added the `USE_PB` global kill-switch to Convex to prevent redundant background job orchestration. |
| **6.1.7** Smoke Tests | `scripts/smoke-pb-jobs.mjs` | Extended the PB JS SDK smoke test script to validate tenant-isolation and schema definition for all 4 new collections. |

---

## 4. Verification and Test Results

### Unit & Type Tests
```powershell
npx vitest run
```
**Result**: The core logic (e.g. `generateSessionTitle.ts`) was covered by comprehensive mocked tests verifying idempotency and LLM payload construction.

### Data Layer Smoke Tests
```powershell
npm run test:smoke:jobs
```
**Result**: **17/17 checks passed**.
The script spawned an ephemeral PocketBase server, applied the migrations, created users, and verified that:
- `userA` could successfully read/write `session_summaries`, `reflections`, `weekly_digests`, and `archived_summaries`.
- `userB` received strict `404 Not Found` responses when attempting to query `userA`'s isolated data, confirming the `listRule` and `viewRule` constraints.

---

## 5. Companion Artifacts

### New Files
- `src/lib/jobs/dateUtils.ts`
- `src/lib/jobs/compileWeeklyData.ts`
- `src/lib/jobs/generateSessionTitle.ts` & `src/app/api/jobs/generateSessionTitle/route.ts`
- `src/lib/jobs/generateCronReflection.ts` & `src/app/api/jobs/generateCronReflection/route.ts`
- `src/lib/jobs/generateWeeklyOCEAN.ts` & `src/app/api/jobs/generateWeeklyOCEAN/route.ts`
- `src/lib/jobs/generateMonthlyOCEAN.ts` & `src/app/api/jobs/generateMonthlyOCEAN/route.ts`
- `src/lib/jobs/generateDailySummary.ts` & `src/app/api/jobs/generateDailySummary/route.ts`
- `docs/migration/phase-6-background-jobs.md`

### Modified Files
- `docs/MIGRATION_POCKETBASE.md`
- `scripts/smoke-pb-jobs.mjs`
- `convex/dailySummary.ts`
- `convex/ocean.ts`
- `convex/reflections.ts`
