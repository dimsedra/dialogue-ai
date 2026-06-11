import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const appendTaskNotesTool = createTool({
  id: 'appendTaskNotes',
  description: 'Appends a chronological journal entry/notes to an existing task. PREFERRED over saveSemanticMemory when information relates to a task — task notes are automatically indexed into semantic memory (with MENTIONS_TASK graph edges) via the ingestion pipeline, so a separate saveSemanticMemory call would be redundant.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to append notes to"),
    notes: z.string().describe("The new progress update, blocker details, or general context to append"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newEntry = `[${timestamp}]\n- ${input.notes.trim()}`;

    const { getPbClient } = await import('../../lib/pb-server');
    const { getVaultContext, syncVaultFileToDb } = await import('../../lib/vault/sync');
    const { parseMarkdownFile, serializeMarkdownFile } = await import('../../lib/vault/parser');
    const { existsSync, readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');

    try {
      const pb = getPbClient();
      const { vaultRootPath, basePath } = getVaultContext();

      // Normalize taskId by stripping any redundant "task-" prefix
      let cleanTaskId = input.taskId;
      if (cleanTaskId.startsWith('task-')) {
        cleanTaskId = cleanTaskId.slice(5);
      }

      const filePath = join(basePath, 'tasks', `task-${cleanTaskId}.md`);
      console.log('[appendTaskNotes Tool] Resolved filePath:', filePath);

      if (!existsSync(filePath)) {
        console.error('[appendTaskNotes Tool] Task file not found:', filePath);
        throw new Error(`Task file not found: tasks/task-${cleanTaskId}.md`);
      }

      const fileContent = readFileSync(filePath, 'utf8');
      const { metadata, body } = parseMarkdownFile(fileContent);

      const currentNotes = body ? body.trim() : "";
      const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

      const updatedContent = serializeMarkdownFile(metadata, updatedNotes);
      writeFileSync(filePath, updatedContent, 'utf8');
      console.log('[appendTaskNotes Tool] Updated file content on disk.');

      // Sync to DB
      await syncVaultFileToDb(filePath, pb, vaultRootPath);
      console.log('[appendTaskNotes Tool] Synced with DB successfully.');

      return { success: true, taskId: cleanTaskId };
    } catch (err) {
      console.error('[appendTaskNotes Tool] Error during execution:', err);
      throw err;
    }
  }
});
