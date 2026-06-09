import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

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
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

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
});
