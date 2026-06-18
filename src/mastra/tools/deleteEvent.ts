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
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const { deleteEvent } = await import('../../lib/pb-actions/deleteEvent');
    await deleteEvent({
      eventId: input.eventId,
    }, {
      user: { id: user, email: "" },
      token: pb.authStore.token || "",
    });

    return { success: true, eventId: input.eventId };
  }
});
