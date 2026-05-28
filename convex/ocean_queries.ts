import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal queries for OCEAN actions
export const getUserProfileForOCEAN = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getWeeklyDigestByWeek = internalQuery({
  args: {
    userId: v.id("users"),
    weekStart: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("weeklyDigests")
      .withIndex("by_user_week", (q) => q.eq("userId", args.userId).eq("weekStart", args.weekStart))
      .first();
  },
});

export const insertWeeklyDigest = internalMutation({
  args: {
    userId: v.id("users"),
    weekStart: v.number(),
    weekStartStr: v.optional(v.string()),
    weekLabel: v.string(),
    digest: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("weeklyDigests", {
      userId: args.userId,
      weekStart: args.weekStart,
      weekStartStr: args.weekStartStr,
      weekLabel: args.weekLabel,
      digest: args.digest,
      createdAt: Date.now(),
    });
  },
});

export const getWeeklyDigestsForMonthly = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("weeklyDigests")
      .withIndex("by_user_week", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(4);
  },
});

export const insertArchivedSummary = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("weekly"), v.literal("monthly")),
    originalDate: v.number(),
    originalDateStr: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("archivedSummaries", {
      userId: args.userId,
      type: args.type,
      originalDate: args.originalDate,
      originalDateStr: args.originalDateStr,
      content: args.content,
      archivedAt: Date.now(),
    });
  },
});

export const deleteWeeklyDigest = internalMutation({
  args: { id: v.id("weeklyDigests") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateUserProfileOCEAN = internalMutation({
  args: {
    userId: v.id("users"),
    monthlyDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const profileDoc = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (profileDoc) {
      await ctx.db.patch(profileDoc._id, {
        monthlyNotesSummaries: [args.monthlyDigest],
        behavioralProfile: args.monthlyDigest,
      });
    } else {
      await ctx.db.insert("userProfile", {
        userId: args.userId,
        name: "",
        bio: "New user.",
        preferences: {},
        monthlyNotesSummaries: [args.monthlyDigest],
        behavioralProfile: args.monthlyDigest,
      });
    }
  },
});
