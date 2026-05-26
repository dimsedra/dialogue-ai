import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { getSegmentBounds } from "./notes_action";

const modules = {
  "convex/notes.ts": () => import("./notes"),
  "convex/notes_action.ts": () => import("./notes_action"),
  "convex/ai.ts": () => import("./ai"),
  "convex/_generated/api.ts": () => import("./_generated/api"),
};

describe("Notes Pyramid (Note-Scan) System", () => {
  test("Segment bounds calculation helper", () => {
    // We mock UTC+7 timezone (timezoneOffset = -420)
    // Date: 2026-05-08 00:05:00 UTC (which is 2026-05-08 07:05:00 local time)
    const time8th = Date.UTC(2026, 4, 8, 0, 5, 0, 0); // May 8, 2026
    const bounds1 = getSegmentBounds(time8th, -420);
    expect(bounds1.segment).toBe(1);
    expect(bounds1.startDay).toBe(1);
    expect(bounds1.endDay).toBe(7);
    expect(bounds1.year).toBe(2026);
    expect(bounds1.month).toBe(4); // May (0-indexed)

    // Date: 2026-05-15 00:05:00 UTC
    const time15th = Date.UTC(2026, 4, 15, 0, 5, 0, 0);
    const bounds2 = getSegmentBounds(time15th, -420);
    expect(bounds2.segment).toBe(2);
    expect(bounds2.startDay).toBe(8);
    expect(bounds2.endDay).toBe(14);

    // Date: 2026-05-22 00:05:00 UTC
    const time22nd = Date.UTC(2026, 4, 22, 0, 5, 0, 0);
    const bounds3 = getSegmentBounds(time22nd, -420);
    expect(bounds3.segment).toBe(3);
    expect(bounds3.startDay).toBe(15);
    expect(bounds3.endDay).toBe(21);

    // Date: 2026-06-01 00:05:00 UTC (runs Segment 4 of previous month: May 22 to May 31)
    const time1st = Date.UTC(2026, 5, 1, 0, 5, 0, 0);
    const bounds4 = getSegmentBounds(time1st, -420);
    expect(bounds4.segment).toBe(4);
    expect(bounds4.startDay).toBe(22);
    expect(bounds4.endDay).toBe(31); // May has 31 days
    expect(bounds4.month).toBe(4); // previous month (May)

    // On-demand: Day 12 of the month
    const time12th = Date.UTC(2026, 4, 12, 10, 0, 0, 0);
    const boundsOnDemand = getSegmentBounds(time12th, -420);
    expect(boundsOnDemand.segment).toBe(2);
    expect(boundsOnDemand.startDay).toBe(8);
    expect(boundsOnDemand.endDay).toBe(12); // manual runs up to current day
  });

  test("saveWeeklySummary, saveMonthlySummary, saveBehavioralProfile mutations", async () => {
    const t = convexTest(schema, modules);

    // Insert mock user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {});
    });

    const client = t.withIdentity({ subject: userId });

    // 1. Save weekly summaries
    await client.mutation(api.notes.saveWeeklySummary, {
      userId,
      summary: "Weekly pattern: Auth rewrite complexity.",
    });
    await client.mutation(api.notes.saveWeeklySummary, {
      userId,
      summary: "Weekly pattern: Focused working blocks.",
    });

    let profile = await client.query(api.ai.getProfile, { userId });
    expect(profile?.weeklyNotesSummaries).toEqual([
      "Weekly pattern: Auth rewrite complexity.",
      "Weekly pattern: Focused working blocks.",
    ]);
    expect(profile?.monthlyNotesSummaries).toBeUndefined();

    // 2. Save monthly summary (should clear weekly summaries)
    await client.mutation(api.notes.saveMonthlySummary, {
      userId,
      summary: "Monthly pattern: High early velocity, late crunch.",
    });

    profile = await client.query(api.ai.getProfile, { userId });
    expect(profile?.weeklyNotesSummaries).toEqual([]);
    expect(profile?.monthlyNotesSummaries).toEqual([
      "Monthly pattern: High early velocity, late crunch.",
    ]);

    // 3. Save behavioral profile (should clear monthly summaries)
    await client.mutation(api.notes.saveBehavioralProfile, {
      userId,
      profile: "User profile: Tends to start projects with high scope, reduces scope later.",
    });

    profile = await client.query(api.ai.getProfile, { userId });
    expect(profile?.monthlyNotesSummaries).toEqual([]);
    expect(profile?.behavioralProfile).toBe(
      "User profile: Tends to start projects with high scope, reduces scope later."
    );
  });

  test("recentActivityFeed query and workspace name resolution", async () => {
    const t = convexTest(schema, modules);

    // Setup user and workspaces
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {});
    });

    const devWorkspaceId = await t.run(async (ctx) => {
      return await ctx.db.insert("workspaces", {
        userId,
        name: "Dev Workspace",
        icon: "💻",
        color: "blue",
        createdAt: Date.now(),
      });
    });

    const personalWorkspaceId = await t.run(async (ctx) => {
      return await ctx.db.insert("workspaces", {
        userId,
        name: "Personal",
        icon: "🏠",
        color: "green",
        createdAt: Date.now(),
      });
    });

    const client = t.withIdentity({ subject: userId });

    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    // 1. Insert tasks
    await t.run(async (ctx) => {
      // Recent task with notes (should match)
      await ctx.db.insert("tasks", {
        userId,
        text: "Task A",
        workspaceId: devWorkspaceId,
        completed: false,
        notes: "Complexity exploded in auth",
        createdAt: threeDaysAgo,
      });

      // Older completed task (should not match)
      await ctx.db.insert("tasks", {
        userId,
        text: "Task B",
        workspaceId: devWorkspaceId,
        completed: true,
        completedAt: tenDaysAgo,
        notes: "Finished older task",
        createdAt: tenDaysAgo,
      });

      // Recent task without notes (should not match notes pyramid)
      await ctx.db.insert("tasks", {
        userId,
        text: "Task C",
        workspaceId: devWorkspaceId,
        completed: false,
        createdAt: threeDaysAgo,
      });
    });

    // 2. Insert events
    await t.run(async (ctx) => {
      // Recent event with notes (should match)
      await ctx.db.insert("events", {
        userId,
        title: "Presentation",
        startTime: threeDaysAgo,
        notes: "Prepped slides",
        createdAt: threeDaysAgo,
        workspaceId: devWorkspaceId,
      });

      // Older event (should not match)
      await ctx.db.insert("events", {
        userId,
        title: "Old Meeting",
        startTime: tenDaysAgo,
        notes: "Old meeting notes",
        createdAt: tenDaysAgo,
        workspaceId: devWorkspaceId,
      });
    });

    // 3. Insert habits & habit logs
    await t.run(async (ctx) => {
      const habitId = await ctx.db.insert("habits", {
        userId,
        name: "Morning Run",
        workspaceId: personalWorkspaceId,
        frequency: "daily",
        frequencyConfig: {},
        currentStreak: 1,
        longestStreak: 1,
        archived: false,
        createdAt: tenDaysAgo,
      });

      // Recent habit log with notes (should match)
      await ctx.db.insert("habitLogs", {
        userId,
        habitId,
        timestamp: threeDaysAgo,
        dateString: "2026-05-24",
        status: "completed",
        notes: "Felt great after running",
      });

      // Older habit log (should not match)
      await ctx.db.insert("habitLogs", {
        userId,
        habitId,
        timestamp: tenDaysAgo,
        dateString: "2026-05-17",
        status: "completed",
        notes: "Older run notes",
      });
    });

    // 4. Query recentActivityFeed
    const feed = await client.query(api.notes.recentActivityFeed, {
      userId,
      startTime: now - 7 * 24 * 60 * 60 * 1000,
      endTime: now,
    });

    // Should contain exactly 3 items: Task A, Presentation, and Morning Run log
    expect(feed.length).toBe(3);

    const taskItem = feed.find((i: any) => i.entityType === "task");
    expect(taskItem).toBeDefined();
    expect(taskItem?.entityName).toBe("Task A");
    expect(taskItem?.workspaceName).toBe("Dev Workspace");
    expect(taskItem?.noteText).toBe("Complexity exploded in auth");

    const eventItem = feed.find((i: any) => i.entityType === "event");
    expect(eventItem).toBeDefined();
    expect(eventItem?.entityName).toBe("Presentation");
    expect(eventItem?.workspaceName).toBe("Dev Workspace");
    expect(eventItem?.noteText).toBe("Prepped slides");

    const habitItem = feed.find((i: any) => i.entityType === "habit");
    expect(habitItem).toBeDefined();
    expect(habitItem?.entityName).toBe("Morning Run");
    expect(habitItem?.workspaceName).toBe("Personal");
    expect(habitItem?.noteText).toBe("Felt great after running");
  });
});
