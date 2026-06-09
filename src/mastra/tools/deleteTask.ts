import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const deleteTaskTool = createTool({
  id: 'deleteTask',
  description: 'Deletes a task. CRITICAL MANDATE: MUST ask the user for confirmation first before calling this tool.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to delete"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const { isPbBackend } = await import('../../pb-compat/env');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const { deleteSourceMemories } = await import('../../lib/graph/ingest');
      const pb = getPbClient();
      await deleteSourceMemories(pb, input.taskId, 'Task');
      await pb.collection("tasks").delete(input.taskId);
      return { success: true, taskId: input.taskId };
    }

    const client = getConvexClient();
    await client.mutation(api.tasks.deleteTask, {
      id: input.taskId as Id<"tasks">,
    });
    return { success: true, taskId: input.taskId };
  }
});
