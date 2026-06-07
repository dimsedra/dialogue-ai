import type { Connection } from '@ladybugdb/core';

export type EdgeType = 'MENTIONS_TASK' | 'MENTIONS_EVENT' | 'MENTIONS_HABIT';

export interface LonelyMemory {
  id: string;
  text: string;
}

export interface MemoryHealth {
  totalMemories: number;
  edgesByType: Record<EdgeType, number>;
  lonelyMemories: {
    count: number;
    sample: LonelyMemory[];
  };
}

const SAMPLE_LIMIT = 50;
const ALL_EDGE_TYPES: EdgeType[] = ['MENTIONS_TASK', 'MENTIONS_EVENT', 'MENTIONS_HABIT'];

async function runCountQuery(
  conn: Connection,
  query: string,
  params: Record<string, unknown> = {}
): Promise<number> {
  const stmt = await conn.prepare(query);
  // Cast through `any`: LadybugDB's `params` is typed as
  // `Record<string, LbugValue>` which is a recursive union; passing a plain
  // `{ limit: 50 }` object works at runtime but trips TypeScript's narrowing.
  // This matches the pattern used elsewhere in this module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await conn.execute(stmt, params as any)) as any;
  const single = Array.isArray(result) ? result[0] : result;
  const rows = await single.getAll();
  if (rows.length === 0) return 0;
  const first = rows[0] as Record<string, unknown>;
  const value = first.n ?? first.total ?? first.count;
  return typeof value === 'number' ? value : Number(value) || 0;
}

/**
 * Returns a snapshot of graph health stats: total Memory count, edge counts
 * per MENTIONS_* type, and a sample of "lonely" memories (Memories with no
 * outgoing edges at all — no MENTIONS_TASK / MENTIONS_EVENT / MENTIONS_HABIT).
 *
 * Phase 2 Stage 1.3. The plan called for "orphan detection" but the way
 * `wireMentionsEdges` is written (silent no-op on stale IDs), there are no
 * dangling edges in the graph — the MERGE simply has no rows to merge. The
 * observable failure mode is therefore a memory that *should* have mentioned
 * something but ended up with no edges. We surface those as "lonely" memories.
 *
 * The sample is bounded to 50 rows to keep the response cheap; `count` is the
 * true total even when the sample is truncated. Future work: oldest memory
 * (deferred — the Memory node schema has no `createdAt` field), dedup ratio
 * (deferred — Convex is still the source of truth for `hash`).
 */
export async function getMemoryHealth(conn: Connection): Promise<MemoryHealth> {
  const totalMemories = await runCountQuery(
    conn,
    'MATCH (m:Memory) RETURN count(m) AS total'
  );

  const edgesByType = {} as Record<EdgeType, number>;
  for (const edgeType of ALL_EDGE_TYPES) {
    edgesByType[edgeType] = await runCountQuery(
      conn,
      `MATCH ()-[r:${edgeType}]->() RETURN count(r) AS n`
    );
  }

  const lonelyStmt = await conn.prepare(
    `MATCH (m:Memory)
     WHERE NOT (m)-[]->()
     RETURN m.id AS id, m.text AS text
     LIMIT $limit`
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lonelyResult = (await conn.execute(lonelyStmt, { limit: SAMPLE_LIMIT } as any)) as any;
  const lonelySingle = Array.isArray(lonelyResult) ? lonelyResult[0] : lonelyResult;
  const lonelyRows = (await lonelySingle.getAll()) as Array<{ id: string; text: string }>;

  return {
    totalMemories,
    edgesByType,
    lonelyMemories: {
      count: lonelyRows.length,
      sample: lonelyRows.map((r) => ({ id: r.id, text: r.text })),
    },
  };
}
