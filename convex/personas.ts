import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";

// Default prompt for the fallback core persona
const DEFAULT_PROMPT = "You build relationships through concrete behaviors, not prescribed tones.";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const personas = await ctx.db
      .query("agentPersonas")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const defaultPersona = {
      _id: "default_dialogue" as Id<"agentPersonas">,
      _creationTime: 0,
      userId,
      name: "Dialogue",
      prompt: DEFAULT_PROMPT,
      description: "The default system assistant focused on concrete behaviors.",
      isDefault: true,
      createdAt: 0,
    };

    return [defaultPersona, ...personas];
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    prompt: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const cleanName = args.name.trim();
    const cleanPrompt = args.prompt.trim();
    const cleanDescription = args.description.trim();

    if (cleanName.length < 2 || cleanName.length > 20) {
      throw new Error("Persona name must be between 2 and 20 characters.");
    }
    if (cleanPrompt.length < 10 || cleanPrompt.length > 1000) {
      throw new Error("System prompt must be between 10 and 1000 characters.");
    }
    if (cleanDescription.length < 2 || cleanDescription.length > 100) {
      throw new Error("Description must be between 2 and 100 characters.");
    }

    return await ctx.db.insert("agentPersonas", {
      userId,
      name: cleanName,
      prompt: cleanPrompt,
      description: cleanDescription,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("agentPersonas"),
    name: v.string(),
    prompt: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Persona not found or unauthorized");
    }
    if (existing.isDefault) {
      throw new Error("Cannot modify the default Dialogue persona.");
    }

    const cleanName = args.name.trim();
    const cleanPrompt = args.prompt.trim();
    const cleanDescription = args.description.trim();

    if (cleanName.length < 2 || cleanName.length > 20) {
      throw new Error("Persona name must be between 2 and 20 characters.");
    }
    if (cleanPrompt.length < 10 || cleanPrompt.length > 1000) {
      throw new Error("System prompt must be between 10 and 1000 characters.");
    }
    if (cleanDescription.length < 2 || cleanDescription.length > 100) {
      throw new Error("Description must be between 2 and 100 characters.");
    }

    await ctx.db.patch(args.id, {
      name: cleanName,
      prompt: cleanPrompt,
      description: cleanDescription,
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("agentPersonas"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Persona not found or unauthorized");
    }
    if (existing.isDefault) {
      throw new Error("Cannot delete the default Dialogue persona.");
    }

    await ctx.db.delete(args.id);
  },
});
