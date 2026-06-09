import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const updateEventOccurrenceTool = createTool({
  id: 'updateEventOccurrence',
  description: 'Modifies or reschedules a single detached occurrence of a recurring event series (e.g. moving just this Tuesday\'s workout to 8am).',
  inputSchema: z.object({
    seriesId: z.string().describe("The ID of the parent recurring event series"),
    originalStartTime: z.string().describe("ISO-8601 timestamp of the specific occurrence being modified"),
    startTime: z.string().optional().describe("Optional new ISO-8601 start time for this single occurrence"),
    endTime: z.string().optional().describe("Optional new ISO-8601 end time for this single occurrence"),
    eventType: z.string().optional().describe("Optional new event type ('interval' or 'point')"),
    title: z.string().optional().describe("Optional new title for this occurrence"),
    location: z.string().optional().describe("Optional new location for this occurrence"),
    cancelled: z.boolean().optional().describe("Set to true to cancel this specific occurrence of the recurring series")
  }),
  outputSchema: z.object({ success: z.boolean(), detachedEventId: z.string() }),
  execute: async (input) => {
    const { isPbBackend } = await import('../../pb-compat/env');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      // Create a detached occurrence record that overrides the parent series
      const record = await pb.collection("events").create({
        user,
        title: input.title,
        startTime: input.startTime ? new Date(input.startTime).getTime() : new Date(input.originalStartTime).getTime(),
        endTime: input.endTime ? new Date(input.endTime).getTime() : undefined,
        eventType: input.eventType || "point",
        location: input.location,
        parentSeriesId: input.seriesId,
        originalStartTime: new Date(input.originalStartTime).getTime(),
        isException: true,
        cancelled: input.cancelled || false,
        createdAt: Date.now(),
      });
      return { success: true, detachedEventId: record.id };
    }

    const client = getConvexClient();
    const detachedId = await client.mutation(api.events.updateOccurrence, {
      seriesId: input.seriesId as Id<"events">,
      originalStartTime: new Date(input.originalStartTime).getTime(),
      startTime: input.startTime ? new Date(input.startTime).getTime() : undefined,
      endTime: input.endTime ? new Date(input.endTime).getTime() : undefined,
      eventType: input.eventType as "interval" | "point",
      title: input.title,
      location: input.location,
      cancelled: input.cancelled,
    });
    return { success: true, detachedEventId: detachedId as string };
  }
});
