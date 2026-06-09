import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const updateEventTool = createTool({
  id: 'updateEvent',
  description: 'Updates an existing scheduled event by its ID. Provide only the fields you want to change. Set cancelled to true to cancel an event.',
  inputSchema: z.object({
    eventId: z.string().describe("The ID of the event to update"),
    title: z.string().optional().describe("The new event title"),
    startTime: z.string().optional().describe("ISO-8601 start time"),
    endTime: z.string().optional().describe("ISO-8601 end time"),
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
    const client = getConvexClient();
    const recurrence = input.recurrence ? {
      frequency: input.recurrence.frequency as "daily" | "weekly",
      interval: input.recurrence.interval,
      daysOfWeek: input.recurrence.daysOfWeek,
      until: input.recurrence.until ? new Date(input.recurrence.until).getTime() : undefined,
    } : undefined;

    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("events").update(input.eventId, {
        title: input.title,
        startTime: input.startTime ? new Date(input.startTime).getTime() : undefined,
        endTime: input.endTime ? new Date(input.endTime).getTime() : undefined,
        eventType: input.eventType as "interval" | "point",
        location: input.location,
        notes: input.notes,
        outcome: input.outcome,
        statusHook: input.statusHook,
        cancelled: input.cancelled,
        recurrence: recurrence ?? undefined,
      });
      return { success: true, eventId: input.eventId };
    }

    await client.mutation(api.events.update, {
      id: input.eventId as Id<"events">,
      title: input.title,
      startTime: input.startTime ? new Date(input.startTime).getTime() : undefined,
      endTime: input.endTime ? new Date(input.endTime).getTime() : undefined,
      eventType: input.eventType as "interval" | "point",
      location: input.location,
      notes: input.notes,
      outcome: input.outcome,
      statusHook: input.statusHook,
      cancelled: input.cancelled,
      recurrence: recurrence ?? undefined,
    });
    return { success: true, eventId: input.eventId };
  }
});
