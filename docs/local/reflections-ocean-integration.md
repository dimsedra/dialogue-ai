# Reflections + OCEAN: Shared Collection, Divergent Processing

## Motivation

Two weekly consumers need data from the same source (days 1-7):

- **OCEAN** — agent-internal behavioral analysis (bidirectional trait scoring, never shown to user)
- **Reflections** — user-facing motivational recap (Spotify Wrapped style, sent as chat message)

They should share the data collection but diverge at the LLM call. One query, two prompts, two outputs.

---

## Architecture

```
Days 1-7 data (query: compileWeeklyData)
  ├── Tasks created/completed/deleted + notes
  ├── Events created/scheduled/cancelled + outcomes
  ├── Habits logged/completed/skipped + notes
  └── Daily session summaries (7 × 2-line OCEAN-informed summaries)
        │
        ▼
  One shared data payload
        │
        ├──────────────────────────────────┐
        ▼                                  ▼
  OCEAN prompt                        Reflections prompt
  (agent-facing)                      (user-facing)
        │                                  │
        ▼                                  ▼
  Weekly OCEAN digest                  Reflection narrative
  (weeklyDigests table)                (reflections table + AI message)
```

---

## Divergent LLM Prompts

### OCEAN Prompt (Agent-Facing)

Goal: produce bidirectional OCEAN trait scores for the agent's internal context.

Input: shared data payload + previous month's OCEAN digest (for baseline comparison)

Processing:
1. **Retrograde** (day 7 → 1): attribute *why* behavior happened — is the end-of-week dip explained by earlier events?
2. **Anterograde** (day 1 → 7): detect trajectory — is Conscientiousness rising, falling, stable?
3. **Score**: OCEAN percentile bands with evidence bullets per trait

Output structure:
```
Week of May 22, 2026 — OCEAN Digest:
- Openness: High-Average (70-75th) — tried new recipe, researched auth library
- Conscientiousness: Low-Average (35th) — missed 2 runs, deferred 3 tasks
  - Retrograde: Wednesday's late work session explains Thursday-Friday drop
  - Anterograde: trajectory is declining — likely situational (project crunch)
- Extraversion: ...
- Agreeableness: ...
- Neuroticism: High (80th) — stress elevated, 3 mentions of overwhelm
```

Stored in `weeklyDigests` table. Never shown to user.

### Reflections Prompt (User-Facing)

Goal: produce a motivational, celebratory recap sent as a chat message.

Input: shared data payload with stats (counts, rates, streaks)

Processing: `compileReflectionStats` computes:
- Tasks completed / created
- Events attended
- Habit completion rates and streaks
- Top categories
- Consecutive activity streak days

Output: Gemini narrative with emojis, bullet points, motivational language, concluding question.

Stored in `reflections` table + sent as AI message in the user's chat session.

---

## Cron Schedule

| Cron | Time | Action |
|---|---|---|
| Daily | 23:59 | Generate daily session summary from user messages + collect structured data |
| Monday (weekly) | 00:05 | 1. Query days 1-7 data (shared collection) |
| | | 2. Run OCEAN prompt → save to `weeklyDigests` |
| | | 3. Run Reflections prompt → save to `reflections` + send as AI message |
| | | 4. Delete `sessionSummaries` older than 7 days |
| Monthly (1st) | 00:05 | 1. Read 4 weekly digests → refine behavioral profile |
| | | 2. Archive 4 weekly digests to `archivedSummaries` |

The OCEAN and Reflections prompts run sequentially in the same Monday cron. No separate cron for Reflections — it's absorbed into the weekly OCEAN cron.

---

## Schema

### New Tables (OCEAN)

```typescript
// sessionSummaries — 2-line daily summary, deleted after weekly compile
sessionSummaries: defineTable({
  userId: v.id("users"),
  date: v.string(),         // "2026-05-22"
  summary: v.string(),      // 2-line OCEAN-informed summary
  createdAt: v.number(),
}).index("by_user_date", ["userId", "date"]);

// weeklyDigests — OCEAN trait scores, archived after monthly compile
weeklyDigests: defineTable({
  userId: v.id("users"),
  weekStart: v.number(),    // epoch ms
  weekLabel: v.string(),    // "Week of May 22, 2026"
  digest: v.string(),       // full OCEAN analysis text
  createdAt: v.number(),
}).index("by_user_week", ["userId", "weekStart"]);

// archivedSummaries — weekly/monthly digests moved out of active rotation
archivedSummaries: defineTable({
  userId: v.id("users"),
  type: v.union(v.literal("weekly"), v.literal("monthly")),
  originalDate: v.number(), // when it was the active digest
  content: v.string(),
  archivedAt: v.number(),
}).index("by_user_type_date", ["userId", "type", "originalDate"]);
```

### Existing Tables (Reflections — unchanged)

```typescript
// reflections — user-facing celebration narratives (no schema changes needed)
reflections: defineTable({
  userId: v.id("users"),
  workspaceId: v.optional(v.id("workspaces")),
  type: v.union(v.literal("weekly"), v.literal("monthly"), v.literal("yearly")),
  periodStart: v.number(),
  periodEnd: v.number(),
  periodLabel: v.string(),
  summary: v.string(),          // Gemini narrative
  stats: v.object({             // compileReflectionStats output
    tasksCompleted: v.number(),
    tasksCreated: v.number(),
    eventsAttended: v.number(),
    topCategories: v.optional(v.array(v.string())),
    streakDays: v.optional(v.number()),
    habitLogsCompleted: v.optional(v.number()),
    habitLogsSkipped: v.optional(v.number()),
    habitStreakDays: v.optional(v.number()),
  }),
  userReflection: v.optional(v.string()),
}).index("by_user_type", ["userId", "type"])
 .index("by_user_period", ["userId", "periodStart"]);
```

---

## Files to Change

| File | Change |
|---|---|
| `convex/schema.ts` | Add `sessionSummaries`, `weeklyDigests`, `archivedSummaries` tables |
| `convex/notes.ts` | Add daily 23:59 cron, weekly OCEAN cron (shared collection → divergent LLM calls), archive/deletion logic |
| `convex/ai_action.ts` | Add OCEAN prompt handler, modify `generateCronReflection` to use shared data (or remove in favor of unified cron) |
| `convex/ai.ts` | `getPromptContext` — inject weekly + monthly OCEAN digests instead of raw summaries |
| `convex/crons.ts` | Replace pyramid crons with daily 23:59 + Monday weekly + monthly |
| `convex/reflections.ts` | `compileReflectionStats` — extend if needed to also return daily session summaries for the OCEAN path |
| `src/components/Chat.tsx` | Update `getPromptContext` usage to inject OCEAN digests |

---

## Migration from Current System

1. Deploy schema with new tables (`sessionSummaries`, `weeklyDigests`, `archivedSummaries`)
2. Implement daily 23:59 cron (generate session summary from user messages)
3. Implement Monday weekly cron (shared query → OCEAN + Reflections prompts)
4. Remove old pyramid crons and `notes_action.ts`
5. Update prompt injection in both `ai_action.ts` (chat action) and `getPromptContext` (local LLM path)
