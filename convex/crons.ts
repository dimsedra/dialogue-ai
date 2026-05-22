import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run weekly reflection trigger every Sunday at 18:00 (6:00 PM) UTC/Local
crons.cron(
  "weekly-reflections-trigger",
  "0 18 * * 0",
  internal.reflections.cronTriggerWeekly,
  {}
);

// Run monthly reflection trigger on the 1st of every month at 00:01 (12:01 AM)
crons.cron(
  "monthly-reflections-trigger",
  "1 0 1 * *",
  internal.reflections.cronTriggerMonthly,
  {}
);

export default crons;
