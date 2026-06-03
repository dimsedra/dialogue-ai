import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getGraphConnection } from '../../lib/graph/ladybug';

export const deleteSemanticMemoryTool = createTool({
  id: 'deleteSemanticMemory',
  description: 'Deletes a semantic memory from the graph.',
  inputSchema: z.object({
    memoryId: z.string(),
  }),
  execute: async (input) => {
    const conn = await getGraphConnection();
    const stmt = await conn.prepare("MATCH (m:Memory {id: $id}) DETACH DELETE m");
    await conn.execute(stmt, { id: input.memoryId });

    return {
      _interceptedForConsent: true,
      action: "deleteSemanticMemory",
      payload: input
    };
  }
});
