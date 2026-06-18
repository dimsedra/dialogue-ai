import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const completeTaskTool = createTool({
  id: 'completeTask',
  description: 'Marks a task as finished/completed by its ID.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to complete"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  requireApproval: true,
  execute: async (input) => {
    console.log('[completeTask Tool] Executing with input:', input);
    const { getPbClient } = await import('../../lib/pb-server');
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { parseMarkdownFile, serializeMarkdownFile } = await import('../../lib/folio/parser');
    const { existsSync, readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');

    try {
      const pb = getPbClient();
      const { folioRootPath, basePath } = getFolioContext();

      // Normalize taskId by stripping any redundant "task-" prefix
      let cleanTaskId = input.taskId;
      if (cleanTaskId.startsWith('task-')) {
        cleanTaskId = cleanTaskId.slice(5);
      }

      const tasksDir = join(basePath, 'tasks');
      if (!existsSync(tasksDir)) {
        throw new Error(`Tasks directory does not exist: ${tasksDir}`);
      }

      const { readdirSync } = await import('fs');
      const files = readdirSync(tasksDir);
      const targetFile = files.find((f) => f.endsWith(`-${cleanTaskId}.md`) || f === `task-${cleanTaskId}.md`);
      if (!targetFile) {
        throw new Error(`Task file not found on disk for ID: ${cleanTaskId}`);
      }

      const filePath = join(tasksDir, targetFile);
      console.log('[completeTask Tool] Resolved filePath:', filePath);

      const fileContent = readFileSync(filePath, 'utf8');
      const { metadata, body } = parseMarkdownFile(fileContent);
      console.log('[completeTask Tool] Current metadata:', metadata);

      metadata.completed = true;
      metadata.status = 'completed';
      metadata.progress = 100;
      metadata.completedAt = new Date().toISOString();

      const updatedContent = serializeMarkdownFile(metadata, body);
      writeFileSync(filePath, updatedContent, 'utf8');
      console.log('[completeTask Tool] Updated file content on disk.');

      // Sync to DB
      await syncFolioFileToDb(filePath, pb, folioRootPath);
      console.log('[completeTask Tool] Synced with DB successfully.');

      return { success: true, taskId: cleanTaskId };
    } catch (err) {
      console.error('[completeTask Tool] Error during execution:', err);
      throw err;
    }
  }
});
