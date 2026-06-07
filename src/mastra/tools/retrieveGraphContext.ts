import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getGraphConnection } from '../../lib/graph/ladybug';
import { getLocalEmbedding } from '../../lib/graph/embedding';
import { retrieveGraphContext } from '../../lib/graph/traversal';

export const retrieveGraphContextTool = createTool({
  id: 'retrieveGraphContext',
  description: 'Retrieves relevant semantic memories and connected tasks/events/habits from the LadybugDB graph based on a search query.',
  inputSchema: z.object({
    query: z.string().describe("The topic or question to search the memory graph for (e.g., 'React preferences', 'Project XYZ')"),
    limit: z.number().optional().default(5).describe("Max number of memories to retrieve"),
    threshold: z.number().optional().default(0.6).describe("Minimum cosine similarity to include a memory in the result (0-1)"),
  }),
  execute: async (input) => {
    // 1. Generate local 384-dimensional embedding for the search query
    const truncatedEmbedding = await getLocalEmbedding(input.query);

    // 2. Query LadybugDB. Phase 2 Stage 1.2: now includes MENTIONS_HABIT
    //    and scopes each OPTIONAL MATCH with WITH to fix the cartesian-
    //    product duplicate bug. Threshold is now configurable.
    const conn = await getGraphConnection();
    const results = await retrieveGraphContext(conn, truncatedEmbedding, {
      limit: input.limit,
      threshold: input.threshold,
    });

    return {
      _interceptedForRead: true, // We execute silently and return to LLM
      action: "retrieveGraphContext",
      payload: { query: input.query },
      results: results
    };
  }
});
