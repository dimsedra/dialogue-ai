import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { auth } from "./auth";

export const backfillUserId = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tables = ["workspaces", "chatSessions", "tasks", "events", "userProfile", "memories"] as const;
    
    for (const table of tables) {
      const documents = await ctx.db.query(table).collect();
      for (const doc of documents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(doc as any).userId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await ctx.db.patch(doc._id as any, { userId: args.userId });
          console.log(`Backfilled ${table} document ${doc._id} with userId ${args.userId}`);
        }
      }
    }
  },
});

export const runBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    await ctx.scheduler.runAfter(0, internal.migrations.backfillUserId, { userId });
    return "Migration started in background.";
  },
});

export const clearAllData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = ["workspaces", "chatSessions", "tasks", "events", "userProfile", "memories", "messages"] as const;
    for (const table of tables) {
      const documents = await ctx.db.query(table).collect();
      for (const doc of documents) {
        await ctx.db.delete(doc._id);
      }
    }
    console.log("All data cleared successfully.");
  },
});

// Helper function to hash text using Web Crypto SHA-256
async function computeHash(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const backfillMemories = mutation({
  args: {},
  handler: async (ctx) => {
    const memories = await ctx.db.query("memories").collect();
    let updatedCount = 0;
    const now = Date.now();

    for (const mem of memories) {
      if (!mem.hash || !mem.createdAt || !mem.updatedAt) {
        const hash = await computeHash(mem.text);
        await ctx.db.patch(mem._id, {
          hash,
          createdAt: mem.createdAt ?? now,
          updatedAt: mem.updatedAt ?? now,
        });
        updatedCount++;
      }
    }

    return { updatedCount };
  },
});



