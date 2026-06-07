import type PocketBase from "pocketbase";
import { expandRecurringEventsForWindow } from "./dateUtils";

export interface CompileWeeklyDataArgs {
  userId: string;
  periodStart: number;
  periodEnd: number;
}

export async function compileWeeklyData(
  pb: PocketBase,
  args: CompileWeeklyDataArgs
) {
  const { userId, periodStart, periodEnd } = args;
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // 1. Tasks created/completed in this period
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

  // 2. Events in this period (with recurring expansion)
  const rawEvents = await pb.collection("events").getFullList({
    filter: `user = "${escapedUser}"`,
  });

  const eventsList = expandRecurringEventsForWindow(
    rawEvents,
    periodStart,
    periodEnd
  );

  // 3. Habit logs in this period
  const rawHabits = await pb.collection("habits").getFullList({
    filter: `user = "${escapedUser}"`,
  });

  let habitLogsCompleted = 0;
  let habitLogsSkipped = 0;
  
  for (const h of rawHabits) {
    if (!h.archived) {
      const logs = await pb.collection("habit_logs").getFullList({
        filter: `habit = "${h.id}"`,
      });
      for (const l of logs) {
        if (
          l.dateString >=
            new Date(periodStart).toISOString().slice(0, 10) &&
          l.dateString <= new Date(periodEnd).toISOString().slice(0, 10)
        ) {
          if (l.status === "completed") habitLogsCompleted++;
          else habitLogsSkipped++;
        }
      }
    }
  }

  // 4. Daily session summaries for this period
  const sessionSummaries = await pb.collection("session_summaries").getFullList({
    filter: `user = "${escapedUser}"`,
  });

  const filteredSummaries = sessionSummaries.filter((s: any) => {
    const date = new Date(s.date + "T00:00:00");
    const ts = date.getTime();
    return ts >= periodStart && ts <= periodEnd;
  });

  // 5. Category count
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

  // 6. Streak calculation
  const thirtyDaysAgo = periodEnd - 30 * 24 * 3600 * 1000;
  const recentCompleted = rawTasks.filter(
    (t: any) =>
      t.completed &&
      t.completedAt !== undefined &&
      t.completedAt !== null &&
      t.completedAt >= thirtyDaysAgo &&
      t.completedAt <= periodEnd
  );
  
  const activeDates = new Set<string>();
  for (const t of recentCompleted) {
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

  // Build formatted details for LLM consumption
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

  const createdTasksDetails = tasksCreatedList
    .filter((t: any) => !t.completed)
    .map((t: any) => {
      const createdStr = `Created: ${formatTaskDate(t.createdAt)}`;
      const dueStr = t.dueDateStr || t.dueDate ? `, Due: ${fmtDate(t)}` : "";
      return `- [Task] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}]${t.notes ? `\n  Notes: ${t.notes.split("\n").join("\n  ")}` : ""}`;
    })
    .join("\n");

  const eventsDetails = eventsList
    .map((e: any) => {
      return `- [Event] ${e.title} at ${new Date(e.startTime).toLocaleTimeString()}${e.outcome ? ` (Outcome: ${e.outcome})` : ""}${e.cancelled ? " [CANCELLED]" : ""}`;
    })
    .join("\n");

  const summariesText = filteredSummaries
    .map((s: any) => `[${s.date}]: ${s.summary}`)
    .join("\n");

  return {
    tasksCompleted: tasksCompletedList.length,
    tasksCreated: tasksCreatedList.length,
    eventsAttended: eventsList.filter((e: any) => !e.cancelled).length,
    habitLogsCompleted,
    habitLogsSkipped,
    topCategories,
    streakDays: streak,
    rawDetails: [
      `COMPLETED TASKS (${tasksCompletedList.length}):\n${completedTasksDetails || "None."}`,
      `PENDING/INCOMPLETE TASKS (${tasksCreatedList.length - tasksCompletedList.length}):\n${createdTasksDetails || "None."}`,
      `EVENTS (${eventsList.length}):\n${eventsDetails || "None."}`,
      `HABITS: Completed: ${habitLogsCompleted} | Skipped: ${habitLogsSkipped}`,
      `DAILY SESSION SUMMARIES:\n${summariesText || "No session summaries recorded."}`,
    ].join("\n\n"),
  };
}
