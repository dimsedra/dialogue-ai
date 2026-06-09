import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const appendEventNotesTool = createTool({
  id: 'appendEventNotes',
  description: 'Appends a new chronological journal entry, prep details, or outcome summary to an existing event.',
  inputSchema: z.object({
    eventId: z.string().describe("The ID of the event to append notes to"),
    notes: z.string().describe("The note, prep detail, or post-event outcome context to append"),
  }),
  outputSchema: z.object({ success: z.boolean(), eventId: z.string() }),
  execute: async (input) => {
    const { isPbBackend } = await import('../../pb-compat/env');
    
    // Format timestamp
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newEntry = `[${timestamp}]\n- ${input.notes.trim()}`;

    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const { ingestEventNotes } = await import('../../lib/graph/ingest');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      // 1. Fetch current event
      const event = await pb.collection("events").getOne(input.eventId);
      const currentNotes = event.notes ? event.notes.trim() : "";
      const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

      // 2. Update event
      await pb.collection("events").update(input.eventId, { notes: updatedNotes });

      // 3. Ingest notes semantically into the graph
      await ingestEventNotes(pb, input.eventId, updatedNotes, event.outcome);

      return { success: true, eventId: input.eventId };
    }

    // Convex fallback
    const client = getConvexClient();
    const event = await client.query(api.events.get, { id: input.eventId as Id<"events"> });
    const currentNotes = event?.notes ? event.notes.trim() : "";
    const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

    await client.mutation(api.events.update, {
      id: input.eventId as Id<"events">,
      notes: updatedNotes,
    });

    return { success: true, eventId: input.eventId };
  }
});
