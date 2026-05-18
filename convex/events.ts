import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";
import { Doc } from "./_generated/dataModel";

const recurrenceValidator = v.optional(v.union(v.object({
  frequency: v.union(v.literal("daily"), v.literal("weekly")),
  interval: v.number(),
  daysOfWeek: v.optional(v.array(v.number())),
  until: v.optional(v.number()),
  exceptions: v.optional(v.array(v.number())),
}), v.null()));

function expandRecurringEvents(events: Doc<"events">[], windowStart: number, windowEnd: number) {
  const expanded: Doc<"events">[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      expanded.push(event);
      continue;
    }

    const duration = event.endTime !== undefined ? event.endTime - event.startTime : 0;
    const limit = Math.min(windowEnd, event.recurrence.until ?? windowEnd);
    const exceptions = event.recurrence.exceptions ?? [];

    if (event.recurrence.frequency === "daily") {
      const d = new Date(event.startTime);
      while (d.getTime() <= limit) {
        const timestamp = d.getTime();
        if (timestamp >= windowStart && !exceptions.includes(timestamp)) {
          expanded.push({
            ...event,
            startTime: timestamp,
            endTime: event.endTime !== undefined ? timestamp + duration : undefined,
          });
        }
        d.setDate(d.getDate() + event.recurrence.interval);
      }
    } else if (event.recurrence.frequency === "weekly") {
      const d = new Date(event.startTime);
      const daysOfWeek = event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0
        ? event.recurrence.daysOfWeek
        : [d.getDay()];

      const currWeekStart = new Date(event.startTime);
      currWeekStart.setDate(currWeekStart.getDate() - currWeekStart.getDay());
      let weeksCounter = 0;

      while (currWeekStart.getTime() <= limit) {
        if (weeksCounter % event.recurrence.interval === 0) {
          for (let dayIndex = 0; dayIndex <= 6; dayIndex++) {
            if (daysOfWeek.includes(dayIndex)) {
              const targetDate = new Date(currWeekStart);
              targetDate.setDate(targetDate.getDate() + dayIndex);
              const origTime = new Date(event.startTime);
              targetDate.setHours(origTime.getHours(), origTime.getMinutes(), origTime.getSeconds(), origTime.getMilliseconds());
              
              const timestamp = targetDate.getTime();
              if (timestamp >= event.startTime && timestamp <= limit && timestamp >= windowStart) {
                if (!exceptions.includes(timestamp)) {
                  expanded.push({
                    ...event,
                    startTime: timestamp,
                    endTime: event.endTime !== undefined ? timestamp + duration : undefined,
                  });
                }
              }
            }
          }
        }
        currWeekStart.setDate(currWeekStart.getDate() + 7);
        weeksCounter++;
      }
    }
  }
  return expanded;
}

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];

    let rawEvents: Doc<"events">[] = [];
    if (args.workspaceId) {
      const workspace = await ctx.db.get(args.workspaceId);
      if (!workspace || workspace.userId !== userId) return [];

      rawEvents = await ctx.db
        .query("events")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
    } else {
      rawEvents = await ctx.db
        .query("events")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    const windowStart = Date.now() - 30 * 24 * 3600 * 1000; // 30 days ago
    const windowEnd = Date.now() + 365 * 24 * 3600 * 1000; // 1 year ahead
    return expandRecurringEvents(rawEvents, windowStart, windowEnd);
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
    endTime: v.optional(v.number()),
    eventType: v.optional(v.union(v.literal("interval"), v.literal("point"))),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    outcome: v.optional(v.string()),
    statusHook: v.optional(v.string()),
    recurrence: recurrenceValidator,
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
      eventType: args.eventType ?? (args.endTime !== undefined ? "interval" : "point"),
      description: args.description,
      location: args.location,
      notes: args.notes,
      outcome: args.outcome,
      statusHook: args.statusHook,
      contextUpdatedAt: (args.notes !== undefined || args.outcome !== undefined || args.statusHook !== undefined) ? Date.now() : undefined,
      recurrence: args.recurrence ?? undefined,
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
    
    const detachedInstances = await ctx.db
      .query("events")
      .withIndex("by_series", (q) => q.eq("seriesId", args.id))
      .collect();
    for (const inst of detachedInstances) {
      await ctx.db.delete(inst._id);
    }

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
    eventType: v.optional(v.union(v.literal("interval"), v.literal("point"))),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    outcome: v.optional(v.string()),
    statusHook: v.optional(v.string()),
    recurrence: recurrenceValidator,
    userId: v.optional(v.id("users")),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) throw new Error("Unauthorized");

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && key !== "id" && key !== "userId" && key !== "notes" && key !== "timezoneOffset") {
        if (value === null) {
          updates[key] = undefined;
        } else {
          updates[key] = value;
        }
      }
    }
    if (args.notes !== undefined) {
      let incomingNote = args.notes.trim();
      const existingNotes = event.notes ? event.notes.trim() : "";
      if (existingNotes && incomingNote.startsWith(existingNotes)) {
        incomingNote = incomingNote.slice(existingNotes.length).trim();
      }
      incomingNote = incomingNote.replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]\s*/, "").trim();
      if (incomingNote) {
        let now = new Date();
        if (args.timezoneOffset !== undefined) {
          now = new Date(Date.now() - (args.timezoneOffset * 60000));
        }
        const pad = (n: number) => n.toString().padStart(2, "0");
        const timestamp = `[${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}]`;
        const newEntry = `${timestamp} ${incomingNote}`;
        updates.notes = existingNotes ? `${existingNotes}\n${newEntry}` : newEntry;
      }
    }
    if (args.notes !== undefined || args.outcome !== undefined || args.statusHook !== undefined) {
      updates.contextUpdatedAt = Date.now();
    }
    await ctx.db.patch(args.id, updates);
  },
});

