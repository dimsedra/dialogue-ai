import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const completeTaskTool = createTool({
  id: 'completeTask',
  description: 'Marks a task as finished/completed by its ID. CRITICAL MANDATE: MUST ask the user for confirmation first before calling this tool.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to complete"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    await pb.collection("tasks").update(input.taskId, {
      completed: true,
      progress: 100,
    });
    return { success: true, taskId: input.taskId };
  }
});
