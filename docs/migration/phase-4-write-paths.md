# Phase 4 — Flip Write Paths to PB

**Status**: 🟢 Done  
**Owner**: User + Antigravity  
**Plan ref**: `docs/MIGRATION_POCKETBASE.md` §5 Phase 4  

---

## 1. Goal

Port all mutation (write) paths from Convex to PocketBase. When `isPbBackend()` is enabled, all creates, updates, deletes, and toggles write to PocketBase. The Convex backend path remains fully functional as a parallel fallback when the flag is off.

**Done when**:
- All PocketBase mutation hooks are created in `src/pb-compat/hooks/`.
- All consumer UI components use the dual-mutation pattern, selecting the PocketBase mutation when `isPbBackend()` is true.
- All local LLM tool call queries/mutations inside `Chat.tsx` are conditionalized.
- `npx tsc --noEmit` reports 0 errors.
- All 170 unit tests pass.

---

## 2. Scope

### Stream A — Mutation Hooks (`src/pb-compat/hooks/`)

All hooks were implemented in prior sessions. This phase focused on **fixing parameter mismatches** and **wiring consumer components**.

| Hook File | Hooks Exported |
|---|---|
| [use-pb-workspace-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-workspace-mutations.ts) | `usePbWorkspaceCreate`, `usePbWorkspaceUpdate` |
| [use-pb-persona-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-persona-mutations.ts) | `usePbPersonaCreate`, `usePbPersonaUpdate`, `usePbPersonaDelete` |
| [use-pb-session-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-session-mutations.ts) | `usePbSessionCreate`, `usePbSessionDelete`, `usePbSessionRename`, `usePbSessionTogglePin` |
| [use-pb-task-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-task-mutations.ts) | `usePbTaskCreate`, `usePbTaskUpdate`, `usePbTaskToggleCompleted`, `usePbTaskDelete`, `usePbTasksRollOver` |
| [use-pb-event-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-event-mutations.ts) | `usePbEventCreate`, `usePbEventUpdate`, `usePbEventDelete`, `usePbEventCancelOccurrence`, `usePbEventUpdateOccurrence`, `usePbEventScheduleFocusBlock` |
| [use-pb-habit-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-habit-mutations.ts) | `usePbHabitCreate`, `usePbHabitLog`, `usePbHabitArchive`, `usePbHabitDelete` |
| [use-pb-dashboard-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-dashboard-mutations.ts) | `usePbDismissCard`, `usePbSnoozeCard`, `usePbMuteCardType`, `usePbMarkCardShown` |
| [use-pb-profile-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-profile-mutations.ts) | `usePbUpdateProfile`, `usePbUpdatePreferences`, `usePbAddSubscription`, `usePbRemoveSubscription` |
| [use-pb-message-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-message-mutations.ts) | `usePbMessageSend` |
| [use-pb-image-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-image-mutations.ts) | `usePbImageSave`, `usePbImageDelete` |
| [use-pb-reflection-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-reflection-mutations.ts) | `usePbReflectionSaveComment`, `usePbReflectionToggleShare` |
| [use-pb-memory-mutations.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/hooks/use-pb-memory-mutations.ts) | `usePbMemoryCreate`, `usePbMemoryUpdate`, `usePbMemoryDelete` |

---

### Stream B — Parameter Adapter Wrappers

Four critical parameter discrepancies between Convex and PocketBase required adapter wrappers at the consumer level:

1. **`updateTask`**: Convex takes `{ id, ... }`, PB takes `{ taskId, ... }`. The adapter destructures `{ id, ...rest }` and calls `pbUpdateTask({ taskId: id, ...rest })`.

2. **`updateEvent`**: Same pattern — Convex `{ id, ... }` → PB `{ eventId: id, ... }`.

3. **`toggleCompleted` / `completeTask`**: Convex takes `{ id }` and internally fetches the task to toggle. PB takes `{ id, completed }` explicitly. The adapter calls `pbApi.tasks.get({ id })` to fetch the current state, then passes `{ id, completed: !task.completed }`.

4. **`createTask` / `createEvent`**: Convex accepts `null` for optional fields (`workspaceId`, `reminderOffset`). PB hooks expect `undefined`. The adapter converts `null` → `undefined`.

