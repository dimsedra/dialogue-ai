"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { auth } from "./auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Local helper to fetch model configuration
function getTaskModel(profile: any, task: string): string {
  const models = (profile?.preferences as any)?.taskModels;
  const taskModel = models?.[task];
  if (taskModel) return taskModel;
  const configs = (profile?.preferences as any)?.customConfigs || {};
  const provider = (profile?.preferences as any)?.provider || "gemini";
  const mainModel = configs[provider]?.modelId;
  return mainModel || "gemini-2.0-flash-lite";
}

// Clean model response code blocks
function cleanLLMOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "");
    cleaned = cleaned.replace(/\n```$/, "");
  }
  return cleaned.trim();
}

// Calculates split-week date ranges
export function getSegmentBounds(
  currentTimeMs: number,
  timezoneOffset: number,
  forcedSegment?: number,
  forcedDate?: string
) {
  let localTimeMs = currentTimeMs - (timezoneOffset * 60000);
  if (forcedDate) {
    const [y, m, d] = forcedDate.split("-").map(Number);
    localTimeMs = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  }

  const localDate = new Date(localTimeMs);
  const day = localDate.getUTCDate();
  const month = localDate.getUTCMonth();
  const year = localDate.getUTCFullYear();

  let targetYear = year;
  let targetMonth = month;
  let segment: 1 | 2 | 3 | 4;
  let startDay = 1;
  let endDay = 7;

  if (forcedSegment !== undefined && (forcedSegment === 1 || forcedSegment === 2 || forcedSegment === 3 || forcedSegment === 4)) {
    segment = forcedSegment;
    if (segment === 1) {
      startDay = 1;
      endDay = 7;
    } else if (segment === 2) {
      startDay = 8;
      endDay = 14;
    } else if (segment === 3) {
      startDay = 15;
      endDay = 21;
    } else {
      startDay = 22;
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      endDay = lastDay;
    }
  } else {
    // Scheduled execution triggers based on local day of month
    if (day === 8) {
      segment = 1;
      startDay = 1;
      endDay = 7;
    } else if (day === 15) {
      segment = 2;
      startDay = 8;
      endDay = 14;
    } else if (day === 22) {
      segment = 3;
      startDay = 15;
      endDay = 21;
    } else if (day === 1) {
      segment = 4;
      targetMonth = month - 1;
      if (targetMonth < 0) {
        targetMonth = 11;
        targetYear = year - 1;
      }
      startDay = 22;
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      endDay = lastDay;
    } else {
      // Manual execution on-demand based on current day of month
      if (day <= 7) {
        segment = 1;
        startDay = 1;
        endDay = day;
      } else if (day <= 14) {
        segment = 2;
        startDay = 8;
        endDay = day;
      } else if (day <= 21) {
        segment = 3;
        startDay = 15;
        endDay = day;
      } else {
        segment = 4;
        startDay = 22;
        endDay = day;
      }
    }
  }

  const localStart = Date.UTC(targetYear, targetMonth, startDay, 0, 0, 0, 0);
  const localEnd = Date.UTC(targetYear, targetMonth, endDay, 23, 59, 59, 999);

  const startTime = localStart + (timezoneOffset * 60000);
  const endTime = localEnd + (timezoneOffset * 60000);

  return {
    segment,
    startTime,
    endTime,
    year: targetYear,
    month: targetMonth,
    startDay,
    endDay,
  };
}

async function generateWeeklySummary(
  model: any,
  timelineText: string,
  startDay: number,
  month: number,
  year: number,
  endDay: number
): Promise<string> {
  const prompt = `You are a behavioral psychologist and productivity assistant.
Here is the chronological activity feed of the user's notes, tasks, events, and habit logs from the period ${startDay}/${month + 1}/${year} to ${endDay}/${month + 1}/${year}:
${timelineText}

Please distill these raw notes into a concise 5-line weekly summary focusing on the user's behavioral patterns, mood, energy levels, workflows, and communication style.
Focus on *how* the user operates, not just what they completed. Identify any patterns like overcommitment, scope changes, crunch, blockers, high energy, or habits compliance.
Output ONLY the 5 lines of summary. Do not write any intro or outro.`;
  const result = await model.generateContent(prompt);
  return cleanLLMOutput(result.response.text());
}

async function generateMonthlySummary(model: any, weeklySummaries: string[]): Promise<string> {
  const weeklySummariesText = weeklySummaries.map((s, i) => `Week ${i + 1}:\n${s}`).join("\n\n");
  const prompt = `You are a behavioral psychologist and productivity assistant.
Here are the weekly summaries of the user's behavior for the past month:
${weeklySummariesText}

Please distill these weekly summaries into a 10-15 line monthly summary of stable behavioral patterns.
Focus on long-term trends: how their habit compliance, workflow, mood, and productivity evolved across weeks, highlighting key shifts, recurring challenges (e.g. crunch weeks, scope creep), and positive habits.
Output ONLY the 10-15 lines of summary. Do not write any intro or outro.`;
  const result = await model.generateContent(prompt);
  return cleanLLMOutput(result.response.text());
}

async function generateBehavioralProfile(
  model: any,
  existingProfile: string,
  monthlySummaries: string[]
): Promise<string> {
  const monthlySummariesText = monthlySummaries.map((s, i) => `Month ${i + 1}:\n${s}`).join("\n\n");
  const prompt = `You are a behavioral psychologist and productivity assistant.
Here is the user's existing permanent behavioral profile:
${existingProfile || "None"}

Here are the monthly summaries of the user's behavior for the past year:
${monthlySummariesText}

Please refine and update the user's permanent behavioral profile based on the new monthly summaries.
Focus on a high-level, stable, and deeply accurate 15-20 line markdown profile describing who the user is, how they operate, their working style, typical behavior under pressure, and how they handle habits and time management.
Integrate new insights without growing the size of the profile beyond 20 lines. Preserve existing accurate traits while adjusting to new patterns.
Output ONLY the refined behavioral profile. Do not write any intro or outro.`;
  const result = await model.generateContent(prompt);
  return cleanLLMOutput(result.response.text());
}

export const compileNotesPyramidSegment = action({
  args: {
    userId: v.optional(v.id("users")),
    segment: v.optional(v.number()),
    timezoneOffset: v.optional(v.number()),
    now: v.optional(v.number()),
    forceDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const currentTimeMs = args.now ?? Date.now();
    const timezoneOffset = args.timezoneOffset ?? 0;

    const bounds = getSegmentBounds(currentTimeMs, timezoneOffset, args.segment, args.forceDate);
    const { segment, startTime, endTime, year, month, startDay, endDay } = bounds;

    // Fetch raw notes for the calculated segment window
    const timeline: any = await ctx.runQuery(api.notes.recentActivityFeed, {
      userId,
      startTime,
      endTime,
    });

    const profile: any = await ctx.runQuery(api.ai.getProfile, { userId, revealKeys: true });
    if (!profile) {
      console.warn("User profile not found, skipping compilation.");
      return { status: "skipped", reason: "User profile not found" };
    }

    const customConfigs: any = (profile.preferences as any)?.customConfigs || {};
    const apiKey: string | undefined = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set, skipping compilation.");
      return { status: "skipped", reason: "GEMINI_API_KEY not configured" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelId = getTaskModel(profile, "reflection");
    const model: any = genAI.getGenerativeModel({ model: modelId });

    // Format raw notes timeline
    const timelineText: string = timeline
      .map(
        (item: any) =>
          `[${item.date}] [${item.entityType.toUpperCase()}] ${item.entityName} (${item.workspaceName || "No Workspace"}): ${item.noteText}`
      )
      .join("\n");

    // 1. Weekly Summarization
    const weeklySummary: string =
      timeline.length === 0
        ? "No raw notes recorded this week."
        : await generateWeeklySummary(model, timelineText, startDay, month, year, endDay);

    await ctx.runMutation(api.notes.saveWeeklySummary, { userId, summary: weeklySummary });

    // 2. Cascade compile if segment === 4 (end of month)
    if (segment === 4) {
      const updatedProfile: any = await ctx.runQuery(api.ai.getProfile, { userId });
      const weeklySummaries: string[] = updatedProfile?.weeklyNotesSummaries ?? [];

      const monthlySummary: string =
        weeklySummaries.length === 0
          ? "No weekly summaries recorded this month."
          : await generateMonthlySummary(model, weeklySummaries);

      await ctx.runMutation(api.notes.saveMonthlySummary, { userId, summary: monthlySummary });

      // 3. Yearly compile if targetMonth === 11 (December)
      if (month === 11) {
        const finalProfile: any = await ctx.runQuery(api.ai.getProfile, { userId });
        const monthlySummaries: string[] = finalProfile?.monthlyNotesSummaries ?? [];
        const existingBehavioralProfile: string = finalProfile?.behavioralProfile ?? "";

        const refinedBehavioralProfile: string =
          monthlySummaries.length === 0
            ? "No monthly summaries recorded this year."
            : await generateBehavioralProfile(model, existingBehavioralProfile, monthlySummaries);

        await ctx.runMutation(api.notes.saveBehavioralProfile, { userId, profile: refinedBehavioralProfile });
      }
    }

    return {
      status: "success",
      segment,
      year,
      month: month + 1,
      startDay,
      endDay,
      weeklySummary,
    };
  },
});
