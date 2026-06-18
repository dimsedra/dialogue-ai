import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const updateEventTool = createTool({
  id: 'updateEvent',
  description: 'Updates an existing scheduled event by its ID. Provide only the fields you want to change. Set cancelled to true to cancel an event.',
  inputSchema: z.object({
    eventId: z.string().describe("The ID of the event to update"),
    title: z.string().optional().describe("The new event title"),
    startTime: z.string().optional().describe("ISO-8601 start time"),
    endTime: z.string().optional().describe("ISO-8601 end time"),
    timezone: z.string().optional().describe("The user's IANA timezone ID (e.g. 'Asia/Jakarta', 'UTC') to parse timestamps properly."),
    reminderOffset: z.number().optional().describe("Minutes before startTime to remind the user. Pass -1 to remove existing reminder."),
    eventType: z.string().optional().describe("'interval' or 'point'"),
    location: z.string().optional().describe("Optional new location"),
    notes: z.string().optional().describe("Chronological pre-event prep notes or context. Always append with timestamp [YYYY-MM-DD HH:mm]."),
    outcome: z.string().optional().describe("Post-event summary"),
    statusHook: z.string().optional().describe("A single punchy sentence summarizing the event status"),
    cancelled: z.boolean().optional().describe("Set to true to cancel/soft-delete this event"),
    recurrence: z.object({
      frequency: z.string().describe("'daily' or 'weekly'"),
      interval: z.number(),
      daysOfWeek: z.array(z.number()).optional(),
      until: z.string().optional()
    }).optional()
  }),
  outputSchema: z.object({ success: z.boolean(), eventId: z.string() }),
  execute: async (input) => {
    const { parseDateTime } = await import('../../lib/jobs/dateUtils');
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const startMs = input.startTime ? parseDateTime(input.startTime, input.timezone).getTime() : undefined;
    const endMs = input.endTime ? parseDateTime(input.endTime, input.timezone).getTime() : undefined;
    const recurrence = input.recurrence ? {
      frequency: input.recurrence.frequency as "daily" | "weekly",
      interval: input.recurrence.interval,
      daysOfWeek: input.recurrence.daysOfWeek,
      until: input.recurrence.until ? parseDateTime(input.recurrence.until, input.timezone).getTime() : undefined,
    } : undefined;

    const { updateEvent } = await import('../../lib/pb-actions/updateEvent');
    await updateEvent({
      eventId: input.eventId,
      title: input.title,
      location: input.location,
      startTime: startMs,
      endTime: endMs,
      eventType: input.eventType as any,
      recurrence,
      reminderOffset: input.reminderOffset !== undefined ? (input.reminderOffset < 0 ? null : input.reminderOffset) : undefined,
      cancelled: input.cancelled,
      notes: input.notes,
      outcome: input.outcome,
      statusHook: input.statusHook,
    }, {
      user: { id: user, email: "" },
      token: pb.authStore.token || "",
    });

    return { success: true, eventId: input.eventId };
  }
});
