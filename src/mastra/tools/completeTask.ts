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
      console.log('[completeTask Tool] Resolved filePath:', filePath);

      if (!existsSync(filePath)) {
        console.error('[completeTask Tool] Task file not found:', filePath);
        throw new Error(`Task file not found: tasks/task-${cleanTaskId}.md`);
      }

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
      await syncVaultFileToDb(filePath, pb, vaultRootPath);
      console.log('[completeTask Tool] Synced with DB successfully.');

      return { success: true, taskId: cleanTaskId };
    } catch (err) {
      console.error('[completeTask Tool] Error during execution:', err);
      throw err;
    }
  }
});
