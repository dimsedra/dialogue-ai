import type { Connection } from '@ladybugdb/core';

export interface GraphContextEntity {
  id: string;
  [key: string]: unknown;
}

export interface GraphContextResult {
  id: string;
  text: string;
  similarity: number;
  tasks: GraphContextEntity[];
  events: GraphContextEntity[];
  habits: GraphContextEntity[];
}

export interface RetrieveOptions {
  limit?: number;
  threshold?: number;
}

const DEFAULT_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.6;

/**
 * Searches the LadybugDB Memory graph by vector similarity, then expands
 * each match to its MENTIONS_TASK / MENTIONS_EVENT / MENTIONS_HABIT entities
 * in a single query.
 *
 * Phase 2 Stage 1.2 of the migration plan. The query uses `WITH` between
 * each OPTIONAL MATCH to scope the aggregation, preventing the cartesian-
 * product duplicate bug that the original query suffered from: a memory
 * with 2 tasks and 1 event produced 2*1=2 rows in the old query, and
 * `collect(t)` over those 2 rows duplicated the event (and vice versa).
 *
 * The threshold defaults to 0.6 (the value the original tool used
 * hard-coded); pass `threshold` to override.
 */
export async function retrieveGraphContext(
  conn: Connection,
  queryEmbedding: number[],
  options: RetrieveOptions = {}
): Promise<GraphContextResult[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  const stmt = await conn.prepare(`
    MATCH (m:Memory)
    WITH m, array_cosine_similarity(m.embedding, CAST($emb AS FLOAT[384])) AS similarity
    WHERE similarity > $threshold
    OPTIONAL MATCH (m)-[:MENTIONS_TASK]->(t:Task)
    WITH m, similarity, collect(t) AS tasks
    OPTIONAL MATCH (m)-[:MENTIONS_EVENT]->(e:Event)
    WITH m, similarity, tasks, collect(e) AS events
    OPTIONAL MATCH (m)-[:MENTIONS_HABIT]->(h:Habit)
    WITH m, similarity, tasks, events, collect(h) AS habits
    RETURN
      m.id      AS id,
      m.text    AS text,
      similarity,
      tasks,
      events,
      habits
    ORDER BY similarity DESC
    LIMIT $limit
  `);

  const result = (await conn.execute(stmt, {
    emb: queryEmbedding,
    threshold,
    limit,
  })) as any;
  const single = Array.isArray(result) ? result[0] : result;
  const rows = await single.getAll();

  // Normalise OPTIONAL MATCH nulls to empty arrays. When an OPTIONAL MATCH
  // finds no rows, `collect(...)` returns null, not `[]`. Downstream callers
  // (the LLM prompt, the chat UI) treat these as empty lists, so we coalesce
  // here once rather than at every consumer.
  return rows.map((row: any) => ({
    id: row.id,
    text: row.text,
    similarity: row.similarity,
    tasks: row.tasks ?? [],
    events: row.events ?? [],
    habits: row.habits ?? [],
  }));
}
