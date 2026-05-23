# Native Habits Tracking System

This document outlines the architecture, data schemas, streak calculation algorithms, API endpoints, agent tool integrations, and UI/UX design specifications for introducing first-class Habit tracking in Dialogue AI.

---

## 1. Core Philosophy: Tasks vs. Events vs. Habits

To build a true lifestyle operating system, Dialogue must differentiate routines and habitual actions from one-off tasks and scheduled calendar events:

| Attribute | Task | Event | Habit (Routine) |
| :--- | :--- | :--- | :--- |
| **Semantic Meaning** | Action-oriented | Time-oriented | Identity-oriented |
| **Terminality** | Terminal (Done / Not Done) | Terminal (Attended / Missed) | Perpetual (Continuous consistency) |
| **Scheduling** | Due Dates (flexible list) | Hard calendar blocks | Recurring frequency (daily, weekly, weekdays, custom) |
| **Primary Metric** | Completion rate | Attendance / Focus time | **Consistency Score (%) & Streak Length** |
| **Failure Mode** | Overdue | Missed Event | Broken Streak |

By elevating Habits to a first-class citizen, we avoid cluttering the task list with daily repetitions (e.g. *"skincare"* or *"do lead gen"*), and we give Dialogue native visibility into the user's consistency patterns.

---

## 2. How Habits Compound the Dialogue OS

Integrating Habits is not just about adding a tracker; it creates positive feedback loops (flywheels) where habits feed directly into other parts of the AI:

### Flywheel 1: The Contextual Coaching Loop (Logs ──> Memory ──> Chat)
Dialogue’s semantic memory is typically passive—updated only when you tell it something. Habit logs provide a structured stream of **behavioral data**, which is far more objective than verbal claims.
* **The Cycle**: The user logs habit completions daily.
* **Semantic Synthesis**: During periodic background refactoring, the agent notices: *"User skipped 'Skincare' and 'Read 10 pages' on three consecutive days when work tasks in the Work workspace exceeded 5 completions."* It records a memory: *“User tends to sacrifice personal care and evening routines under high professional workloads.”*
* **Coaching Injection**: When Dialogue detects a highly-packed calendar for the day, it preemptively coach-intervenes:
  > *"You have 6 high-priority tasks in your Work workspace today. Based on past patterns, this is when your skincare routine is most likely to get dropped. Let's block out 15 minutes at 9:00 PM to protect that habit before you get too tired. Sound good?"*

### Flywheel 2: The Reflection & Multi-Horizon Analysis Loop
Today, weekly and monthly reflections are lists of completed tasks and events. With habits, reflections gain a **durable consistency metric** that connects micro-behaviors to macro-outcomes.
* **Integrated Analysis**: The reflection compiler queries `habitLogs` for the week/month and overlays them with task outcomes and event records.
* **The Output**:
  ```markdown
  ROUTINES & CONSISTENCY:
  - Lead Generation: 5/5 days (100% consistency). Streak: 12 weekdays.
  - Skincare: 3/7 days (42% consistency). Streak: Broken on Tuesday.
  
  INSIGHTS:
  - Your 100% consistency on Lead Generation directly correlated with 4 new sales inquiries 
    on Wednesday and Thursday.
  - Skincare fell off on Tuesday and Thursday evenings when your work session lasted past 10 PM.
  ```

### Flywheel 3: Threat-Detection & Loss Aversion (Streak Protection)
Psychologically, people are highly motivated by loss aversion (not wanting to break a streak).
* **The Integration**: The notification subsystem checks habit status in the late evening.
* **Contextual Alerting**: Instead of generic notifications, Dialogue uses the active streak context to trigger action:
  > *"You are on a 14-day streak for 'Generate Leads'. Don't let Friday break your momentum. It only takes 10 minutes to keep it alive. Ready to log?"*

### Flywheel 4: Dynamic Daily Blueprinting
Habits represent your structural template, while Tasks and Events represent real-time reality.
* **The Integration**: During the morning standup, the agent retrieves active habits for the day alongside calendar events and tasks.
* **The Blueprint**: It proposes a realistic, integrated layout for the day:
  > *"You have a client meeting at 10 AM and a coding task due by 4 PM. Let's schedule your 30-minute 'Generate Leads' habit right after the client meeting while your energy is high, leaving the late afternoon for quiet code focus."*

