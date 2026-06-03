import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily session summary: runs every hour, schedules users at their local 23:59
crons.cron(
  "daily-session-summary",
  "0 * * * *",
  internal.dailySummary.cronTriggerDaily,
  {}
);

// Weekly OCEAN digest: runs every hour, schedules users at their local Monday
crons.cron(
  "weekly-ocean",
  "5 * * * 1",
  internal.ocean.cronTriggerWeekly,
  {}
);

// Weekly Reflection: runs every hour, schedules users at their local Monday
crons.cron(
  "weekly-reflection",
  "15 * * * 1",
  internal.reflections.cronTriggerWeeklyReflection,
  {}
);

// Monthly OCEAN: runs on the 1st of every month at 00:05 UTC
crons.cron(
  "monthly-ocean",
  "5 0 1 * *",
  internal.ocean.cronTriggerMonthly,
  {}
);

// Monthly Reflection: runs on the 1st of every month at 00:10 UTC
crons.cron(
  "monthly-reflection",
  "10 0 1 * *",
  internal.reflections.cronTriggerMonthlyReflection,
  {}
);

// Daily scan for unlogged habits: runs every day at 8:00 PM (20:00) UTC
crons.cron(
  "daily-habit-reminders",
  "0 20 * * *",
  internal.notifications.triggerDailyHabitReminders,
  {}
);

// Yearly Reflection: runs December 27-30 at 23:55 UTC
// Dec 27-30 instead of 28-31 to handle UTC+13 users (e.g., Pacific/Auckland)
crons.cron(
  "yearly-reflection",
  "55 23 27-30 12 *",
  internal.reflections.cronTriggerYearlyReflection,
  {}
);

export default crons;