---

### Stream C — Consumer Component Wiring

All consumer files now wire the dual-mutation pattern:

| Component | Mutations Conditionalized |
|---|---|
| [Chat.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/Chat.tsx) | createWorkspace, sendMessage, createSession, deleteSession, addTask, addEvent, updateEvent, updateOccurrence, deleteEvent, completeTask, deleteTask, updateTask, updateUserBio, deleteSemanticMemory, updatePreferences, createHabit, logHabit |
| [TaskPanel.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/TaskPanel.tsx) | toggleTask, deleteTask, updateTask, removeEvent, updateEvent, updateOccurrence, cancelEventOccurrence, createTask, createEvent |
| [Dashboard.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/chat/Dashboard.tsx) | dismissCard, snoozeCard, muteCardType, markCardShown |
| [CardMenu.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/chat/CardMenu.tsx) | dismissCard, snoozeCard, muteCardType |
| [PageCustomizer.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/chat/PageCustomizer.tsx) | saveImage (FormData upload) |
| [ReflectionWrappedModal.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/chat/ReflectionWrappedModal.tsx) | saveComment, toggleShare |
| [SessionSidebar.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/components/chat/SessionSidebar.tsx) | renameSession, togglePin, deleteSession |
| [workspace/[id]/page.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/app/workspace/%5Bid%5D/page.tsx) | updateSettings |
| [settings/page.tsx](file:///d:/Project%20Hub/Dialogue-AI/src/app/settings/page.tsx) | updateProfile, updatePreferences, addSubscription, removeSubscription, memoryCreate, memoryUpdate, memoryDelete |

---

### Stream D — Local LLM Tool Call Conditionalization

All `convex.query()` and `convex.mutation()` calls inside the `runLocalLLMForSession` tool execution loop in `Chat.tsx` have been conditionalized to use `pbApi.*` when PB is active. This covers 14 distinct query/mutation call sites across tasks, events, habits, workspaces, and reflections.

Key patterns:
- **Imperative queries**: `isPbBackend() ? await pbApi.tasks.get({id}) : await convex.query(api.tasks.get, {id})`
- **Batch operations**: `isPbBackend() ? await Promise.all(tasks.map(addTask)) : await convex.mutation(api.tasks.batchAdd, ...)`
- **Record ID normalization**: `id: t._id ?? t.id` for search history results that may return Convex `_id` or PB `id` fields.

---

### Stream E — `usePbUpdatePreferences` Signature Fix

The original `usePbUpdatePreferences` expected `{ preferences: any }`, but Convex's `updatePreferences` mutation expects `{ provider?, searchProvider?, customConfigs?, taskModels? }`. The hook was rewritten to:
1. Accept the same flat parameters as Convex.
2. Fetch the user's existing profile preferences.
3. Merge the new values into the existing preferences object (matching the Convex handler's merge logic).
4. Write the merged preferences back to PB.

---

## 3. Verification and Test Results

### TypeScript Compilation
```powershell
npx tsc --noEmit
```
**Result**: **0 errors** — clean compilation.

### Unit & Type Tests
```powershell
npx vitest run
```
**Result**: **170/170 tests passed** across 18 test files.

---

## 4. Companion Artifacts

### Modified Files
* `src/pb-compat/hooks/use-pb-profile-mutations.ts` — rewrote `usePbUpdatePreferences` signature, added `as any` cast to subscription create
* `src/components/Chat.tsx` — added imports (`usePbHabitCreate`, `usePbHabitLog`, `api as pbApi`), adapter wrappers for 6 mutations, conditionalized 14 imperative query/mutation call sites, fixed reflection export, fixed `_id`/`id` in search history
* `src/components/TaskPanel.tsx` — added `api as pbApi` import, adapter wrappers for 7 mutations with explicit `(args: any) => Promise<any>` typing

### Unchanged Files (wired in prior session)
* `src/components/chat/Dashboard.tsx`
* `src/components/chat/CardMenu.tsx`
* `src/components/chat/PageCustomizer.tsx`
* `src/components/chat/ReflectionWrappedModal.tsx`
* `src/components/chat/SessionSidebar.tsx`
* `src/app/workspace/[id]/page.tsx`
* `src/app/settings/page.tsx`
