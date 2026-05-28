import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const resourceValidator = v.object({
  type: v.union(v.literal("url"), v.literal("document")),
  title: v.string(),
  url: v.string(),
  storageId: v.optional(v.id("_storage")),
  summary: v.optional(v.string()),
  linkedAt: v.number(),
});

export default defineSchema({
  ...authTables,

  workspaces: defineTable({
    userId: v.id("users"),
    name: v.string(),
    icon: v.string(),
    color: v.string(),
    context: v.optional(v.string()),
    agentName: v.optional(v.string()),
    defaultAgentPersonaId: v.optional(v.id("agentPersonas")),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  chatSessions: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    agentPersonaId: v.optional(v.id("agentPersonas")),
    createdAt: v.number(),
    lastActivity: v.number(),
    pinned: v.optional(v.boolean()),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  agentPersonas: defineTable({
    userId: v.id("users"),
    name: v.string(),
    prompt: v.string(),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

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
    scope: v.optional(v.object({
      type: v.union(v.literal("date"), v.literal("task"), v.literal("event"), v.literal("habit")),
      id: v.string(),
      title: v.string(),
    })),
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
    progress: v.optional(v.number()),
    statusHook: v.optional(v.string()),
    contextUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    resources: v.optional(v.array(resourceValidator)),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  userProfile: defineTable({
    userId: v.id("users"),
    name: v.optional(v.string()),
    bio: v.string(),
    preferences: v.any(),
    weeklyNotesSummaries: v.optional(v.array(v.string())),
    monthlyNotesSummaries: v.optional(v.array(v.string())),
    behavioralProfile: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  memories: defineTable({
    userId: v.id("users"),
    text: v.string(),
    embedding: v.array(v.number()),
    hash: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_hash", ["hash"])
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
    outcome: v.optional(v.string()),
    statusHook: v.optional(v.string()),
    cancelled: v.optional(v.boolean()),
    contextUpdatedAt: v.optional(v.number()),
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
    resources: v.optional(v.array(resourceValidator)),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_series", ["seriesId"]),

  reflections: defineTable({
    userId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),
    type: v.union(v.literal("weekly"), v.literal("monthly"), v.literal("yearly")),
    periodStart: v.number(),      // Epoch ms — start of the period
    periodEnd: v.number(),        // Epoch ms — end of the period
    periodLabel: v.string(),      // e.g. "Week 3, May 2026"
    summary: v.string(),          // Agent-synthesized narrative
    stats: v.object({
      tasksCompleted: v.number(),
      tasksCreated: v.number(),
      eventsAttended: v.number(),
      topCategories: v.optional(v.array(v.string())),
      streakDays: v.optional(v.number()),
      habitLogsCompleted: v.optional(v.number()),
      habitLogsSkipped: v.optional(v.number()),
      habitStreakDays: v.optional(v.number()),
    }),
    userReflection: v.optional(v.string()),  // User's own words during reflection conversation
    createdAt: v.number(),
  }).index("by_user_type", ["userId", "type"])
    .index("by_user_period", ["userId", "periodStart"]),

  userImages: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  habits: defineTable({
    userId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    frequency: v.union(v.literal("daily"), v.literal("custom")),
    frequencyConfig: v.object({
      daysOfWeek: v.optional(v.array(v.number())),
    }),
    currentStreak: v.number(),
    longestStreak: v.number(),
    lastLoggedAt: v.optional(v.number()),
    lastLoggedDate: v.optional(v.string()),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  habitLogs: defineTable({
    userId: v.id("users"),
    habitId: v.id("habits"),
    timestamp: v.number(),
    dateString: v.string(),
    status: v.union(v.literal("completed"), v.literal("skipped")),
    notes: v.optional(v.string()),
  }).index("by_user", ["userId"])
    .index("by_habit", ["habitId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_habit_dateString", ["habitId", "dateString"]),

  pageSettings: defineTable({
    userId: v.id("users"),
    page: v.string(),
    settings: v.object({
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
      bubbleStyle: v.optional(v.string()),
    }),
  }).index("by_user_page", ["userId", "page"]),
});
