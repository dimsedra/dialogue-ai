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

    const updates: Record<string, any> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.startTime !== undefined) updates.startTime = new Date(input.startTime).getTime();
    if (input.endTime !== undefined) updates.endTime = new Date(input.endTime).getTime();
    if (input.eventType !== undefined) updates.eventType = input.eventType;
    if (input.location !== undefined) updates.location = input.location;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.outcome !== undefined) updates.outcome = input.outcome;
    if (input.statusHook !== undefined) updates.statusHook = input.statusHook;
    if (input.cancelled !== undefined) updates.cancelled = input.cancelled;
    if (input.reminderOffset !== undefined) updates.reminderOffset = input.reminderOffset < 0 ? null : input.reminderOffset;
    if (input.recurrence !== undefined) updates.recurrence = recurrence ?? null;

    const record = await pb.collection("events").update(input.eventId, updates);

    try {
      const existingReminders = await pb.collection("scheduled_notifications").getFullList({
        filter: `targetId = "${record.id}" && kind = "event_remind" && delivered = false`
      });
      for (const er of existingReminders) {
        await pb.collection("scheduled_notifications").delete(er.id);
      }

      if (!record.cancelled && record.startTime && record.reminderOffset !== null && record.reminderOffset >= 0) {
        const triggerAt = Math.max(Date.now(), record.startTime - record.reminderOffset * 60 * 1000);
        await pb.collection("scheduled_notifications").create({
          user,
          kind: "event_remind",
          targetId: record.id,
          triggerAt,
          delivered: false,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      console.error("Failed to reschedule event reminder in PB:", err);
    }

    if (input.notes !== undefined || input.outcome !== undefined) {
      const { ingestEventNotes } = await import('../../lib/graph/ingest');
      await ingestEventNotes(pb, input.eventId, record.notes, record.outcome);
    }

    return { success: true, eventId: input.eventId };
  }
});
