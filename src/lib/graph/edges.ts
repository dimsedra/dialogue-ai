import type { Connection } from '@ladybugdb/core';

export interface MentionsInput {
  taskIds?: string[];
  eventIds?: string[];
  habitIds?: string[];
}

export interface WireMentionsResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

interface RelationshipSpec {
  rel: 'MENTIONS_TASK' | 'MENTIONS_EVENT' | 'MENTIONS_HABIT';
  targetLabel: 'Task' | 'Event' | 'Habit';
  pickIds: (input: MentionsInput) => string[] | undefined;
}

const RELATIONSHIPS: readonly RelationshipSpec[] = [
  { rel: 'MENTIONS_TASK', targetLabel: 'Task', pickIds: (i) => i.taskIds },
  { rel: 'MENTIONS_EVENT', targetLabel: 'Event', pickIds: (i) => i.eventIds },
  { rel: 'MENTIONS_HABIT', targetLabel: 'Habit', pickIds: (i) => i.habitIds },
] as const;

/**
 * Wires MENTIONS_TASK / MENTIONS_EVENT / MENTIONS_HABIT edges from a Memory
 * node to the referenced Task / Event / Habit nodes. Idempotent (uses MERGE).
 *
 * Returns counts of edge-creation attempts. A stale ID (pointing to a node
 * that doesn't exist) is a silent no-op via the MATCH-then-MERGE pattern;
 * it is counted as `succeeded` because no exception is thrown, even though
 * no edge was actually written. Use the MemoryHealth admin view (Stage 1.3)
 * to detect orphan edges.
 *
 * Phase 2 Stage 1.1 of the migration plan. Schema rationale:
 * `docs/migration/phase-1-graph-decision.md`.
 */
export async function wireMentionsEdges(
  conn: Connection,
  memoryId: string,
  mentions: MentionsInput
): Promise<WireMentionsResult> {
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  for (const { rel, targetLabel, pickIds } of RELATIONSHIPS) {
    const ids = pickIds(mentions);
    if (!ids || ids.length === 0) continue;

    for (const targetId of ids) {
      attempted += 1;
      try {
        const stmt = await conn.prepare(
          `MATCH (m:Memory {id: $mid}) ` +
          `MATCH (t:${targetLabel} {id: $tid}) ` +
          `MERGE (m)-[:${rel}]->(t)`
        );
        await conn.execute(stmt, { mid: memoryId, tid: targetId });
        succeeded += 1;
      } catch (e: any) {
        failed += 1;
        console.warn(
          `wireMentionsEdges: failed to create ${rel} edge ` +
          `from Memory ${memoryId} to ${targetLabel} ${targetId}:`,
          e?.message ?? e
        );
      }
    }
  }

  return { attempted, succeeded, failed };
}
