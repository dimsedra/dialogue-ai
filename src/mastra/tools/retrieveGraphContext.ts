import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getGraphConnection } from '../../lib/graph/ladybug';
import { getLocalEmbedding } from '../../lib/graph/embedding';

export const retrieveGraphContextTool = createTool({
  id: 'retrieveGraphContext',
  description: 'Retrieves relevant semantic memories and connected tasks/events from the LadybugDB graph based on a search query.',
  inputSchema: z.object({
    query: z.string().describe("The topic or question to search the memory graph for (e.g., 'React preferences', 'Project XYZ')"),
    limit: z.number().optional().default(5).describe("Max number of memories to retrieve")
  }),
  execute: async (input) => {
    // 1. Generate local 384-dimensional embedding for the search query
    const truncatedEmbedding = await getLocalEmbedding(input.query);

    // 2. Query LadybugDB using vector similarity
    const conn = await getGraphConnection();
    
    // In Kuzu/LadybugDB, cosine similarity is often calculated via the array_cosine_similarity function.
    // Example: array_cosine_similarity(m.embedding, $query_emb)
    const stmt = await conn.prepare(`
      MATCH (m:Memory)
      WITH m, array_cosine_similarity(m.embedding, $emb) AS similarity
      WHERE similarity > 0.6
      OPTIONAL MATCH (m)-[:MENTIONS_TASK]->(t:Task)
      OPTIONAL MATCH (m)-[:MENTIONS_EVENT]->(e:Event)
      RETURN m.id AS id, m.text AS text, similarity, 
             collect(t) AS tasks, collect(e) AS events
      ORDER BY similarity DESC
      LIMIT $limit
    `);
    
    const result = await conn.execute(stmt, { 
      emb: truncatedEmbedding,
      limit: input.limit ?? 5
    });

    // The result could be an array of QueryResult if there are multiple statements,
    // but we only have one statement, so we can cast it safely.
    const queryResult = (Array.isArray(result) ? result[0] : result) as any;
    const results = await queryResult.getAll();

    return {
      _interceptedForRead: true, // We execute silently and return to LLM
      action: "retrieveGraphContext",
      payload: { query: input.query },
      results: results
    };
  }
});
