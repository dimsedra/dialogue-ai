import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Patch the prototype of GoogleGenerativeAI if GEMINI_API_KEY is not defined
if (!process.env.GEMINI_API_KEY) {
  GoogleGenerativeAI.prototype.getGenerativeModel = function (config: any) {
    return {
      generateContent: async (prompt: string) => {
        return {
          response: {
            text: () => "Mocked LLM Distillation: User showed consistent gym progress despite a rest and missed day. Task velocity was high early on, but hit a blocker on Auth leakage on Day 4 leading to a due date extension. Sprint planning concluded, while Client Demo was postponed by the client.",
          },
        };
      },
    } as any;
  };
}

const modules = {
  "convex/notes.ts": () => import("./notes"),
  "convex/notes_action.ts": () => import("./notes_action"),
  "convex/ai.ts": () => import("./ai"),
  "convex/_generated/api.ts": () => import("./_generated/api"),
};

describe("Notes Pyramid Stress Test (Option A)", () => {
  test("Stress testing 1-week timeline ingestion and pyramid segment compilation", async () => {
    if (!process.env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY = "dummy-key-for-testing";
    }
    const t = convexTest(schema, modules);

    // 1. Create mock user & userProfile
    const userId = await t.run(async (ctx) => {
      const uId = await ctx.db.insert("users", {});
      await ctx.db.insert("userProfile", {
        userId: uId,
        name: "Test Developer",
        bio: "Test bio details",
        preferences: {},
        weeklyNotesSummaries: [],
        monthlyNotesSummaries: [],
        behavioralProfile: "Initial developer profile.",
      });
      return uId;
    });

    const client = t.withIdentity({ subject: userId });

    // 2. Setup workspaces
    const { devWorkspaceId, personalWorkspaceId } = await t.run(async (ctx) => {
      const wId1 = await ctx.db.insert("workspaces", {
        userId,
        name: "Dev Workspace",
        icon: "💻",
        color: "blue",
        createdAt: Date.now(),
      });
      const wId2 = await ctx.db.insert("workspaces", {
        userId,
        name: "Personal",
        icon: "🏠",
        color: "green",
        createdAt: Date.now(),
      });
      return { devWorkspaceId: wId1, personalWorkspaceId: wId2 };
    });

    // 3. Define dates (May 1 to May 7, 2026)
    // May 8 is our trigger/query date
    const day1 = Date.UTC(2026, 4, 1, 9, 0, 0);  // May 1, 2026
    const day2 = Date.UTC(2026, 4, 2, 9, 0, 0);  // May 2, 2026
    const day3 = Date.UTC(2026, 4, 3, 9, 0, 0);  // May 3, 2026
    const day4 = Date.UTC(2026, 4, 4, 9, 0, 0);  // May 4, 2026
    const day5 = Date.UTC(2026, 4, 5, 9, 0, 0);  // May 5, 2026
    const day6 = Date.UTC(2026, 4, 6, 9, 0, 0);  // May 6, 2026
    const day7 = Date.UTC(2026, 4, 7, 9, 0, 0);  // May 7, 2026
    const queryDate = Date.UTC(2026, 4, 8, 0, 5, 0); // May 8, 2026

    // 4. Seed Daily Gym Habit and logs
    const gymHabitId = await t.run(async (ctx) => {
      const hId = await ctx.db.insert("habits", {
        userId,
        name: "Daily Gym",
        frequency: "daily",
        frequencyConfig: {},
        currentStreak: 3,
        longestStreak: 3,
        archived: false,
        createdAt: day1,
        workspaceId: personalWorkspaceId,
      });

      // Day 1 Completed
      await ctx.db.insert("habitLogs", {
        userId,
        habitId: hId,
        timestamp: day1,
        dateString: "2026-05-01",
        status: "completed",
        notes: "First day of the week, felt highly motivated.",
      });

      // Day 2 Skipped
      await ctx.db.insert("habitLogs", {
        userId,
        habitId: hId,
        timestamp: day2,
        dateString: "2026-05-02",
        status: "skipped",
        notes: "Muscle soreness, forced rest day.",
      });

      // Day 3 Completed
      await ctx.db.insert("habitLogs", {
        userId,
        habitId: hId,
        timestamp: day3,
        dateString: "2026-05-03",
        status: "completed",
        notes: "Morning cardio, good stamina.",
      });

      // Day 4: Left unlogged / missed

      // Day 5 Completed
      await ctx.db.insert("habitLogs", {
        userId,
        habitId: hId,
        timestamp: day5,
        dateString: "2026-05-05",
        status: "completed",
        notes: "Felt strong during heavy squats.",
      });

      // Day 6 Completed
      await ctx.db.insert("habitLogs", {
        userId,
        habitId: hId,
        timestamp: day6,
        dateString: "2026-05-06",
        status: "completed",
        notes: "Late night workout, low energy but completed.",
      });

      // Day 7 Completed
      await ctx.db.insert("habitLogs", {
        userId,
        habitId: hId,
        timestamp: day7,
        dateString: "2026-05-07",
        status: "completed",
        notes: "Bench press PR set! Felt excellent.",
      });

      return hId;
    });

    // 5. Seed Tasks with rich log histories
    await t.run(async (ctx) => {
      // Task 1: Deploy Auth Service (Not completed, updated notes, due date extended)
      await ctx.db.insert("tasks", {
        userId,
        text: "Deploy Auth Service",
        workspaceId: devWorkspaceId,
        completed: false,
        progress: 90,
        statusHook: "Blocked by auth session leakage",
        dueDate: Date.UTC(2026, 4, 8, 17, 0, 0),
        createdAt: day1,
        notes: "[2026-05-02 09:00] OAuth session handling complexity exploded.\n[2026-05-04 14:00] Failing test cases in dev integration suite, blocker.\n[2026-05-05 10:00] Extended due date to allow session leakage fix.",
      });

      // Task 2: Write Documentation (Completed on Day 4)
      await ctx.db.insert("tasks", {
        userId,
        text: "Write Documentation",
        workspaceId: devWorkspaceId,
        completed: true,
        completedAt: Date.UTC(2026, 4, 4, 16, 0, 0),
        progress: 100,
        statusHook: "Documentation completed",
        createdAt: day2,
        notes: "[2026-05-04 16:00] All wiki documents written, reviewed, and published.",
      });
    });

    // 6. Seed Events
    await t.run(async (ctx) => {
      // Event 1: Sprint Planning (Day 1 completed with outcome)
      await ctx.db.insert("events", {
        userId,
        title: "Sprint Planning",
        startTime: Date.UTC(2026, 4, 1, 10, 0, 0),
        endTime: Date.UTC(2026, 4, 1, 11, 30, 0),
        eventType: "interval",
        notes: "[2026-05-01 10:00] Initial event setup. Outcome: Decided to drop support for legacy cookie auth.",
        outcome: "Decided to drop support for legacy cookie auth.",
        statusHook: "Sprint planned",
        workspaceId: devWorkspaceId,
        createdAt: day1,
      });

      // Event 2: Client Demo (Day 4 scheduled, cancelled on Day 3)
      await ctx.db.insert("events", {
        userId,
        title: "Client Demo",
        startTime: Date.UTC(2026, 4, 4, 15, 0, 0),
        endTime: Date.UTC(2026, 4, 4, 16, 0, 0),
        eventType: "interval",
        cancelled: true,
        notes: "[2026-05-03 11:00] Client postponed meeting due to internal calendar conflicts.",
        statusHook: "Meeting postponed",
        workspaceId: devWorkspaceId,
        createdAt: day1,
      });
    });

    // 7. Verify the recentActivityFeed query captures everything correctly
    const feed = await client.query(api.notes.recentActivityFeed, {
      userId,
      startTime: day1,
      endTime: queryDate,
    });

    // We expect:
    // - 6 Gym logs (Day 1, 2, 3, 5, 6, 7)
    // - 1 Task notes (Deploy Auth Service)
    // - 1 Task notes (Write Documentation)
    // - 1 Event outcome (Sprint Planning)
    // - 1 Event notes (Client Demo - cancelled notes)
    // Total: 10 items
    expect(feed.length).toBe(10);

    // Verify task updates
    const authTask = feed.find((i: any) => i.entityType === "task" && i.entityName === "Deploy Auth Service");
    expect(authTask).toBeDefined();
    expect(authTask?.noteText).toContain("OAuth session handling complexity exploded");
    expect(authTask?.noteText).toContain("Extended due date to allow session leakage fix");

    // Verify event outcome
    const sprintPlanning = feed.find((i: any) => i.entityType === "event" && i.entityName === "Sprint Planning");
    expect(sprintPlanning).toBeDefined();
    expect(sprintPlanning?.noteText).toBe("[2026-05-01 10:00] Initial event setup. Outcome: Decided to drop support for legacy cookie auth.");

    // Verify event cancellation
    const clientDemo = feed.find((i: any) => i.entityType === "event" && i.entityName === "Client Demo");
    expect(clientDemo).toBeDefined();
    expect(clientDemo?.noteText).toContain("Client postponed meeting");

    // Verify habits skip and logs
    const skipLog = feed.find((i: any) => i.entityType === "habit" && i.noteText.includes("Muscle soreness"));
    expect(skipLog).toBeDefined();
    expect(skipLog?.noteText).toBe("Muscle soreness, forced rest day.");

    // 8. Run compileNotesPyramidSegment Action (representing May 8 cron run)
    // This action invokes the Gemini LLM
    console.log("Starting compileNotesPyramidSegment Action...");
    const res = await client.action(api.notes_action.compileNotesPyramidSegment, {
      userId,
      segment: 1, // Compile Days 1-7
      now: queryDate,
      timezoneOffset: 0,
    });

    console.log("Compilation finished. Result Status:", res.status || "success");
    if (res.weeklySummary) {
      console.log("\n=================== GENERATED WEEKLY SUMMARY ===================");
      console.log(res.weeklySummary);
      console.log("================================================================\n");
    }

    // 9. Assert that the weekly summary was successfully saved
    const updatedProfile = await client.query(api.ai.getProfile, { userId });
    expect(updatedProfile?.weeklyNotesSummaries?.length).toBe(1);
    expect(updatedProfile?.weeklyNotesSummaries?.[0]).toBe(res.weeklySummary);
  });
});
