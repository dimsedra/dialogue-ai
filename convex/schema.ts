import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  workspaces: defineTable({
    userId: v.id("users"),
    name: v.string(),
    icon: v.string(),
    color: v.string(),
    context: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  chatSessions: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    createdAt: v.number(),
    lastActivity: v.number(),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

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
    toolCalls: v.optional(v.array(v.object({
      name: v.string(),
      args: v.any(),
      result: v.optional(v.any()),
    }))),
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
    userId: v.id("users"),
    text: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    completed: v.boolean(),
    dueDate: v.optional(v.number()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  userProfile: defineTable({
    userId: v.id("users"),
    name: v.optional(v.string()),
    bio: v.string(),
    preferences: v.any(),
  }).index("by_user", ["userId"]),

  memories: defineTable({
    userId: v.id("users"),
    text: v.string(),
    embedding: v.array(v.number()),
  }).index("by_user", ["userId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["userId"],
    }),

  events: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    eventType: v.optional(v.union(v.literal("interval"), v.literal("point"))),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    recurrence: v.optional(v.object({
      frequency: v.union(v.literal("daily"), v.literal("weekly")),
      interval: v.number(),
      daysOfWeek: v.optional(v.array(v.number())),
      until: v.optional(v.number()),
      exceptions: v.optional(v.array(v.number())),
    })),
    createdAt: v.number(),
    seriesId: v.optional(v.id("events")),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_series", ["seriesId"]),
});
