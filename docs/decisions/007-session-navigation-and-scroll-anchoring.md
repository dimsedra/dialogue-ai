# ADR-007: Session Navigation & Intelligent Scroll Anchoring

- **Status**: Accepted
- **Date**: 2026-05-18
- **Authors**: Antigravity & User
- **Domain**: Chat Interface & Session Navigation

---

## 1. Context & Problem Statement

As "Dialogue" evolved into an active productivity and multi-tool assistant, user conversations frequently produced long, multi-turn AI responses. Two critical UX bottlenecks emerged during heavy usage:

1. **Disruptive Auto-Scroll**: Whenever an AI response chunk arrived or the `messages` array updated, the viewport unconditionally snapped to the absolute bottom of the message list (`messagesEndRef`). This forced users to lose their reading position while the AI was generating text.
2. **Static Session Hierarchy**: Sesi di sidebar obrolan diurutkan berdasarkan `_id` dokumen (waktu pembuatan), bukan berdasarkan obrolan yang baru saja aktif. Selain itu, tidak ada mekanisme untuk mempertahankan sesi penting tetap di puncak obrolan.

How can we provide a stable, intentional reading environment during streaming AI responses while keeping session navigation dynamic and ergonomically organized?

---

## 2. Decision

We resolved these challenges by adopting **User-Intent Scroll Anchoring** and **Client-Side Activity Grouping**.

### 2.1. Intent-Based Scroll Anchoring

We replaced unconditional auto-scrolling with distinct behaviors based on user action:

- **Message Send (`userJustSent`)**: When the user sends a message, the viewport instantly anchors to the **User's message bubble** (`block: "start"`). The AI response flows smoothly beneath it, keeping the user's prompt in context.
- **Passive Streaming**: If the AI response arrives while the user is near the bottom of the viewport (`!showScrollBottom`), the screen smooth-scrolls gently. If the user scrolls up to review history, auto-scrolling suspends entirely and a floating action button ("↓") is displayed.
- **Session Transition**: Switching sessions anchors directly to the **last User message** in the new session.

### 2.2. Dual-Group Session Management

- **Pinned Sessions**: Added an optional `pinned: v.optional(v.boolean())` field to `chatSessions` in `convex/schema.ts` and a `togglePinSession` mutation.
- **Client-Side Sorting**: Using `useMemo` in `SessionSidebar.tsx`, sessions are dynamically divided into `pinnedSessions` and `historySessions`. Both groups are sorted internally by `lastActivity` descending (`b.lastActivity - a.lastActivity`).

```text
┌────────────────────────────────────────────────────────┐
│  📌 PINNED                                             │
│  ├── Project Alpha Launch (Pinned, Last Active 2m ago) │
│  └── Weekly Groceries (Pinned, Last Active 1h ago)     │
│────────────────────────────────────────────────────────│
│  🕐 HISTORY                                            │
│  ├── React Refactoring (Last Active 5m ago)            │
│  └── CSS Styling (Last Active 3d ago)                  │
└────────────────────────────────────────────────────────┘
```

---

## 3. Rationale & Consequences

### 3.1. Rationale

- **Reading Ergonomics**: By anchoring to the user's message bubble on send, the user retains immediate visual confirmation of their prompt while reading the incoming AI stream without vertigo.
- **Zero-Migration Scaling**: Client-side sorting of chat sessions avoids the overhead of immediate compound index migrations on the backend, making the UI highly responsive for standard user session workloads.

### 3.2. Consequences

- **Positive**: Exceptional reading stability during long or multi-tool AI responses.
- **Positive**: Old sessions that are re-engaged instantly bubble to the top of the history list, keeping active work readily accessible.
- **Technical Consideration**: In `MessageStream.tsx`, synchronization between `useLayoutEffect` (DOM measurement before paint) and `useEffect` (streaming updates) must strictly respect the `userJustSent` flag to prevent collision with browser default scroll restoration.

---

## 4. Verification & Grounding

- **Schema Truth**: `convex/schema.ts` now officially maintains `pinned` state.
- **Activity Timestamp**: `convex/messages.ts` updates `lastActivity` on every message dispatch.
- **UI Verification**: Verified across both mobile viewports (drawer rail) and desktop sidebar viewports.
