import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const deleteEventTool = createTool({
  id: 'deleteEvent',
  description: 'Removes a scheduled event from the calendar by its ID.',
  inputSchema: z.object({
    eventId: z.string().describe("The ID of the event to delete"),
  }),
  outputSchema: z.object({ success: z.boolean(), eventId: z.string() }),
  requireApproval: true,
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const { deleteSourceMemories } = await import('../../lib/graph/ingest');
    const pb = getPbClient();
    await deleteSourceMemories(pb, input.eventId, 'Event');
    await pb.collection("events").delete(input.eventId);
    return { success: true, eventId: input.eventId };
  }
});
