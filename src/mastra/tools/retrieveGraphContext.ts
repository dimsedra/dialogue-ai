import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getLocalEmbedding } from '../../lib/graph/embedding';
import { retrieveGraphContext } from '../../lib/graph/traversal';

export const retrieveGraphContextTool = createTool({
  id: 'retrieveGraphContext',
  description: 'Retrieves relevant semantic memories and connected tasks/events/habits from the graph based on a search query.',
  inputSchema: z.object({
    query: z.string().describe("The topic or question to search the memory graph for (e.g., 'React preferences', 'Project XYZ')"),
    limit: z.number().optional().default(5).describe("Max number of memories to retrieve"),
    threshold: z.number().optional().default(0.6).describe("Minimum cosine similarity to include a memory in the result (0-1)"),
  }),
  execute: async (input) => {
    // 1. Generate local 384-dimensional embedding for the search query
    const truncatedEmbedding = await getLocalEmbedding(input.query);

    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const results = await retrieveGraphContext(pb, truncatedEmbedding, {
      limit: input.limit,
      threshold: input.threshold,
    });

    return {
      action: "retrieveGraphContext",
      query: input.query,
      results
    };
  },
  toModelOutput: (output: any) => {
    if (!output.results?.length) return `No memories found for "${output.query}".`;
    return output.results.map((r: any, i: number) =>
      `[${i + 1}] "${r.text}" (relevance: ${r.similarity.toFixed(2)})` +
      (r.tasks?.length ? ` — linked to ${r.tasks.length} task(s)` : '') +
      (r.events?.length ? ` — linked to ${r.events.length} event(s)` : '') +
      (r.habits?.length ? ` — linked to ${r.habits.length} habit(s)` : '')
    ).join('\n');
  },
  background: { enabled: true }
});
