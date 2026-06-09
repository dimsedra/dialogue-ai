import PocketBase from 'pocketbase';

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
 * node to the referenced Task / Event / Habit nodes in PocketBase.
 * Idempotent: checks for existing edges before insertion.
 * Validates target node existence: skips creating edges to non-existent target nodes.
 */
export async function wireMentionsEdges(
  pb: PocketBase,
  memoryId: string,
  mentions: MentionsInput
): Promise<WireMentionsResult> {
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  const userId = pb.authStore.record?.id;
  if (!userId) {
    console.warn("wireMentionsEdges: No user ID found in PB store, skipping edge creation");
    const totalCount = (mentions.taskIds?.length ?? 0) + 
                       (mentions.eventIds?.length ?? 0) + 
                       (mentions.habitIds?.length ?? 0);
    return { attempted: totalCount, succeeded: 0, failed: totalCount };
  }

  for (const { rel, targetLabel, pickIds } of RELATIONSHIPS) {
    const ids = pickIds(mentions);
    if (!ids || ids.length === 0) continue;

    for (const targetId of ids) {
      attempted += 1;
      try {
        // Match LadybugDB behavior: check if the target node exists.
        // If the target node does not exist, it's a silent no-op.
        const targetCollection = targetLabel === 'Task' ? 'tasks' : targetLabel === 'Event' ? 'events' : 'habits';
        try {
          await pb.collection(targetCollection).getOne(targetId);
        } catch {
          // Stale ID: silent no-op (succeeded is incremented because no exception is thrown out)
          succeeded += 1;
          continue;
        }

        // Idempotent check: check if the edge already exists
        const existing = await pb.collection("graph_edges").getList(1, 1, {
          filter: `from_mem = "${memoryId}" && to_id = "${targetId}" && edge_type = "${rel}"`,
        });

        if (existing.items.length === 0) {
          await pb.collection("graph_edges").create({
            user: userId,
            from_mem: memoryId,
            to_id: targetId,
            target_type: targetLabel,
            edge_type: rel,
          });
        }
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
