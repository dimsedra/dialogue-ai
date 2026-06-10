import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const appendEventNotesTool = createTool({
  id: 'appendEventNotes',
  description: 'Appends a chronological journal entry, prep details, or outcome summary to an existing event. PREFERRED over saveSemanticMemory when information relates to an event — event notes are automatically indexed into semantic memory (with MENTIONS_EVENT graph edges) via the ingestion pipeline, so a separate saveSemanticMemory call would be redundant.',
  inputSchema: z.object({
    eventId: z.string().describe("The ID of the event to append notes to"),
    notes: z.string().describe("The note, prep detail, or post-event outcome context to append"),
  }),
  outputSchema: z.object({ success: z.boolean(), eventId: z.string() }),
  execute: async (input) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newEntry = `[${timestamp}]\n- ${input.notes.trim()}`;

    const { getPbClient } = await import('../../lib/pb-server');
    const { ingestEventNotes } = await import('../../lib/graph/ingest');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const event = await pb.collection("events").getOne(input.eventId);
    const currentNotes = event.notes ? event.notes.trim() : "";
    const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

    await pb.collection("events").update(input.eventId, { notes: updatedNotes });
    await ingestEventNotes(pb, input.eventId, updatedNotes, event.outcome);

    return { success: true, eventId: input.eventId };
  }
});
