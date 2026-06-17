import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const deleteTaskTool = createTool({
  id: 'deleteTask',
  description: 'Deletes a task.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to delete"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  requireApproval: true,
  execute: async (input) => {
    console.log('[deleteTask Tool] Executing with input:', input);
    const { getPbClient } = await import('../../lib/pb-server');
    const { deleteSourceMemories } = await import('../../lib/graph/ingest');
    const { getFolioContext } = await import('../../lib/folio/sync');
    const { existsSync, unlinkSync } = await import('fs');
    const { join } = await import('path');

    try {
      const pb = getPbClient();
      const { basePath } = getFolioContext();

      // Normalize taskId by stripping any redundant "task-" prefix
      let cleanTaskId = input.taskId;
      if (cleanTaskId.startsWith('task-')) {
        cleanTaskId = cleanTaskId.slice(5);
      }

      const filePath = join(basePath, 'tasks', `task-${cleanTaskId}.md`);
      console.log('[deleteTask Tool] Resolved filePath:', filePath);

      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log('[deleteTask Tool] Deleted task file from disk.');
      } else {
        console.warn('[deleteTask Tool] Task file to delete not found on disk:', filePath);
      }

      // Clean up DB cache and RAG memories
      await deleteSourceMemories(pb, cleanTaskId, 'Task');
      console.log('[deleteTask Tool] Cleared RAG memories.');

      try {
        await pb.collection("tasks").delete(cleanTaskId);
        console.log('[deleteTask Tool] Deleted PocketBase task record.');
      } catch (err) {
        console.warn('[deleteTask Tool] Failed or already deleted from PocketBase:', err);
      }

      return { success: true, taskId: cleanTaskId };
    } catch (err) {
      console.error('[deleteTask Tool] Error during execution:', err);
      throw err;
    }
  }
});
