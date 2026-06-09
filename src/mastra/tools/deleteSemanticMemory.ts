import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const deleteSemanticMemoryTool = createTool({
  id: 'deleteSemanticMemory',
  description: 'Deletes a semantic memory from the graph.',
  inputSchema: z.object({
    memoryId: z.string(),
  }),
  execute: async (input) => {
    const { isPbBackend } = await import('../../pb-compat/env');
    
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("memories").delete(input.memoryId);
    } else {
      const { convexServerClient } = await import('../../lib/convex-server');
      const { api } = await import('../../../convex/_generated/api');
      // Convex fallback
      await convexServerClient.mutation(api.ai.deleteMemoryBackendSync as any, {
        id: input.memoryId
      });
    }

    return {
      _interceptedForConsent: true,
      action: "deleteSemanticMemory",
      payload: input
    };
  }
});
