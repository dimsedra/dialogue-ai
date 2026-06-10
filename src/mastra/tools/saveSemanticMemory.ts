import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import crypto from 'crypto';
import { getLocalEmbedding } from '../../lib/graph/embedding';
import { wireMentionsEdges } from '../../lib/graph/edges';

export const saveSemanticMemoryTool = createTool({
  id: 'saveSemanticMemory',
  description: 'Saves a granular, long-term semantic memory/fact about the user. Use ONLY for general user knowledge (preferences, life context, personal background) that is NOT associated with any existing task, event, or habit. If the information relates to a specific task, event, or habit, use their respective note/log tool instead — those auto-index into semantic memory, making this call redundant.',
  inputSchema: z.object({
    text: z.string().describe("The granular fact or preference to remember"),
    taskIds: z.array(z.string()).optional().describe("Optional: Task node IDs this memory mentions. Creates MENTIONS_TASK edges in the graph."),
    eventIds: z.array(z.string()).optional().describe("Optional: Event node IDs this memory mentions. Creates MENTIONS_EVENT edges in the graph."),
    habitIds: z.array(z.string()).optional().describe("Optional: Habit node IDs this memory mentions. Creates MENTIONS_HABIT edges in the graph."),
  }),
  execute: async (input) => {
    // Memory tools are strictly EXEMPT from the consent gate. They run silently.
    
    // 1. Generate local 384-dimensional embedding
    const truncatedEmbedding = await getLocalEmbedding(input.text);

    const { getPbClient } = await import('../../lib/pb-server');
    const pbClient = getPbClient();
    const userId = pbClient.authStore.record?.id;
    let memoryId: string = crypto.randomUUID();
    
    if (userId) {
      const hash = crypto.createHash('sha256').update(input.text).digest('hex');
      const existing = await pbClient.collection("memories").getList(1, 1, {
        filter: `user = "${userId}" && hash = "${hash}"`,
      });

      let memoryRecord;
      if (existing.items.length > 0) {
        memoryRecord = await pbClient.collection("memories").update(existing.items[0].id, {
          text: input.text,
          embedding: truncatedEmbedding,
        });
      } else {
        memoryRecord = await pbClient.collection("memories").create({
          user: userId,
          text: input.text,
          embedding: truncatedEmbedding,
          hash: hash,
        });
      }
      memoryId = memoryRecord.id;

      await wireMentionsEdges(pbClient, memoryId, {
        taskIds: input.taskIds,
        eventIds: input.eventIds,
        habitIds: input.habitIds,
      });
    } else {
      console.warn("No user ID found in PB store, skipping memory UI save");
    }

    return {
      _silentExecution: true,
      action: "saveSemanticMemory",
      payload: { id: memoryId, text: input.text },
      status: "Memory securely sent to Graph Engine queue and UI backend."
    };
  }
});
