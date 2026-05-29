import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { auth } from "./auth";

/**
 * Registers or updates a browser Web Push subscription for the current user.
 */
export const addSubscription = mutation({
  args: {
    endpoint: v.string(),
    expirationTime: v.union(v.number(), v.null()),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Check if subscription with this endpoint already exists for this user
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        expirationTime: args.expirationTime,
        keys: args.keys,
      });
    } else {
      await ctx.db.insert("pushSubscriptions", {
        userId,
        endpoint: args.endpoint,
        expirationTime: args.expirationTime,
        keys: args.keys,
      });
    }
  },
});

/**
 * Removes a browser Web Push subscription for the current user.
 */
export const removeSubscription = mutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    if (subscription) {
      await ctx.db.delete(subscription._id);
    }
  },
});

/**
 * Internal mutation used by actions to remove stale/expired subscriptions.
 */
export const deleteExpiredSubscription = internalMutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();

    for (const sub of subscriptions) {
      await ctx.db.delete(sub._id);
    }
  },
});

/**
 * Internal query to fetch active push subscriptions for a target user.
 */
export const getSubscriptionsForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Query to retrieve the VAPID Public Key for client-side subscription.
 */
export const getPublicKey = query({
  args: {},
  handler: async () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.warn("VAPID_PUBLIC_KEY is not configured in the environment.");
      return null;
    }
    return publicKey;
  },
});