---

## 3. Convex Database Schema

We introduce two new tables: `habits` (definitions and streak aggregates) and `habitLogs` (historical execution logs).

### Schema Definition (`convex/schema.ts`)
```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const habitsSchema = {
  habits: defineTable({
    userId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),         // Per-workspace isolation
    name: v.string(),                                     // e.g., "Generate Leads", "Skincare"
    description: v.optional(v.string()),                  // How to execute the habit
    
    // Frequency Configuration
    frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("custom")),
    frequencyConfig: v.object({
      daysOfWeek: v.optional(v.array(v.number())),        // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      targetCountPerPeriod: v.number(),                   // e.g., 1 (per day) or 3 (per week)
    }),

    // Streak & Cache metrics
    currentStreak: v.number(),                            // Current consecutive completions
    longestStreak: v.number(),                            // All-time high streak record
    lastLoggedAt: v.optional(v.number()),                 // Timestamp of last completion log
    lastLoggedDate: v.optional(v.string()),               // Date string of last log ("YYYY-MM-DD")
    
    archived: v.boolean(),                                // Soft-delete to keep log history
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  habitLogs: defineTable({
    userId: v.id("users"),
    habitId: v.id("habits"),
    timestamp: v.number(),                                // Exact epoch ms when logged
    dateString: v.string(),                               // Timezone-adjusted date "YYYY-MM-DD"
    status: v.union(v.literal("completed"), v.literal("skipped")), // "skipped" acts as a streak freeze
    notes: v.optional(v.string()),                        // Detail about this specific session
  })
    .index("by_user", ["userId"])
    .index("by_habit", ["habitId"])
    .index("by_timestamp", ["timestamp"])
    // Enforces single log per habit per day to prevent double-logging bugs
    .index("by_habit_dateString", ["habitId", "dateString"]), 
};
```

---

## 4. Timezone & Date String Handling

Time is relative to the user's location. A user completing skincare at 11:30 PM in New York is logging on a different date than a user in London.
1. **Frontend Input**: The client application computes the date string locally using `toLocaleDateString('en-CA')` (which outputs `"YYYY-MM-DD"` format) and passes it in the mutation call.
2. **Server Verification**: The server uses this `dateString` to fetch/insert into the `by_habit_dateString` index. This guarantees database consistency and removes complex timezone offset calculations from query boundaries.

---

## 5. Streak Calculation & Freeze Algorithm

A major friction point in habit tracking is losing streaks due to valid pauses (vacation, illness, scheduled days off). We handle this elegantly:
* **Skipped Status**: A log with `status: "skipped"` freezes the streak instead of resetting it to zero.
* **Custom Day Masks**: If a habit is scheduled for Mon-Fri, missing Saturday/Sunday does not reset the streak.

### Streak Calculation Logic (Pseudocode / TypeScript Helper)

