# Smart Cards Roadmap

A forward-looking document for the proactive smart-card system. Captures the current state, the gap between current and ideal, and a 5-tier enhancement plan to make cards more proactive and the UX more delightful.

This doc is the source of truth for what we intend to build. The "Implementation Status" section in `proactive-dashboard-architecture.md` tracks the original spec; this doc tracks the **next** wave of improvements.

---

## 1. Current Implementation Snapshot

The "smart card" is a single computed view stored in the `cardState` table. The dashboard calls `getProactiveState` and renders exactly **one** of six states in a strict first-match-wins cascade. The old `standard_snapshot` has been replaced by `all_caught_up` as the system resting state.

| Card Type | Trigger | Window | What it shows | What it can do |
|---|---|---|---|---|
| `attention_needed` | 4-tier priority: overdue task → unchecked habit → pending reflection → oldest task | always | Context-dependent (see sub-types below) | CTA per sub-type + CardMenu |
| `reflection_ready` | Recent weekly/monthly/yearly reflection with no `userReflection` | always | "Your [period] wrap is ready." | Opens fullscreen modal + CardMenu |
| `task_triage` | ≥1 overdue task | always | "[count] overdue. Want to triage them?" | Opens task panel + CardMenu |
| `habit_check` | Unlogged habit (highest streak first) | 1h debounce | "[Habit] — [streak]-day streak. Did you log it today?" | Log completed / Skip today + CardMenu |
| `morning_brief` | 6-11h local | 4h debounce | "[count] tasks, [count] events today. [focus candidate]." | View agenda + CardMenu |
| `all_caught_up` | Fallback (everything suppressed or nothing to show) | always | "All caught up. Take a breather." | Nothing (system resting state, unmuteable) |

**`attention_needed` sub-types:**

| Priority | Trigger | Body | CTA |
|---|---|---|---|
| `overdue_task` | Task past due date (oldest first) | "[title] is past due. N day(s) late." | "Resolve" → opens task panel |
| `unchecked_habit` | Active habit not logged today (highest streak first) | "You haven't logged [habit] today. Streak at N." | "Log Completed" / "Skip Today" |
| `pending_reflection` | Reflection available but no journal saved | "Your [period] wrap is ready." | "Reflect" → opens modal |
| `oldest_task` | Oldest open task (no due date required) | "[title] has been open for N day(s). Worth a look?" | "Open Task" → opens task panel |

### Hardwired facts (the present, not the ideal)

