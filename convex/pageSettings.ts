import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

const settingsValidator = v.object({
  url: v.optional(v.string()),
  storageId: v.optional(v.string()),
  opacity: v.number(),
  blur: v.number(),
  grain: v.number(),
  vfxEnabled: v.boolean(),
  vfxColor: v.string(),
  cardBg: v.string(),
  cardOpacity: v.number(),
  cardBlur: v.number(),
  cardBorder: v.string(),
  primaryText: v.string(),
  secondaryText: v.string(),
  accentColor: v.string(),
  cardStyle: v.union(v.literal("glass"), v.literal("solid")),
});

export const get = query({
  args: { page: v.literal("dashboard") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("pageSettings")
      .withIndex("by_user_page", (q) => q.eq("userId", userId).eq("page", args.page))
      .unique();
  },
});

export const update = mutation({
  args: {
    page: v.literal("dashboard"),
    settings: settingsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("pageSettings")
      .withIndex("by_user_page", (q) => q.eq("userId", userId).eq("page", args.page))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { settings: args.settings });
      return existing._id;
    } else {
      return await ctx.db.insert("pageSettings", {
        userId,
        page: args.page,
        settings: args.settings,
      });
    }
  },
});

export const migrateLegacySettings = mutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("userProfile").collect();
    let migratedCount = 0;

    for (const profile of profiles) {
      const legacyBg = profile.preferences?.dashboardBg;
      if (legacyBg) {
        // Check if pageSettings already exists for this user and "dashboard"
        const existing = await ctx.db
          .query("pageSettings")
          .withIndex("by_user_page", (q) => q.eq("userId", profile.userId).eq("page", "dashboard"))
          .unique();

        if (!existing) {
          await ctx.db.insert("pageSettings", {
            userId: profile.userId,
            page: "dashboard",
            settings: {
              url: legacyBg.url,
              storageId: legacyBg.storageId,
              opacity: legacyBg.opacity ?? 30,
              blur: legacyBg.blur ?? 0,
              grain: legacyBg.grain ?? 0,
              vfxEnabled: legacyBg.vfxEnabled ?? true,
              vfxColor: legacyBg.vfxColor ?? "#d4a373",
              cardBg: legacyBg.cardBg ?? "#1a1814",
              cardOpacity: legacyBg.cardOpacity ?? 100,
              cardBlur: legacyBg.cardBlur ?? 0,
              cardBorder: legacyBg.cardBorder ?? "#2a2723",
              primaryText: legacyBg.primaryText ?? "#f2efeb",
              secondaryText: legacyBg.secondaryText ?? "#a8a29e",
              accentColor: legacyBg.accentColor ?? "#d4a373",
              cardStyle: legacyBg.cardStyle ?? "glass",
            },
          });
        }

        // Delete dashboardBg from profile.preferences
        const newPreferences = { ...profile.preferences };
        delete newPreferences.dashboardBg;
        await ctx.db.patch(profile._id, { preferences: newPreferences });
        migratedCount++;
      }
    }
    return { migratedCount };
  },
});