```typescript
interface Habit {
  frequency: "daily" | "weekly" | "custom";
  frequencyConfig: {
    daysOfWeek?: number[];
    targetCountPerPeriod: number;
  };
  currentStreak: number;
  longestStreak: number;
  lastLoggedDate?: string;
}

/**
 * Calculates the new streak values when a new completion is logged.
 * @param habit The habit document to update
 * @param logDateString The date string of the completion ("YYYY-MM-DD")
 * @param logStatus The status of the log ("completed" | "skipped")
 * @param skippedDates Set of dates in the range that were logged as "skipped"
 */
export function calculateNewStreak(
  habit: Habit,
  logDateString: string,
  logStatus: "completed" | "skipped",
  skippedDates: Set<string>
): { currentStreak: number; longestStreak: number } {
  // If the log is a "skip", the streak is preserved exactly as is (Streak Freeze)
  if (logStatus === "skipped") {
    return {
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
    };
  }

  const currentLogDate = new Date(logDateString);
  if (isNaN(currentLogDate.getTime())) {
    return { currentStreak: habit.currentStreak, longestStreak: habit.longestStreak };
  }

  // If there's no previous logs, start at 1
  if (!habit.lastLoggedDate) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, habit.longestStreak),
    };
  }

  const prevLogDate = new Date(habit.lastLoggedDate);
  const diffTime = currentLogDate.getTime() - prevLogDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    // Logging again on the same day or a past day, do not increment streak again
    return { currentStreak: habit.currentStreak, longestStreak: habit.longestStreak };
  }

  let expectedPrevDayOffset = 1;
  
  if (habit.frequency === "custom" && habit.frequencyConfig.daysOfWeek) {
    const scheduledDays = habit.frequencyConfig.daysOfWeek; // e.g. [1,2,3,4,5] Mon-Fri
    const currentDayOfWeek = currentLogDate.getDay();       // 0-6
    
    // Compute the scheduled day immediately preceding the current log day
    let checkDate = new Date(currentLogDate);
    let daysToSubtract = 1;
    while (daysToSubtract <= 7) {
      checkDate.setDate(currentLogDate.getDate() - daysToSubtract);
      if (scheduledDays.includes(checkDate.getDay())) {
        expectedPrevDayOffset = daysToSubtract;
        break;
      }
      daysToSubtract++;
    }
  }

  // Collect the active scheduled dates between the last logged date and current date
  let isStreakMaintained = true;
  let cursorDate = new Date(prevLogDate);
  
  for (let i = 1; i < diffDays; i++) {
    cursorDate.setDate(prevLogDate.getDate() + i);
    const dateStr = cursorDate.toISOString().split("T")[0];
    
    // Check if this date was scheduled for this habit
    let isScheduledDay = true;
    if (habit.frequency === "custom" && habit.frequencyConfig.daysOfWeek) {
      isScheduledDay = habit.frequencyConfig.daysOfWeek.includes(cursorDate.getDay());
    }
    
    // If it was scheduled, and it wasn't logged as skipped, the streak is broken
    if (isScheduledDay && !skippedDates.has(dateStr)) {
      isStreakMaintained = false;
      break;
    }
  }

  // Determine if the last completion connects to this one
  const isDirectConnection = diffDays <= expectedPrevDayOffset;

  let newStreak = 1;
  if (isStreakMaintained && (isDirectConnection || Array.from(skippedDates).length > 0)) {
    newStreak = habit.currentStreak + 1;
  }

  return {
    currentStreak: newStreak,
    longestStreak: Math.max(newStreak, habit.longestStreak),
  };
}
```

---

## 6. Convex API Mutations & Queries

Below is the structured draft implementation of `convex/habits.ts`.

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Helper to assert user auth
async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated call");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q: any) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new Error("User record not found");
  return user;
}

