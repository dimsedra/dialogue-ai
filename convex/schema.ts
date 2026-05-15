import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    icon: v.string(), // Emoji or Lucide icon name
    color: v.string(), // Hex or CSS color
    context: v.optional(v.string()), // User-defined purpose/context
    createdAt: v.number(),
  }),
  chatSessions: defineTable({
    title: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    createdAt: v.number(),
    lastActivity: v.number(),
  }).index("by_workspace", ["workspaceId"]),
  messages: defineTable({
    sessionId: v.optional(v.id("chatSessions")),
    text: v.string(),
    author: v.string(),
    timestamp: v.number(),
    timezoneOffset: v.optional(v.number()),
    toolCall: v.optional(v.object({
      name: v.string(),
      args: v.any(),
      result: v.optional(v.any()),
    })),
    storageId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      fileType: v.string(),
      extractedText: v.optional(v.string()),
    }))),
  }).index("by_session", ["sessionId"]),
  tasks: defineTable({
    text: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    completed: v.boolean(),
    dueDate: v.optional(v.number()), // Unix timestamp moment
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),
  userProfile: defineTable({
    name: v.optional(v.string()),
    bio: v.string(),
    preferences: v.any(), // json
  }),
  memories: defineTable({
    text: v.string(),
    embedding: v.array(v.number()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768, // Gemini text-embedding-004 uses 768
  }),
  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(), // timestamp
    endTime: v.number(),   // timestamp
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),
});
