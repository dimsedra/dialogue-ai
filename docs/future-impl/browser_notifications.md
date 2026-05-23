# Future Implementation: Context-Aware Smart Notifications

- **Date**: 2026-05-18
- **Status**: Planned
- **Priority**: Medium
- **Depends On**: `living_task_context.md` (task notes & progress must exist first)
- **Affected Files**: `convex/schema.ts`, `convex/notifications.ts`, `public/sw.js`, `src/components/Chat.tsx`

---

## 1. Problem Statement

Standard productivity notifications are dumb templates:

> *"Task 'Study CCNA Lab 5' is due in 15 minutes"*

This tells the user nothing they don't already know. It has zero context about the task's current state, blockers, or progress. Users train themselves to ignore these — notification fatigue.

### What Dialogue Should Do Instead

Dialogue's agent already maintains **Living Task Context** — notes, progress, and outcomes written during natural conversation. Smart notifications should leverage this existing context to deliver **actionable, personalized reminders** that reference what the agent knows:

> *"Lab 5 is due in 15 minutes — last time you mentioned having 2 questions left. Ready to resume?"*

The intelligence is NOT generated at notification time. It was written by the agent during conversation. The notification is just the **delivery mechanism** for context that already exists.

---

## 2. Core Principle

> Smart Notification = Living Task Context + Timing
>
> The agent does the "smart work" when it writes task notes.
> The notification system just reads and delivers.

### Dumb vs Smart Comparison

| Dumb (Every Other App) | Smart (Dialogue) |
| :--- | :--- |
| "Meeting in 30 min" | "Weekly Standup in 30 mins. Be ready to discuss yesterday's redesign outcome." |
| "3 tasks overdue" | "3 overdue. Critical: 'Submit proposal' — client expects it by tomorrow morning." |
| "Task due tomorrow" | "Lab 6 tomorrow. Progress at 10%, still waiting for VPN access from IT." |

All "intelligence" in the right column comes from `task.statusHook` and `task.progress` — fields the agent already populates through conversation.

---

## 3. Architecture

### Zero AI Calls at Notification Time

```text
┌─────────────────────────────────────────────────────────┐
│  During Conversation (already happening)                │
│                                                         │
│  User: "2 questions left on Lab 5"                      │
│  Agent: updateTask(statusHook: "2 questions left on Lab 5", │
│                    progress: 50)                        │
│         ↓                                               │
│  Task in DB now has rich hook and progress              │
└─────────────────────────────────────────────────────────┘
                        ⋮
                    (time passes)
                        ⋮
┌─────────────────────────────────────────────────────────┐
│  Convex Scheduled Function (runs every 5 min)           │
│                                                         │
│  1. Query tasks where dueDate is within next 15 min     │
│  2. Filter: not completed, not already notified         │
│  3. Read task.statusHook + task.progress                │
│  4. Format contextual notification (template + hook)    │
│  5. Push via Web Push API                               │
└─────────────────────────────────────────────────────────┘
```

### Notification Formatting Logic

The notification formatter reads directly from `task.statusHook` for pristine, human-like presentation without any regex string manipulation or timestamp stripping.

```typescript
function formatSmartNotification(task: Task): { title: string; body: string } {
  const timeUntil = formatTimeUntil(task.dueDate);
  const title = `${task.text} — ${timeUntil}`;

  // Build contextual body from living task data
  const parts: string[] = [];

  if (task.progress && task.progress > 0 && task.progress < 100) {
    parts.push(`Progress: ${task.progress}%`);
  }

  if (task.statusHook) {
    parts.push(task.statusHook);
  }

  const body = parts.length > 0
    ? parts.join(". ")
    : "Don't forget to complete this task!"; // Fallback if no context exists

  return { title, body };
}
```

**Example outputs:**

```text
Task with status hook + progress:
  Title: "Study CCNA Lab 5 — 15 minutes left"
  Body:  "Progress: 90%. Router configuration complete, ready for final testing."

Task with status hook only:
  Title: "Submit proposal — tomorrow morning"
  Body:  "Blocker: waiting for design team review. Follow up today."

Task with no context:
  Title: "Buy groceries — 30 minutes left"
  Body:  "Don't forget to complete this task!"
```

The notification degrades gracefully — smart when context exists, functional when it doesn't.

