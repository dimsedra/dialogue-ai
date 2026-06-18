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
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { parseMarkdownFile, serializeMarkdownFile } = await import('../../lib/folio/parser');
    const { existsSync, readFileSync, writeFileSync, readdirSync } = await import('fs');
    const { join } = await import('path');

    try {
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      const { folioRootPath, basePath } = getFolioContext();

      const eventsDir = join(basePath, 'events');
      if (!existsSync(eventsDir)) {
        throw new Error(`Events directory does not exist: ${eventsDir}`);
      }

      const files = readdirSync(eventsDir);
      const targetFile = files.find((f) => f.endsWith(`-${input.eventId}.md`) || f === `event-${input.eventId}.md`);
      if (!targetFile) {
        throw new Error(`Event file not found on disk for ID: ${input.eventId}`);
      }

      const filePath = join(eventsDir, targetFile);
      const fileContent = readFileSync(filePath, 'utf8');
      const { metadata, body } = parseMarkdownFile(fileContent);

      const currentNotes = body ? body.trim() : "";
      const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

      const updatedContent = serializeMarkdownFile(metadata, updatedNotes);
      writeFileSync(filePath, updatedContent, 'utf8');

      // Sync to DB (which triggers ingestEventNotes and updates database cache)
      await syncFolioFileToDb(filePath, pb, folioRootPath);

      return { success: true, eventId: input.eventId };
    } catch (err) {
      console.error('[appendEventNotes Tool] Error during execution:', err);
      throw err;
    }
  }
});