// 1. Create a new Habit
export const createHabit = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("custom")),
    frequencyConfig: v.object({
      daysOfWeek: v.optional(v.array(v.number())),
      targetCountPerPeriod: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    return await ctx.db.insert("habits", {
      userId: user._id,
      workspaceId: args.workspaceId,
      name: args.name,
      description: args.description,
      frequency: args.frequency,
      frequencyConfig: args.frequencyConfig,
      currentStreak: 0,
      longestStreak: 0,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

// 2. Log Habit Completion or Skip
export const logHabit = mutation({
  args: {
    habitId: v.id("habits"),
    dateString: v.string(), // "YYYY-MM-DD" passed from client
    status: v.union(v.literal("completed"), v.literal("skipped")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    
    // Check if habit exists and belongs to user
    const habit = await ctx.db.get(args.habitId);
    if (!habit || habit.userId !== user._id) {
      throw new Error("Habit not found or unauthorized");
    }

    // Check if duplicate log already exists for this day
    const existingLog = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit_dateString", (q) =>
        q.eq("habitId", args.habitId).eq("dateString", args.dateString)
      )
      .unique();

    if (existingLog) {
      // If status matches, return existing log. If not, update it
      if (existingLog.status === args.status) {
        return existingLog._id;
      }
      await ctx.db.patch(existingLog._id, {
        status: args.status,
        notes: args.notes ?? existingLog.notes,
        timestamp: Date.now(),
      });
      // Re-trigger streak calculation in production if status toggled
      return existingLog._id;
    }

    // Pull all skipped dates in the intermediate period
    const logs = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit", (q) => q.eq("habitId", args.habitId))
      .order("desc")
      .take(30);

    const skippedDates = new Set<string>(
      logs.filter((l) => l.status === "skipped").map((l) => l.dateString)
    );

    // Calculate streaks
    const { currentStreak, longestStreak } = calculateNewStreak(
      habit,
      args.dateString,
      args.status,
      skippedDates
    );

    // Patch habit stats
    await ctx.db.patch(args.habitId, {
      currentStreak,
      longestStreak,
      lastLoggedAt: Date.now(),
      lastLoggedDate: args.dateString,
    });

    // Write log entry
    return await ctx.db.insert("habitLogs", {
      userId: user._id,
      habitId: args.habitId,
      timestamp: Date.now(),
      dateString: args.dateString,
      status: args.status,
      notes: args.notes,
    });
  },
});

// Helper for local calculations
function calculateNewStreak(habit: any, dateString: string, status: string, skippedDates: Set<string>) {
  if (status === "skipped") {
    return { currentStreak: habit.currentStreak, longestStreak: habit.longestStreak };
  }
  
  if (!habit.lastLoggedDate) {
    return { currentStreak: 1, longestStreak: Math.max(1, habit.longestStreak) };
  }

  const currentLogDate = new Date(dateString);
  const prevLogDate = new Date(habit.lastLoggedDate);
  const diffDays = Math.floor((currentLogDate.getTime() - prevLogDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return { currentStreak: habit.currentStreak, longestStreak: habit.longestStreak };
  }

  // Basic check for consecutive calendar days
  if (diffDays === 1) {
    const nextStreak = habit.currentStreak + 1;
    return { currentStreak: nextStreak, longestStreak: Math.max(nextStreak, habit.longestStreak) };
  }

  // Check if intermediate days were skipped (streak freeze)
  let preserved = true;
  for (let i = 1; i < diffDays; i++) {
    const intermediate = new Date(prevLogDate);
    intermediate.setDate(prevLogDate.getDate() + i);
    const dateStr = intermediate.toISOString().split("T")[0];
    if (!skippedDates.has(dateStr)) {
      preserved = false;
      break;
    }
  }

  const nextStreak = preserved ? habit.currentStreak + 1 : 1;
  return { currentStreak: nextStreak, longestStreak: Math.max(nextStreak, habit.longestStreak) };
}

// 3. Get Active Habits list for a user / workspace
export const getHabits = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    let query = ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id));
      
    const results = await query.collect();
    // Filter by workspace and remove archived items
    return results.filter(
      (h) => h.workspaceId === args.workspaceId && !h.archived
    );
  },
});

