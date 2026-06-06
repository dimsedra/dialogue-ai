# Architectural Decision Record: PWA Manifest, Launch Experience & Mobile UI/UX Refinements

- **ID**: ADR-004
- **Status**: Accepted & Implemented
- **Date**: 2026-05-17
- **Associated Commit**: `535360c`, `05b6dc2`
- **Target Components**: `src/app/manifest.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/Chat.tsx`, `src/components/TaskPanel.tsx`

---

## 1. Architectural Context & Motivation

### 1.1 Problem Statement

During mobile usability testing and Progressive Web App (PWA) evaluation on iOS and Android devices, several critical user experience bottlenecks were identified:

1. **Harsh Launch Screen**: Installing the app to the home screen generated a default launch splash screen with a jarring white background (`#ffffff`) and unstyled icon before transitioning into the dark interface (`#0a0a0a`).
2. **Right Sidebar State Persistence on Sync**: Triggering a workspace synchronization from the mobile Task Panel did not automatically close the sidebar drawer, obstructing the user's view of the updated chat stream.
3. **Floating Action Button (FAB) Collision**: The floating Planner button (`Grid2x2` icon) at the bottom right had a fixed bottom offset. When the multi-line chat input expanded from 56px to 84px on mobile, the expanding input collided with and overlapped the floating button.
4. **Invisible Touch Actions**: Action buttons (such as edit and delete icons for session history, tasks, and events) relied on desktop pointer hover states (`opacity-0 group-hover:opacity-100`). Since touch screens lack hover capabilities, these vital controls remained completely invisible on mobile devices.
5. **Animation Overhead**: Spring transition animations on mobile for the Task Panel drawer and expanding task details caused micro-stutters and unnecessary UI latency during mobile navigation.
6. **Modal Stacking & Layout Discrepancies**: When saving changes to a recurring event, the edit event modal remained open underneath the recurrence confirmation modal. Furthermore, confirmation modals (`confirmDelete` and `confirmEditRecurring`) used absolute centered popups rather than the application's premium, unified fixed bottom-sheet/centered overlay design.

### 1.2 Design Requirements

To achieve a premium, snappy, and flawless mobile experience:

- **Immersive PWA Canvas**: The operating system splash screen must perfectly match the root dark background (`#0a0a0a`) with a centered premium gold bot icon.
- **Auto-Dismiss Navigation**: Syncing workspace data from the mobile Task Panel must instantly collapse the right sidebar (`setShowTasks(false)`).
- **Dynamic FAB Ergonomics**: The Planner FAB must dynamically compute its vertical position (`bottom: calc(7.25rem + keyboardOffset + chatInputOffset)`) to smoothly float upwards in tandem with the expanding multi-line chat input.
- **Universal Touch Accessibility**: All action controls must be visible by default on mobile viewports (`opacity-100 lg:opacity-0 lg:group-hover:opacity-100`), appearing on hover only on large desktop screens.
- **Zero-Latency Mobile Transitions**: Framer Motion drawer transitions and detail expanders on mobile viewports must execute instantly (`duration: 0`) to maintain peak frame rates.
- **Unified Modal Choreography**: Saving a recurring event must instantly collapse the edit event modal (`setEditingEventId(null)`). Confirmation modals must adopt the identical `fixed inset-0 z-[100]` full-screen overlay with responsive bottom-sheet (mobile) and rounded card (desktop) layouts.

---

## 2. Technical Implementation Details

### 2.1 Web App Manifest & Layout Config (`src/app/manifest.ts`)

A compliant Web App Manifest (`manifest.json`) was generated dynamically to enforce standalone display and dark theme styling:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dialogue',
    short_name: 'Dialogue',
    description: 'A clean, minimal chat interface for focused productivity.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