export const cancelOccurrence = mutation({
  args: { id: v.id("events"), timestamp: v.number(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) throw new Error("Unauthorized");

    if (event.seriesId) {
      await ctx.db.delete(args.id);
      return;
    }

    if (event.recurrence) {
      const exceptions = event.recurrence.exceptions ?? [];
      if (!exceptions.includes(args.timestamp)) {
        exceptions.push(args.timestamp);
        await ctx.db.patch(args.id, {
          recurrence: {
            ...event.recurrence,
            exceptions,
          },
        });
      }
    }
  },
});

export const updateOccurrence = mutation({
  args: {
    seriesId: v.id("events"),
    originalStartTime: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    eventType: v.optional(v.union(v.literal("interval"), v.literal("point"))),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const parent = await ctx.db.get(args.seriesId);
    if (!parent || parent.userId !== userId) throw new Error("Unauthorized");

    if (parent.recurrence) {
      const exceptions = parent.recurrence.exceptions ?? [];
      if (!exceptions.includes(args.originalStartTime)) {
        exceptions.push(args.originalStartTime);
        await ctx.db.patch(args.seriesId, {
          recurrence: {
            ...parent.recurrence,
            exceptions,
          },
        });
      }
    }

    const duration = parent.endTime !== undefined ? parent.endTime - parent.startTime : 0;
    const finalStartTime = args.startTime ?? args.originalStartTime;
    const finalEndTime = parent.endTime !== undefined ? (args.endTime ?? (finalStartTime + duration)) : undefined;

    return await ctx.db.insert("events", {
      title: args.title ?? parent.title,
      description: args.description ?? parent.description,
      location: args.location ?? parent.location,
      notes: parent.notes,
      outcome: parent.outcome,
      statusHook: parent.statusHook,
      contextUpdatedAt: parent.contextUpdatedAt,
      startTime: finalStartTime,
      endTime: finalEndTime,
      eventType: args.eventType ?? parent.eventType,
      seriesId: args.seriesId,
      workspaceId: parent.workspaceId,
      userId: parent.userId,
      createdAt: Date.now(),
    });
  },
});
