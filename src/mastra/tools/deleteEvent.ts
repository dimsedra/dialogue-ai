import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';

export const deleteEventTool = createTool({
  id: 'deleteEvent',
  description: 'Removes a scheduled event from the calendar by its ID. CRITICAL MANDATE: MUST ask the user for confirmation first before calling this tool.',
  inputSchema: z.object({
    eventId: z.string().describe("The ID of the event to delete"),
  }),
  outputSchema: z.object({ success: z.boolean(), eventId: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    await client.mutation(api.events.remove, {
      id: input.eventId as any,
    });
    return { success: true, eventId: input.eventId };
  }
});