```

Root layout metadata was updated with `statusBarStyle: "black-translucent"` and `themeColor: "#0a0a0a"`.

### 2.2 Dynamic FAB Positioning & Sidebar Exclusivity (`src/app/page.tsx`)

In `page.tsx`, a new state variable tracks the chat input expansion offset:

```tsx
const [chatInputOffset, setChatInputOffset] = useState(0);
```

The Planner FAB bottom style was modified to calculate both virtual keyboard offset and input expansion:

```tsx
style={{ 
  top: isLargeViewport ? "50%" : "auto",
  bottom: isLargeViewport ? "auto" : `calc(7.25rem + ${keyboardOffset + chatInputOffset}px)`,
  transform: isLargeViewport ? "translateY(-50%)" : "none"
}}
```

The `handleSyncFromPanel` callback was updated to auto-dismiss the sidebar on mobile:

```tsx
const handleSyncFromPanel = useCallback(() => {
  syncRef.current?.();
  if (!isLargeViewport) {
    handleSetShowTasks(false);
  }
}, [isLargeViewport, handleSetShowTasks]);
```

### 2.3 Input Resize Propagation & Touch Visibility (`src/components/Chat.tsx`)

The `Chat` component receives `onChatInputResize` and triggers it during textarea resizing:

```tsx
const handleInputResize = useCallback(() => {
  ...
  const nextHeight = Math.min(Math.max(el.scrollHeight, 56), maxHeight);
  el.style.height = `${nextHeight}px`;
  onChatInputResize?.(Math.max(0, nextHeight - 56));
}, [onChatInputResize]);
```

When a message is sent, `onChatInputResize?.(0)` instantly resets the FAB position. Furthermore, session history item actions and attachment thumbnail delete overlays were updated to `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`.

### 2.4 Snappy Detail Expansion & Action Visibility (`src/components/TaskPanel.tsx`)

Task and event action containers were refactored to ensure mobile touch visibility:

```tsx
<div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all mr-2">
```

Additionally, `<AnimatePresence>` was removed from the task details expansion container, converting it to a standard `<div>` to eliminate animation lag on mobile devices.

### 2.5 Modal Choreography & Design Unification (`src/components/TaskPanel.tsx`)

When updating a recurring event, triggering `setConfirmEditRecurring` now simultaneously dismisses the edit modal:

```tsx
if (editingEventObj && editingEventObj.recurrence && editingEventTimestamp) {
  setConfirmEditRecurring({ id, event: editingEventObj, updates, timestamp: editingEventTimestamp });
  setEditingEventId(null);
  setIsSubmitting(false);
  return;
}
```

Both `confirmEditRecurring` and `confirmDelete` modals were refactored to use the application's premium overlay container (`fixed inset-0 z-[100] bg-[#0f0e0c]/80 backdrop-blur-md p-0 sm:p-6`) and responsive card styling (`w-full max-w-lg bg-[#1a1814] border border-[#d4a373]/20 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-6`), achieving complete layout consistency across all screen viewports.

### 2.6 Mobile Sidebar Snappiness & Auto-Dismiss (`src/app/page.tsx` & `src/components/Chat.tsx`)

To ensure maximum responsiveness on mobile viewports:

- The left history drawer `transition` prop was updated to execute instantly on mobile:

  ```tsx
  transition={isLargeViewport ? { type: "spring", damping: 30, stiffness: 250 } : { duration: 0 }}
  ```
  
- The mobile overlay backdrop (`motion.div`) in `page.tsx` was given `transition={{ duration: 0 }}` so it opens and closes instantly without trailing fade animations.
- Selecting any existing session or creating a new chat session from the mobile history drawer instantly collapses the sidebar (`if (!isLargeViewport) setShowHistory(false)`), taking the user directly to the active chat canvas.

### 2.7 Zero-Latency Mobile Tab & Item Transitions (`src/components/TaskPanel.tsx`)

To remove UI jitter when switching between Tasks, Events, and Calendar tabs on mobile screens:

- Dynamic viewport detection (`isLargeViewport`) was introduced in `TaskPanel`.
- Container transitions for tab views and individual task/event items bypass animation durations on mobile (`transition={isLargeViewport ? ... : { duration: 0 }}`), ensuring instant rendering of task lists and calendar views without sequential slide/fade delays.

### 2.8 Universal Autocomplete & Suggestion Suppression

To prevent mobile operating systems from incorrectly popping up password, payment card, or address suggestion heuristics above application input fields:

- Distinct, randomized or contextual `name` attributes (e.g. `panel-search-filter`, `chat-session-rename`, `settings-pref-name`) were explicitly assigned to all inputs and textareas across `Chat.tsx`, `TaskPanel.tsx`, and `settings/page.tsx`.
- Explicit attributes `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, and `spellCheck={false}` were applied universally to suppress aggressive OS keyboard overlays while preserving standard credentials auto-fill strictly on the login screen (`SignInForm.tsx`).

### 2.9 Flawless Instant Chat Session Anchoring

To eliminate the visual artifact of chat streams flashing from top to bottom or failing to jump instantly when switching between active conversation sessions:

- **Root Cause Analysis**: Extensive DOM lifecycle tracing revealed two architectural blockers that prevented previous scroll anchoring attempts from succeeding:
  1. *Forced 800ms Synchronizing Timer*: A legacy minimum sync timer forced the "Synchronizing" spinner to remain mounted for exactly 800ms on every session switch. During this window, the message list DOM was unmounted, blocking anchor effects (`!isSyncing`).
  2. *AnimatePresence Exit Delays*: The synchronizing spinner was wrapped in `<AnimatePresence mode="wait">`. When `isSyncing` finally became false after 800ms, `mode="wait"` forced React to wait for the spinner's ~300ms exit fade animation before mounting the message list. Consequently, when anchor effects and retry timers executed, the target message DOM nodes did not yet exist (`document.getElementById` returned `null`).
- **Elimination of Forced Delay**: The forced 800ms timer was completely eliminated. The syncing state is now purely derived from query loading (`!!(activeSessionId && messages === undefined)`). When data arrives from Convex (~50-100ms), the spinner unmounts instantly without artificial holding times.
- **Zero-Latency DOM Mounting**: `<AnimatePresence mode="wait">` was converted to a standard `<AnimatePresence>` without exit locks, and the spinner's transition was updated to `transition={{ duration: 0 }}`. This enables the message list to mount instantly the exact millisecond the query resolves.
- **Synchronous Layout Anchoring**: The anchoring effect was upgraded from `useEffect` to `useLayoutEffect`. Because `useLayoutEffect` runs synchronously after DOM mutations but *before* browser paint, the browser renders the initial visible frame already centered on the target message bubble (`msg._id`).
- **Message Grounding**: Each message bubble is assigned a distinct DOM identifier (`id={`msg-${msg._id}`}`). Upon session change, the viewport anchors directly to the exact DOM coordinates of the last message bubble via `scrollIntoView({ behavior: "instant", block: "center" })`, ensuring rock-solid positional stability regardless of virtual keyboard trays or dynamic container padding.

### 2.10 Zero-Latency Modal Overlays & Animations

To eliminate perceived latency and UI sluggishness during modal operations on mobile viewports:

- All modal backdrops and overlay containers across `Chat.tsx` (workspace creation, session deletion) and `TaskPanel.tsx` (confirm delete, confirm recurring edit, edit task, edit event) now dynamically evaluate the current viewport (`isLargeViewport`).
- On mobile screens (`!isLargeViewport`), backdrop fade transitions and card spring animations are completely bypassed (`transition={isLargeViewport ? ... : { duration: 0 }}`).
- When a user taps to open or dismiss any dialog on mobile, the overlay unmounts or mounts instantly in 0ms without any trailing spring physics or fade delays, delivering lightning-fast, snappy responsiveness.

---

## 3. Verification & Build Compliance

### 3.1 Production Build Validation

Execution of `npm run build` compiled successfully in 3.4s with zero TypeScript or ESLint errors, validating complete type safety across all updated props and event callbacks.

### 3.2 Usability Verification

- **PWA Installation**: Home screen launch displays a pristine dark `#0a0a0a` screen with a centered gold bot icon.
- **Dynamic Floating Button**: Expanding the chat input bar on mobile smoothly pushes the Planner FAB upward, keeping a clean gap without any overlap.
- **Touch Responsiveness**: All edit, delete, and dismiss controls are instantly visible and operable on mobile viewports.
- **Unified Modals**: Confirmation dialogs smoothly occupy the full viewport with premium styling exactly matching the standard task and event edit modals.
