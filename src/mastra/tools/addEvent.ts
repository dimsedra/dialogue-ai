import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const addEventTool = createTool({
  id: 'addEvent',
  description: 'Creates a calendar event. Extract as many fields as possible from the user\'s natural language (title, start/end times, location, recurrence, notes). IMPORTANT: endTime is REQUIRED when eventType is \'interval\'. Only ask the user if information is missing or ambiguous.',
  inputSchema: z.object({
    title: z.string().describe("Event title"),
    description: z.string().optional().describe("Optional description"),
    startTime: z.string().describe("ISO-8601 start time (24-hour format, e.g. '2026-05-15T14:00:00')"),
    endTime: z.string().optional().describe("Required when eventType is 'interval'. ISO-8601 end time (24-hour format)."),
    reminderOffset: z.number().optional().describe("Minutes before startTime to remind the user (e.g. 15)."),
    eventType: z.enum(["interval", "point"]).describe("'interval' for duration events or 'point' for momentary events"),
    location: z.string().optional().describe("Optional location"),
    notes: z.string().optional().describe("Optional notes"),
    outcome: z.string().optional().describe("Post-event summary or outcome"),
    statusHook: z.string().optional().describe("A single punchy sentence summarizing current state"),
    recurrence: z.object({
      frequency: z.string().describe("'daily' or 'weekly'"),
      interval: z.number().describe("Interval count"),
      daysOfWeek: z.array(z.number()).optional().describe("For weekly recurrence: array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)"),
      until: z.string().optional().describe("Optional ISO-8601 end date for the recurrence series")
    }).optional().describe("Optional recurrence rule if the event repeats")
  }).superRefine((data, ctx) => {
    if (data.eventType === "interval" && !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime is required when eventType is 'interval'",
      });
    }
  }),
  outputSchema: z.object({ eventId: z.string(), title: z.string() }),
  execute: async (input) => {
    const startMs = new Date(input.startTime).getTime();
    const endMs = input.endTime ? new Date(input.endTime).getTime() : undefined;
    const recurrence = input.recurrence ? {
      frequency: input.recurrence.frequency as "daily" | "weekly",
      interval: input.recurrence.interval,
      daysOfWeek: input.recurrence.daysOfWeek,
      until: input.recurrence.until ? new Date(input.recurrence.until).getTime() : undefined,
    } : undefined;

    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const record = await pb.collection("events").create({
      user,
      title: input.title,
      description: input.description,
      startTime: startMs,
      endTime: endMs,
      reminderOffset: input.reminderOffset,
      eventType: input.eventType as "interval" | "point",
      location: input.location,
      notes: input.notes,
      outcome: input.outcome,
      statusHook: input.statusHook,
      recurrence: recurrence ?? undefined,
      createdAt: Date.now(),
    });

    if (input.reminderOffset !== undefined && input.reminderOffset >= 0) {
      const triggerAt = Math.max(Date.now(), startMs - input.reminderOffset * 60 * 1000);
      await pb.collection("scheduled_notifications").create({
        user,
        kind: "event_remind",
        targetId: record.id,
        triggerAt,
        delivered: false,
        createdAt: Date.now(),
      });
    }

    if (input.notes || input.outcome) {
      const { ingestEventNotes } = await import('../../lib/graph/ingest');
      await ingestEventNotes(pb, record.id, input.notes, input.outcome);
    }

    return { eventId: record.id as string, title: input.title };
  }
});
