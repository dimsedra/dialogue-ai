import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getLocalDateString, getTodayBounds, getOffsetMinutes, getLocalHour } from "./timezones";

function getTaskModel(profile: any, task: string): string {
  const models = (profile?.preferences as any)?.taskModels;
  const taskModel = models?.[task];
  if (taskModel) return taskModel;
  const configs = (profile?.preferences as any)?.customConfigs || {};
  const provider = (profile?.preferences as any)?.provider || "gemini";
  const mainModel = configs[provider]?.modelId;
  return mainModel || "gemini-2.0-flash-lite";
}

// Internal queries for database operations
export const getUserSessions = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getMessagesBySession = internalQuery({
  args: {
    sessionId: v.id("chatSessions"),
    startOfDay: v.number(),
    endOfDay: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) =>
        q.and(
          q.eq(q.field("author"), "User"),
          q.gte(q.field("timestamp"), args.startOfDay),
          q.lt(q.field("timestamp"), args.endOfDay)
        )
      )
      .collect();
  },
});

export const getSessionSummaryByDate = internalQuery({
  args: {
    userId: v.id("users"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessionSummaries")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .first();
  },
});

export const insertSessionSummary = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessionSummaries", {
      userId: args.userId,
      date: args.date,
      summary: args.summary,
      createdAt: Date.now(),
    });
  },
});

// Cron trigger — runs every hour, schedules users at their local 23:59
export const cronTriggerDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const lastSession = await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();

      // Get IANA timezone from session, fallback to UTC
      let timezone = lastSession?.timezone || "UTC";

      const now = new Date();
      const todayStr = getLocalDateString(timezone, now);

      // Calculate yesterday's date in user's timezone
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = getLocalDateString(timezone, yesterday);

      // Check if today's summary already exists (idempotent)
      const todaySummary = await ctx.db
        .query("sessionSummaries")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", todayStr))
        .first();

      // Check if yesterday's summary exists (DST catch-up)
      const yesterdaySummary = await ctx.db
        .query("sessionSummaries")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", yesterdayStr))
        .first();

      // Determine what to generate
      let targetDate: string | null = null;

      if (!yesterdaySummary) {
        // Yesterday's summary is missing — catch-up (handles DST skip or missed run)
        targetDate = yesterdayStr;
      } else if (!todaySummary) {
        // Today's summary is missing — check if it's past 23:00 local
        const localHour = getLocalHour(timezone, now);
        if (localHour >= 23) {
          targetDate = todayStr;
        }
      }

      // Skip if nothing to generate
      if (!targetDate) continue;

      const offset = getOffsetMinutes(timezone, now);
      await ctx.scheduler.runAfter(0, internal.dailySummary.generateDailySummary, {
        userId: user._id,
        timezone,
        timezoneOffset: offset,
      });
    }
  },
});

// Action
export const generateDailySummary = internalAction({
  args: {
    userId: v.id("users"),
    timezone: v.string(),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });

    const dateString = getLocalDateString(args.timezone);
    const { start: startOfDay, end: endOfDay } = getTodayBounds(args.timezone);

    // Check if summary already exists (idempotent)
    const existing = await ctx.runQuery(internal.dailySummary.getSessionSummaryByDate, {
      userId: args.userId,
      date: dateString,
    });
    if (existing) return;

    // Get all user sessions
    const sessions = await ctx.runQuery(internal.dailySummary.getUserSessions, {
      userId: args.userId,
    });

    // Collect all user messages from today across all sessions
    const userMessages: { text: string; timestamp: number }[] = [];
    for (const session of sessions) {
      const messages = await ctx.runQuery(internal.dailySummary.getMessagesBySession, {
        sessionId: session._id,
        startOfDay,
        endOfDay,
      });
      for (const msg of messages) {
        userMessages.push({ text: msg.text, timestamp: msg.timestamp });
      }
    }

    userMessages.sort((a, b) => a.timestamp - b.timestamp);

    // No messages today
    if (userMessages.length === 0) {
      await ctx.runMutation(internal.dailySummary.insertSessionSummary, {
        userId: args.userId,
        date: dateString,
        summary: "No activity.",
      });
      return;
    }

    // Generate 2-line OCEAN-informed summary
    const apiKey = (profile?.preferences as any)?.customConfigs?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.dailySummary.insertSessionSummary, {
        userId: args.userId,
        date: dateString,
        summary: "No activity.",
      });
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: getTaskModel(profile, "reflection") });

    const messagesText = userMessages.map((m) => m.text).join("\n---\n");

    const prompt = `You are a behavioral analyst for a productivity app. Read the user's messages from today and write a 2-line session summary that captures behavioral signals relevant to the Big 5 (OCEAN) personality traits:

- Openness: curiosity, new approaches, imagination
- Conscientiousness: organization, goal-directed behavior, habit consistency
- Extraversion: energy sourcing, social vs solo preference
- Agreeableness: prosocial behavior, empathy-driven choices
- Neuroticism: stress response, emotional stability

Focus on WHAT the user did and HOW they communicated — not what they said verbatim. Note stress levels, focus, energy, social dynamics, and behavioral patterns.

User messages from today:
${messagesText}

Write exactly 2 lines. Be specific and evidence-based. Example format:
"User focused on database schema refactoring, displaying strong goal-directed conscientiousness. Elevated stress noted due to migration blocker, with 2 mentions of feeling overwhelmed."`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();

    await ctx.runMutation(internal.dailySummary.insertSessionSummary, {
      userId: args.userId,
      date: dateString,
      summary,
    });
  },
});
