import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];

    if (args.workspaceId) {
      const workspace = await ctx.db.get(args.workspaceId);
      if (!workspace || workspace.userId !== userId) return [];

      return await ctx.db
        .query("events")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
    }
    return await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("events"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) return null;
    return event;
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.insert("events", {
      title: args.title,
      startTime: args.startTime,
      endTime: args.endTime,
      description: args.description,
      location: args.location,
      notes: args.notes,
      workspaceId: args.workspaceId,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("events"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) throw new Error("Unauthorized");
    
    await ctx.db.delete(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) throw new Error("Unauthorized");

    const updates: Record<string, string | number | undefined> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && key !== "id" && key !== "userId") {
        updates[key] = value;
      }
    }
    await ctx.db.patch(args.id, updates);
  },
});
