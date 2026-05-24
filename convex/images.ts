import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const images = await ctx.db
      .query("userImages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return await Promise.all(
      images.map(async (img) => ({
        ...img,
        url: await ctx.storage.getUrl(img.storageId),
      }))
    );
  },
});

export const save = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    await ctx.db.insert("userImages", {
      userId,
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { imageId: v.id("userImages") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const image = await ctx.db.get(args.imageId);
    if (!image || image.userId !== userId) throw new Error("Not found or unauthorized");
    await ctx.storage.delete(image.storageId);
    await ctx.db.delete(args.imageId);
  },
});
