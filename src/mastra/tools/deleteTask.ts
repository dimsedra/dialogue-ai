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
    const { getPbClient } = await import('../../lib/pb-server');
    const { deleteSourceMemories } = await import('../../lib/graph/ingest');
    const pb = getPbClient();
    await deleteSourceMemories(pb, input.taskId, 'Task');
    await pb.collection("tasks").delete(input.taskId);
    return { success: true, taskId: input.taskId };
  }
});