// 4. Calculate Habit Consistency percentages over a period
export const getHabitConsistency = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    periodStartDate: v.string(), // "YYYY-MM-DD"
    periodEndDate: v.string(),   // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const habits = await ctx.db
      .query("habits")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();

    const activeHabits = habits.filter(
      (h) => h.workspaceId === args.workspaceId && !h.archived
    );

    const reports = [];
    for (const habit of activeHabits) {
      const logs = await ctx.db
        .query("habitLogs")
        .withIndex("by_habit", (q) => q.eq("habitId", habit._id))
        .collect();

      const filteredLogs = logs.filter(
        (l) => l.dateString >= args.periodStartDate && l.dateString <= args.periodEndDate
      );

      const completedCount = filteredLogs.filter((l) => l.status === "completed").length;
      const skippedCount = filteredLogs.filter((l) => l.status === "skipped").length;

      reports.push({
        habitId: habit._id,
        name: habit.name,
        currentStreak: habit.currentStreak,
        longestStreak: habit.longestStreak,
        completedCount,
        skippedCount,
      });
    }

    return reports;
  },
});
```

---

## 7. Agent Tool Specifications (System Triggers)

The model needs access to specific tools to interact with this schema. Crucially, the **Verification Protocol** must exempt these tools to prevent friction.

### 7.1. Rule Verification Exemption
* **Rule**: Dialogue **MUST NOT** prompt a validation gate or confirmation dialog when calling `log_habit` or `get_habit_consistency`. The tool must run silently behind the scenes, and the completion should be acknowledged naturally in conversation.
* **Exempted Tools**: `log_habit`, `get_habit_consistency`.
* **Standard Gate Tools**: `create_habit` (should ask for conformation: *"I've set up a new habit 'Lead Gen' for you. Do you want to schedule it?"*).

### 7.2. Tool JSON Schemas (Convex & LM Studio API Compatibility)

```json
[
  {
    "name": "create_habit",
    "description": "Creates a new habit routine for the user in the active workspace. Do not use for one-off tasks.",
    "parameters": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The concise name of the habit, e.g., 'Generate Leads', 'Skincare'."
        },
        "description": {
          "type": "string",
          "description": "Optional instructions on how the user likes to fulfill this routine."
        },
        "frequency": {
          "type": "string",
          "enum": ["daily", "weekly", "custom"],
          "description": "How often the habit is scheduled."
        },
        "frequencyConfig": {
          "type": "object",
          "properties": {
            "daysOfWeek": {
              "type": "array",
              "items": { "type": "number" },
              "description": "For custom frequency: Array of active days (0=Sun, 1=Mon, ..., 6=Sat)."
            },
            "targetCountPerPeriod": {
              "type": "number",
              "description": "Target completions in the period (normally 1 for daily/custom)."
            }
          },
          "required": ["targetCountPerPeriod"]
        }
      },
      "required": ["name", "frequency", "frequencyConfig"]
    }
  },
  {
    "name": "log_habit",
    "description": "Logs an execution instance (completion or skip) for an active habit. Runs silently without confirmation.",
    "parameters": {
      "type": "object",
      "properties": {
        "habitId": {
          "type": "string",
          "description": "The unique Convex ID of the habit."
        },
        "dateString": {
          "type": "string",
          "description": "The local date string of completion in YYYY-MM-DD format."
        },
        "status": {
          "type": "string",
          "enum": ["completed", "skipped"],
          "description": "'completed' logs completion. 'skipped' logs a plan-approved skip to freeze streaks."
        },
        "notes": {
          "type": "string",
          "description": "Optional details about the execution, e.g., 'Generated 12 leads from LinkedIn'."
        }
      },
      "required": ["habitId", "dateString", "status"]
    }
  },
  {
    "name": "get_habit_consistency",
    "description": "Queries consistency percentages, streak metadata, and log details. Runs silently.",
    "parameters": {
      "type": "object",
      "properties": {
        "periodStartDate": {
          "type": "string",
          "description": "Query boundary start in YYYY-MM-DD format."
        },
        "periodEndDate": {
          "type": "string",
          "description": "Query boundary end in YYYY-MM-DD format."
        }
      },
      "required": ["periodStartDate", "periodEndDate"]
    }
  }
]
```

---

## 8. UX/UI Visual Design Architecture

To deliver a premium, high-fidelity experience, the Habits dashboard must look alive and highly polished.

```
┌────────────────────────────────────────────────────────┐
│  HABITS WORKSPACE                                      │
│                                                        │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │ Skincare  🔥 12 days   │   │ Lead Gen  🔥 5 days  │  │
│  │ ◯ 85% Weekly Progress │   │ ◯ 100% weekdays      │  │
│  └───────────────────────┘   └──────────────────────┘  │
│                                                        │
│  LAST 30 DAYS CONSISTENCY                              │
│  ░ ░ ▒ █ █ ░ █ █ █ ░ █ █ █ █ █ █ █ ░ ░ ▒ █ █ █ █ █     │
│  (Faded = Missed, Blue/Green = Completed, Gray = Skip) │
└────────────────────────────────────────────────────────┘
```

1. **GitHub-Style Contribution Grid**:
   - Displays a rolling 30-day row of blocks representing log states.
   - **Color Key**:
     - *Faded border / transparent background*: Unlogged / Missed.
     - *Vibrant Accent (emerald/cyan)*: Completed (opacity scaled by the quantity of notes/notes length to show effort).
     - *Deep Neutral (charcoal/gray)*: Skipped (clearly indicating streak-protection freeze).
2. **Circular Progress Rings**:
   - SVG rings indicating the current week’s target progression (e.g. 3 of 5 days completed).
   - Rendered using CSS variables with linear gradient paths (`stroke-dasharray`) and subtle shadow drops for depth.
3. **Streak Flame Micro-Animations**:
   - Habits with streaks exceeding 5 days show a micro-animation icon.
   - Using CSS keyframe transformations, a subtle flame particle emitter (orange-to-magenta glow) pulsates gently on hover, providing tactile satisfaction.
4. **Quick-Action Toggle Card**:
   - Compact dashboard widgets allowing the user to mark a habit as "Completed" or "Skipped" in one click directly from the main workspace stream. Triggering this sends immediate optimistic UI updates before syncing with the backend.