- One card visible at a time — no stack, no queue
- Dashboard-only surface (no chat injection, no push, no email)
- `cardState` table persists dismiss/snooze/mute/debounce per user per card type per cardId
- `lastShownAt` debounce: habit_check 1h, all others 4h
- Time-bucketed cards (habit_check, morning_brief) dismiss expires end-of-day; non-time-bucketed dismiss is permanent per-cardId
- Snooze durations: 1h, until today 22:00 local, until tomorrow 08:00 local
- `attention_needed` per-cardId dismissal (not time-bucketed)
- `all_caught_up` is unmuteable — always returned as final fallback
- CardMenu (3-dot dropdown): Snooze / Mute type / Dismiss (when applicable)
- AnimatePresence + Framer Motion `layoutId` for smooth card-type transitions
- Habit check uses batched query (no N+1)
- 12-17h has **zero** proactive coverage (the spec's "Contextual Helper / Event Prep" state is not implemented)
- 20-22h evening window is only used for habit_check — no end-of-day recap
- Morning brief copy is hardcoded — no LLM involvement in card text
- `task_triage` carries only a count, not a list — clicking dumps you into the full task panel
- No card history, no engagement metrics, no per-type user preferences
- Cross-surface (push, chat, email) deferred to T5

### Source files
- Backend: `convex/dashboard.ts` (5 mutations + `getProactiveState` query + `buildAttentionNeededState` helper)
- Backend: `convex/schema.ts` (`cardState` table with 3 indexes)
- Frontend: `src/components/chat/Dashboard.tsx` (card renderers with AnimatePresence)
- Frontend: `src/components/chat/CardMenu.tsx` (3-dot dropdown menu)
- Adjacent: `src/components/chat/ReflectionWrappedModal.tsx`, `src/utils/exportReflectionImage.ts`, `src/app/share/reflection/[id]/page.tsx`

---

## 2. Architectural Gaps

The original spec listed 8 unimplemented items (now shipped via the reflection pipeline refactor). The next wave of gaps is what this doc addresses. Items marked **[RESOLVED]** are now implemented.

| # | Gap | Severity | Status |
|---|---|---|---|
| 1 | No card state persistence (acknowledged/snoozed/dismissed/muted) — every mount recomputes | Critical | **[RESOLVED]** — `cardState` table with 3 indexes |
| 2 | `reflection_ready` is unkillable without saving the journal | Critical | **[RESOLVED]** — per-cardId dismiss + CardMenu |
| 3 | No `lastShown` debounce — habit_check re-fires on every dashboard open | High | **[RESOLVED]** — `markCardShown` mutation, 1h/4h debounce |
| 4 | 12-17h has zero proactive coverage (event prep state not built) | High | Open — T3 |
| 5 | 20-22h evening window is only habit_check — no end-of-day recap | High | Open — T3 |
| 6 | Morning brief has no "Schedule Focus Block" action (only "View Agenda") | Medium | Open — T3 |
| 7 | `task_triage` has no "Roll Over" action (only "Triage List") | Medium | Open — T3 |
| 8 | Habit check is N+1: one `.unique()` per habit | Medium | **[RESOLVED]** — batched query via `by_user` index |
| 9 | No card-type transition animation (DOM swap is jarring) | Medium | **[RESOLVED]** — AnimatePresence + layoutId |
| 10 | No multi-card support (always 0 or 1) | Low | Open — T4 |
| 11 | No per-card-type user preferences | Low | Open — T4 |
| 12 | No card history / "what did the agent tell me yesterday" | Low | Open — T5 |
| 13 | No "Why am I seeing this?" transparency affordance | Low | Open — T4 |
| 14 | `reflection_ready` priority is greedy — if you have 3 unreflected weekly wraps, the monthly wrap is invisible | Low | Partially addressed — `attention_needed` has per-cardId dismiss |
| 15 | `task_triage` carries no list, can't deep-link to filtered overdue view | Low | Open — T3 |
| 16 | No inline quick actions on any card (everything opens a panel or modal) | Low | Partially addressed — attention_needed has inline actions |
| 17 | No LLM-curated card copy — every message is a hardcoded template string | Low | Open — T4 |
| 18 | No cross-surface propagation (chat, push, email, PWA widget) | Low | Open — T5 |
| 19 | No "Quiet hours" / global frequency cap | Low | Open — T5 |

---

## 3. Brainstorm — Enhancement Ideas (9 axes)

### A. State persistence (foundation for everything else)
- New `cardState` table: `{ userId, cardType, cardId?, dismissedAt?, snoozedUntil?, mutedAt?, lastShownAt? }`
- `lastShownAt` to debounce same-card repeats within N hours
- "Don't show X for a day" / "Don't show X type ever" / "Snooze 1h"
- Migrations for existing users: all default `mutedAt = null`
- Per-cardId dismissal (e.g. dismiss THIS specific reflection without dismissing future ones)

### B. Multi-card queue (replace 1-of-5 with top-3)
- Return up to 3 cards sorted by priority
- Top card is full-size, next two peek behind
- Vertical stack with depth gradient, swipe-down to dismiss
- "More suggestions" expands the queue inline

### C. New card types (extending `ProactiveState` union)
- `event_prep` (12-17h, upcoming event in <2h, pulls notes/resources)
- `evening_log` (20-22h, today's wrap with quick-log for habits + open tasks)
- `focus_block_available` (calendar gap detection, propose 90/120min block)
- `task_due_soon` (within next 2h, with prep checklist)
- `streak_protection` (habit streak will break in <2h if unlogged)
- `reflection_backlog` (multi-reflection card with "see all N")
- `goal_milestone` (behavioral profile consistency threshold hit)
- `inbox_zero_celebration` (all tasks completed — confetti moment)
- `cognitive_load_warning` (too many open tasks, suggest pruning)
- `mood_aware_nudge` (declining reflection sentiment → soft journal prompt)
- `ai_suggested_initiative` (agent proactively proposes a task based on patterns)
- `idle_resurface` (user away N days → catch-up card)

### D. Inline action richness (avoid opening full panels)
- "Schedule focus block" inline (creates event without leaving dashboard)
- "Roll over" inline (reschedules tasks)
- Quick-journal inline (small textarea on the card)
- Quick memory note ("Remember this for me")
- Toggle share inline on reflection card

### E. Cross-surface propagation
- Push notification version of any card (PWA service worker)
- Chat-injected card on session start (brief 1-line summary)
- Email digest (weekly summary of cards fired)
- Standalone `/cards` route showing full history
- PWA home-screen widget

### F. Personalization & intelligence
- **LLM-curated card copy** (not hardcoded — generates "Good morning, Eds. You've got a 2-hour focus window before standup...")
- Per-user time-of-day learning (moves the morning brief window based on when you open the app)
- Card-type engagement tracking → suppress types you always dismiss
- Sentiment-aware tone (gentler when reflection sentiment is declining)
- "Why am I seeing this?" tooltip on every card

### G. Visual/UX refinements
- Animated card-type transitions (Framer Motion layoutId)
- Stacked cards with depth + swipe gestures
- Confetti / sparkles for milestone cards
- Attention pulse on new cards
- Compact mode for narrow viewports
- Inline expansion of related tasks/events
- Progress rings ("12/20 tasks done this week")

### H. Accountability & transparency
- "Why am I seeing this?" affordance on every card
- Card firing history (last 30 days)
- Engagement stats (% acted on, % dismissed)
- "Quiet hours" setting
- Per-card-type frequency cap

### I. Integrations
- Card → push notification
- Card → share with accountability partner
- Card → trigger AI conversation
- Card → external apps (calendars, etc.)

---

## 4. Tier Plan

### T1 — Foundation: state + animations **[COMPLETED]**
**Theme**: Make the card persistent and feel alive.

**Scope** (all done):
- New `cardState` table with 3 indexes (`by_user`, `by_user_type`, `by_user_type_cardid`)
- 5 mutations: `dismissCard`, `snoozeCard`, `muteCardType`, `unmuteCardType`, `markCardShown`
- `getProactiveState` cascade checks `cardState` for dismissal/snooze/mute/debounce
- New `CardMenu.tsx` component (3-dot dropdown: Snooze 1h / Snooze until tomorrow / Snooze until this evening / Mute this type / Dismiss this card)
- AnimatePresence + Framer Motion layoutId for card-type transitions
- Fix habit_check N+1 with a single batched query
- Fallback rule: if everything is suppressed, return `all_caught_up` (never `null`)
- Additional: `attention_needed` card (4 priority tiers) + `all_caught_up` resting state
- Additional: Copy refinement across all 8 card types (less corporate, more conversational)
- Additional: `getCardIdForState` helper with `FunctionReturnType` derivation

**Files affected**:
- `convex/schema.ts` — `cardState` table + 3 indexes
- `convex/dashboard.ts` — 5 new mutations, modified `getProactiveState` cascade, `buildAttentionNeededState` helper, N+1 fix
- `src/components/chat/Dashboard.tsx` — animated transitions, integrated CardMenu, 6 card renderers
- `src/components/chat/CardMenu.tsx` — new file, 3-dot dropdown

**Acceptance criteria** (all met):
- ✅ Dismissing a card makes it disappear and not reappear until end of day (or forever for per-cardId cards)
- ✅ Snoozing 1h makes the card disappear and reappear after 1h
- ✅ Muting a type makes that type never appear (until explicit unmute)
- ✅ Mute everything → still see `all_caught_up` (never an empty dashboard)
- ✅ Card type switch animates smoothly (200-300ms fade/slide)
- ✅ `prefers-reduced-motion` respected

**Open questions** (resolved):
- Persistence: New `cardState` table (chosen)
- Cross-surface: Dashboard only (deferred to T5)
- Copy: Hardcoded templates (deferred to T4 — see §6)
- Fallback: `all_caught_up` replaces `standard_snapshot` (user preferred over subtle/minimal)

---

### T2 — Time-window coverage + attention card **[PARTIAL]**
**Theme**: Fill the dead zones + always-on attention.

**Scope — DONE**:
- New `attention_needed` card with 4 priority tiers (overdue_task, unchecked_habit, pending_reflection, oldest_task)
- `all_caught_up` as system resting state (replaces `standard_snapshot`)
- `buildAttentionNeededState` helper with 4-tier priority cascade
- Per-cardId dismissal for `attention_needed`
- Primary CTA + full CardMenu on attention cards

**Scope — REMAINING** (original T2):
- New `event_prep` card (12-17h, upcoming event in <2h, pulls notes/resources)
- New `evening_log` card (20-22h, end-of-day recap with quick-log buttons)
- Strengthen `morning_brief` with "Schedule Focus Block" action (creates event inline)
- Strengthen `task_triage` with "Roll Over" action (reschedules overdue tasks)
- Open Resource Tray on event prep (slides open resource drawer)

**Files affected**:
- `convex/dashboard.ts` — add 2 new ProactiveState variants, extend cascade
- `convex/events.ts` — new `scheduleFocusBlock` mutation
- `convex/tasks.ts` — new `rollOverOverdueTasks` mutation
- `src/components/chat/Dashboard.tsx` — add 2 new card renderers

**Acceptance criteria**:
- 12-17h dashboard has contextual event prep when an event is upcoming
- 20-22h dashboard has end-of-day recap even when habit_check is empty
- Morning brief has an inline "Schedule Focus Block" button that creates an event without leaving the dashboard
- Task triage has an inline "Roll Over to Today" button

---

### T3 — UX delight
**Theme**: Make it feel alive.

**Scope**:
- Multi-card stack (top + 1-2 peek behind, swipe-down to dismiss)
- Inline quick actions (quick journal textarea, quick memory note, inline event creation)
- "Why am I seeing this?" tooltip on every card
- Animated card-type transitions with subtle personality (different easings per card type)
- Confetti / sparkles for milestone cards (inbox zero, streak milestones)

**Files affected**:
- `convex/dashboard.ts` — return up to 3 cards
- `src/components/chat/Dashboard.tsx` — multi-card layout
- `src/components/chat/CardStack.tsx` — new file
- `src/components/chat/WhyThisTooltip.tsx` — new file

**Acceptance criteria**:
- Dashboard can show 1-3 cards stacked
- Inline actions work without opening a separate panel
- Every card has a "Why this?" affordance explaining the trigger

---

### T4 — Intelligence layer
**Theme**: Make it feel personal.

**Scope**:
- LLM-curated card copy (replaces hardcoded templates with personalized prose)
- Per-user time-of-day learning (moves the morning brief window based on when you open the app)
- Card-type engagement tracking → suppress types you always dismiss
- Sentiment-aware tone (gentler when reflection sentiment is declining)
- New card types: `streak_protection`, `inbox_zero_celebration`, `mood_aware_nudge`, `goal_milestone`

**Files affected**:
- `convex/dashboard.ts` — add per-user time-profile table
- `convex/ai_action.ts` — new `generateCardCopy` action (LLM call)
- `src/components/chat/Dashboard.tsx` — render LLM-generated copy

**Acceptance criteria**:
- Morning brief copy feels personalized to the user's actual day
- "Don't show this type" learning reduces repeat dismissals
- Streak protection card appears for high-streak habits at risk

---

### T5 — Cross-surface propagation
**Theme**: Meet the user where they are.

**Scope**:
- Push notification version of any card (PWA service worker)
- Chat-injected card on session start (brief 1-line summary)
- Email digest (weekly summary of cards fired)
- Standalone `/cards` route showing full history
- PWA home-screen widget

**Files affected**:
- New: `src/app/cards/page.tsx` (history route)
- `convex/dashboard.ts` — new `getCardHistory` query
- `public/sw.js` — push notification handler
- `src/components/chat/Chat.tsx` — chat start-of-session brief

**Acceptance criteria**:
- Push notifications fire for high-priority cards
- Chat session opens with a 1-line brief when relevant
- `/cards` route shows the last 30 days of cards with engagement stats

---

## 5. Implementation Order (recommended)

1. T1 ✅
2. **T2** ← we are here (attention_needed + all_caught_up done; event_prep + evening_log remaining)
3. T3
4. T4
5. T5

Each tier is independently shippable. We can stop after any tier and ship a stable, useful product.

---

## 6. Deferred Ideas & Future Considerations

These were brainstormed but explicitly deferred:

- **LLM-generated card copy** — deferred to T4. Start with hardcoded templates (cheaper, faster, no LLM cost on every dashboard mount). When T4 lands, do a hybrid: hardcoded structure + LLM-generated headline.
- **Cross-surface propagation** — deferred to T5. Dashboard is the only surface for now. Cross-device, push, email all come later.
- **Card history / engagement analytics** — deferred to T5.
- **Accountability partner / social sharing of cards** — parking lot.
- **External app integrations** (calendars, Slack, etc.) — parking lot.
- ~~**Card state persistence**~~ — **RESOLVED** in T1 (dismiss/snooze/mute via `cardState` table).
- ~~**Unkillable reflection card**~~ — **RESOLVED** in T1 (per-cardId dismiss).
- ~~**Habit check N+1**~~ — **RESOLVED** in T1 (batched query).
- ~~**No card-type transition animation**~~ — **RESOLVED** in T1 (AnimatePresence + layoutId).

---

## 7. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-01 | New `cardState` table (not userProfile fields, not localStorage) | Cleanest, queryable, supports analytics. Per-user per-type per-cardId. |
| 2026-06-01 | Dashboard-only surface for T1 | Simpler, focused, doesn't dilute design. Cross-surface in T5. |
| 2026-06-01 | Hardcoded templates for card copy | Lower latency, no extra LLM cost on every mount. LLM copy is a T4 enhancement. |
| 2026-06-01 | Always fall back to `all_caught_up` if all cards suppressed | User never sees an empty dashboard. `all_caught_up` is unmuteable. |
| 2026-06-01 | Per-cardId dismissal for `reflection_ready` | Solves the "unkillable reflection" pain point cleanly. |
| 2026-06-01 | `prefers-reduced-motion` respected | Accessibility. |
| 2026-06-01 | Snooze durations: 1h, until this evening (22:00 local), until tomorrow (start of next day) | Covers the realistic user intents without overwhelming the menu. |
| 2026-06-02 | `attention_needed` replaces `standard_snapshot` | 4-tier priority (overdue_task → unchecked_habit → pending_reflection → oldest_task) is more actionable than a static snapshot. |
| 2026-06-02 | `all_caught_up` is the system resting state | Unmuteable, always returned as final fallback. User preferred card-style visual over subtle/minimal. |
| 2026-06-02 | `attention_needed` per-cardId dismissal | Different sub-types reference different entities (task/habit/reflection), so dismissal must be per-cardId. |
| 2026-06-02 | Habit check debounce 1h (vs 4h for others) | Habits are daily — re-firing after 1h is appropriate. |
| 2026-06-02 | Reflection crons separated from OCEAN crons | OCEAN = weekly+monthly only. Reflections = weekly+monthly+yearly. Clean separation of concerns. |
| 2026-06-02 | Yearly reflection fires Dec 27-30 UTC with local timezone check | Handles UTC+13 users (Pacific/Auckland) who would be on Jan 1 when UTC is Dec 31. |
| 2026-06-02 | Yearly `getPeriodRange` cap removed | Period always covers Jan 1 → Dec 31 regardless of when cron fires. |
| 2026-06-02 | Weekly offset = 1 (same as monthly) | Both weekly and monthly cover previous period, not current. |

---

## 8. Changelog

- **2026-06-01** — Document created. T1 (Foundation) marked IN PROGRESS. All brainstormed ideas captured in §3.
- **2026-06-02** — T1 COMPLETED and pushed (`2704b4b`). Added `attention_needed` (4 priority tiers) + `all_caught_up` resting state. Replaced `standard_snapshot`. Separated reflection crons from OCEAN crons. Fixed yearly reflection cron (Dec 27-30) and weekly offset. Refined copy across all card types.
