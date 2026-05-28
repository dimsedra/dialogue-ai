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

// Weekly OCEAN + Reflections: runs every hour, schedules users at their local Monday
crons.cron(
  "weekly-ocean-reflections",
  "5 * * * 1",
  internal.ocean.cronTriggerWeekly,
  {}
);

// Monthly OCEAN: runs on the 1st of every month at 00:05 UTC
// (monthly is less timezone-sensitive — one global run is fine)
crons.cron(
  "monthly-ocean",
  "5 0 1 * *",
  internal.ocean.cronTriggerMonthly,
  {}
);

export default crons;