---

## 4. Event Outcome Follow-Up

For events that just concluded, the system can also send a follow-up notification prompting the user to record the outcome:

```text
Title: "Weekly Standup just concluded"
Body:  "Any decisions or action items to record? Open Dialogue to update."
```

When the user opens the app and tells the agent the outcome, the agent writes it to `event.outcome` — enriching context for future reference.

---

## 5. Technical Implementation

### 5.1. Web Push Subscription

```typescript
// In Chat.tsx or a dedicated NotificationProvider
async function subscribeToNotifications() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY,
  });
  // Store subscription in Convex
  await savePushSubscription({ subscription: JSON.parse(JSON.stringify(subscription)) });
}
```

### 5.2. Schema Extension

```typescript
// convex/schema.ts
pushSubscriptions: defineTable({
  userId: v.id("users"),
  subscription: v.any(),  // PushSubscription object
  createdAt: v.number(),
}).index("by_user", ["userId"]),
```

### 5.3. Convex Scheduled Function

```typescript
// convex/notifications.ts
export const checkUpcomingDeadlines = internalAction({
  handler: async (ctx) => {
    const now = Date.now();
    const windowEnd = now + 15 * 60 * 1000; // 15 minutes ahead

    // Query tasks with upcoming deadlines
    const tasks = await ctx.runQuery(internal.notifications.getUpcomingTasks, {
      now, windowEnd
    });

    for (const task of tasks) {
      const notification = formatSmartNotification(task);
      await sendPushNotification(task.userId, notification);
      // Mark as notified to prevent duplicate sends
      await ctx.runMutation(internal.notifications.markNotified, { taskId: task._id });
    }
  },
});

// Register as cron job
// convex/crons.ts
export default cronJobs();
crons.interval("check-deadlines", { minutes: 5 }, internal.notifications.checkUpcomingDeadlines);
```

### 5.4. Service Worker

```javascript
// public/sw.js
self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/badge-72x72.png",
      tag: data.taskId, // Prevents duplicate notifications
      data: { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

---

## 6. Permission Flow

### First-Time Prompt

Don't ask for notification permission on first visit. Wait for a natural moment:

1. User creates their first task with a deadline.
2. Agent responds: *"Task created! Would you like me to remind you 15 minutes before the deadline via browser notifications?"*
3. User says yes → trigger `Notification.requestPermission()`.

This is conversational, not intrusive.

### Permission Denied Handling

If the user denies permission, respect it. The agent can still remind during `syncWorkspace` conversations — notifications are an enhancement, not a requirement.

---

## 7. Ecosystem Integration

```text
Living Task Context ←→ Smart Notifications
       ↑                        ↑
   Agent writes statusHook  System reads statusHook
   during conversation      at notification time
       ↑                        ↑
   syncWorkspace            Convex cron job
   triggers context          triggers delivery
   enrichment
```

Both systems feed from the same source of truth: the task's `statusHook` and `progress` fields. No duplication, no complex string manipulation or regex parsing needed.

---

## 8. Implementation Phases

### Phase 1: Foundation

1. Add `pushSubscriptions` table to `convex/schema.ts`.
2. Implement Service Worker registration in the PWA manifest flow.
3. Build permission request flow (conversational, not intrusive).

### Phase 2: Smart Delivery

1. Create `convex/notifications.ts` with `formatSmartNotification` logic.
2. Set up Convex cron job for deadline checking.
3. Implement Web Push API integration (VAPID keys, subscription management).

### Phase 3: Event Follow-Up (Optional)

1. Post-event notifications prompting outcome recording.
2. Deep-link from notification to the relevant session/workspace.

---

## 9. Verification Scenarios

| # | Scenario | Expected Notification |
| :--- | :--- | :--- |
| 1 | Task with statusHook due in 15 min | Title + clean punchy body from `statusHook` |
| 2 | Task without statusHook due in 15 min | Title + generic fallback body |
| 3 | Task already completed before deadline | No notification sent |
| 4 | Task already notified | No duplicate notification |
| 5 | Event just concluded (has no outcome) | Follow-up prompt to record outcome |
| 6 | User denied notification permission | No push sent; agent reminds during sync instead |
| 7 | User not in app, notification clicked | Opens Dialogue to relevant context |
