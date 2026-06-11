import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const deleteSemanticMemoryTool = createTool({
  id: 'deleteSemanticMemory',
  description: 'Deletes a semantic memory from the graph.',
  inputSchema: z.object({
    memoryId: z.string(),
  }),
  requireApproval: true,
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    await pb.collection("memories").delete(input.memoryId);

    return { success: true, memoryId: input.memoryId };
  }
});
