import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import crypto from 'crypto';
import { getGraphConnection } from '../../lib/graph/ladybug';
import { getLocalEmbedding } from '../../lib/graph/embedding';
import { wireMentionsEdges } from '../../lib/graph/edges';

export const saveSemanticMemoryTool = createTool({
  id: 'saveSemanticMemory',
  description: 'Saves a granular, long-term semantic memory/fact about the user (e.g., technical preferences, project details).',
  inputSchema: z.object({
    text: z.string().describe("The granular fact or preference to remember"),
    taskIds: z.array(z.string()).optional().describe("Optional: Task node IDs this memory mentions. Creates MENTIONS_TASK edges in LadybugDB."),
    eventIds: z.array(z.string()).optional().describe("Optional: Event node IDs this memory mentions. Creates MENTIONS_EVENT edges in LadybugDB."),
    habitIds: z.array(z.string()).optional().describe("Optional: Habit node IDs this memory mentions. Creates MENTIONS_HABIT edges in LadybugDB."),
  }),
  execute: async (input) => {
    // Memory tools are strictly EXEMPT from the consent gate. They run silently.
    
    // 1. Generate local 384-dimensional embedding
    const truncatedEmbedding = await getLocalEmbedding(input.text);

    // 2. Save to LadybugDB Graph
    const conn = await getGraphConnection();
    const id = crypto.randomUUID();
    
    // Note: In Kuzu/LadybugDB, query parameters are passed differently depending on the driver,
    // usually using an object map.
    const stmt = await conn.prepare("CREATE (m:Memory {id: $id, text: $text, embedding: $emb})");
    await conn.execute(stmt, { 
      id, 
      text: input.text, 
      emb: truncatedEmbedding 
    });

    // 3. Wire MENTIONS_* edges (Phase 2 Stage 1.1 — graph decision from
    //    docs/migration/phase-1-graph-decision.md). Edges are idempotent via MERGE.
    await wireMentionsEdges(conn, id, {
      taskIds: input.taskIds,
      eventIds: input.eventIds,
      habitIds: input.habitIds,
    });

    // 4. Save to Convex so it appears in the UI Memories table
    const convexServerClient = (await import('../../lib/convex-server')).convexServerClient;
    const { api } = await import('../../../convex/_generated/api');
    
    await convexServerClient.mutation(api.ai.saveMemoryBackendSync, {
      text: input.text,
      embedding: truncatedEmbedding,
      // create a hash for deduplication logic inside Convex
      hash: crypto.createHash('sha256').update(input.text).digest('hex')
    });

    return {
      _silentExecution: true,
      action: "saveSemanticMemory",
      payload: { id, text: input.text },
      status: "Memory securely sent to Graph Engine queue and UI backend."
    };
  }
});
