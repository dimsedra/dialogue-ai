import type PocketBase from "pocketbase";
import { expandRecurringEventsForWindow } from "./dateUtils";

export interface CompileReflectionStatsArgs {
  userId: string;
  type: "weekly" | "monthly" | "yearly";
  periodStart: number;
  periodEnd: number;
}

export async function compileReflectionStats(
  pb: PocketBase,
  args: CompileReflectionStatsArgs
) {
  const { userId, type, periodStart, periodEnd } = args;
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // --- PYRAMID SYNTHESIS ---
  // If Monthly or Yearly, read existing sub-reflections to aggregate stats & summaries
  if (type === "monthly" || type === "yearly") {
    const subType = type === "monthly" ? "weekly" : "monthly";
    const subReflections = await pb.collection("reflections").getFullList({
      filter: `user = "${escapedUser}" && type = "${subType}" && periodStart >= ${periodStart} && periodEnd <= ${periodEnd}`,
      sort: "+periodStart",
    });

    if (subReflections.length > 0) {
      let tasksCompleted = 0;
      let tasksCreated = 0;
      let eventsAttended = 0;
      let habitLogsCompleted = 0;
      let habitLogsSkipped = 0;
      let habitStreakDays = 0;
      const categoryCounts: Record<string, number> = {};
      const summaries: string[] = [];
      let maxStreak = 0;

      for (const ref of subReflections) {
        const stats = (ref.stats as any) || {};
        tasksCompleted += stats.tasksCompleted || 0;
        tasksCreated += stats.tasksCreated || 0;
        eventsAttended += stats.eventsAttended || 0;
        habitLogsCompleted += stats.habitLogsCompleted || 0;
        habitLogsSkipped += stats.habitLogsSkipped || 0;
        habitStreakDays = Math.max(habitStreakDays, stats.habitStreakDays || 0);
        maxStreak = Math.max(maxStreak, stats.streakDays || 0);

        if (stats.topCategories && Array.isArray(stats.topCategories)) {
          for (const cat of stats.topCategories) {
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          }
        }
        summaries.push(
          `[${ref.periodLabel}]:\nStats: Tasks completed: ${stats.tasksCompleted || 0}, events: ${stats.eventsAttended || 0}, habits completed: ${stats.habitLogsCompleted || 0}.\nSummary: ${ref.summary}\nUser Feedback: ${ref.userReflection || "None"}`
        );
      }

      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((entry) => entry[0]);

      return {
        tasksCompleted,
        tasksCreated,
        eventsAttended,
        habitLogsCompleted,
        habitLogsSkipped,
        habitStreakDays,
        topCategories,
        streakDays: maxStreak,
        subSummaries: summaries.join("\n\n"),
        rawDetails: undefined,
      };
    }
  }

  // --- WEEKLY OR FALLBACK RAW CALCULATION ---
  // 1. Query all tasks created or completed in this period
  const rawTasks = await pb.collection("tasks").getFullList({
    filter: `user = "${escapedUser}"`,
  });

  const tasksCreatedList = rawTasks.filter(
    (t: any) => t.createdAt >= periodStart && t.createdAt <= periodEnd
  );

  const tasksCompletedList = rawTasks.filter(
    (t: any) =>
      t.completed &&
      t.completedAt !== undefined &&
      t.completedAt !== null &&
      t.completedAt >= periodStart &&
      t.completedAt <= periodEnd
  );

  // 2. Query events in this period
  const rawEvents = await pb.collection("events").getFullList({
    filter: `user = "${escapedUser}"`,
  });

  const eventsList = expandRecurringEventsForWindow(
    rawEvents,
    periodStart,
    periodEnd
  );

  // 3. Category count
  const categoryCounts: Record<string, number> = {};
  for (const t of tasksCompletedList) {
    if (t.category) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }
  }
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((entry) => entry[0]);

  // 4. Calculate streak (consecutive days with completed tasks in the last 30 days up to periodEnd)
  const thirtyDaysAgo = periodEnd - 30 * 24 * 3600 * 1000;
  const recentCompletedTasks = rawTasks.filter(
    (t: any) =>
      t.completed &&
      t.completedAt !== undefined &&
      t.completedAt !== null &&
      t.completedAt >= thirtyDaysAgo &&
      t.completedAt <= periodEnd
  );

  const activeDates = new Set<string>();
  for (const t of recentCompletedTasks) {
    activeDates.add(new Date(t.completedAt).toDateString());
  }
  for (const e of eventsList) {
    activeDates.add(new Date(e.startTime).toDateString());
  }

  let streak = 0;
  const checkDate = new Date(periodEnd);
  while (activeDates.has(checkDate.toDateString())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // 5. Habit stats for the period
  const rawHabits = await pb.collection("habits").getFullList({
    filter: `user = "${escapedUser}"`,
  });

  let habitLogsCompletedTotal = 0;
  let habitLogsSkippedTotal = 0;
  let habitStreakDaysTotal = 0;

  for (const h of rawHabits) {
    if (!h.archived) {
      habitStreakDaysTotal = Math.max(habitStreakDaysTotal, h.currentStreak || 0);
      const logs = await pb.collection("habit_logs").getFullList({
        filter: `habit = "${h.id}"`,
      });

      for (const l of logs) {
        if (
          l.dateString >=
            new Date(periodStart).toISOString().slice(0, 10) &&
          l.dateString <= new Date(periodEnd).toISOString().slice(0, 10)
        ) {
          if (l.status === "completed") habitLogsCompletedTotal++;
          else habitLogsSkippedTotal++;
        }
      }
    }
  }

  const formatTaskDate = (ts?: number) => {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleString("en-US", { hour12: false });
  };

  const fmtDate = (t: { dueDateStr?: string; dueDate?: number }) =>
    t.dueDateStr || (t.dueDate ? formatTaskDate(t.dueDate) : "");

  const completedTasksDetails = tasksCompletedList
    .map((t: any) => {
      const createdStr = `Created: ${formatTaskDate(t.createdAt)}`;
      const dueStr = t.dueDateStr || t.dueDate ? `, Due: ${fmtDate(t)}` : "";
      const completedStr = t.completedAt
        ? `, Completed: ${formatTaskDate(t.completedAt)}`
        : "";
      return `- [Task] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}${completedStr}]${t.notes ? `\n  Notes: ${t.notes.split("\n").join("\n  ")}` : ""}`;
    })
    .join("\n");

  const eventsDetails = eventsList
    .map((e: any) => {
      return `- [Event] ${e.title} at ${new Date(e.startTime).toLocaleTimeString()}${e.outcome ? ` (Outcome: ${e.outcome})` : ""}${e.cancelled ? " [CANCELLED]" : ""}`;
    })
    .join("\n");

  const rawDetails = `COMPLETED TASKS:\n${completedTasksDetails || "None."}\n\nEVENTS IN PERIOD:\n${eventsDetails || "None."}\n\nHABITS COMPLETED: ${habitLogsCompletedTotal} | HABITS SKIPPED: ${habitLogsSkippedTotal} | BEST HABIT STREAK: ${habitStreakDaysTotal} day(s)\n\nCRITICAL TIMELINESS RULE: To evaluate if a task was completed fast or late, you MUST compare the Completion time against the Due Date, not the Creation time. A large gap between Creation and Completion does not mean the user procrastinated if the task was completed before its Due Date. Emphasize and heavily weight High Priority tasks in your summaries.`;

  return {
    tasksCompleted: tasksCompletedList.length,
    tasksCreated: tasksCreatedList.length,
    eventsAttended: eventsList.filter((e: any) => !e.cancelled).length,
    habitLogsCompleted: habitLogsCompletedTotal,
    habitLogsSkipped: habitLogsSkippedTotal,
    habitStreakDays: habitStreakDaysTotal,
    topCategories,
    streakDays: streak,
    rawDetails,
  };
}
