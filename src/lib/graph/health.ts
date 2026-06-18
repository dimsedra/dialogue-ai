import PocketBase from 'pocketbase';
import { getActiveUserId } from '../pb-server';

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

/**
 * Returns a snapshot of graph health stats from PocketBase: total Memory count,
 * edge counts per MENTIONS_* type, and a sample of "lonely" memories (Memories
 * with no outgoing edges in the graph_edges collection).
 */
export async function getMemoryHealth(pb: PocketBase): Promise<MemoryHealth> {
  const userId = await getActiveUserId(pb);

  if (!userId) {
    return {
      totalMemories: 0,
      edgesByType: {
        MENTIONS_TASK: 0,
        MENTIONS_EVENT: 0,
        MENTIONS_HABIT: 0,
      },
      lonelyMemories: {
        count: 0,
        sample: [],
      },
    };
  }

  // 1. Get total memory count
  const memoriesResult = await pb.collection("memories").getList(1, 1, {
    filter: `user = "${userId}"`,
  });
  const totalMemories = memoriesResult.totalItems;

  // 2. Get edge counts by type
  const edgesByType = {} as Record<EdgeType, number>;
  for (const edgeType of ALL_EDGE_TYPES) {
    const edgeResult = await pb.collection("graph_edges").getList(1, 1, {
      filter: `user = "${userId}" && edge_type = "${edgeType}"`,
    });
    edgesByType[edgeType] = edgeResult.totalItems;
  }

  // 3. Find lonely memories: fetch all memory IDs and all edges, then diff in-memory
  const allMemories = await pb.collection("memories").getFullList({
    filter: `user = "${userId}"`,
    fields: "id,text",
  });

  const allEdges = await pb.collection("graph_edges").getFullList({
    filter: `user = "${userId}"`,
    fields: "from_mem",
  });

  const connectedMemIds = new Set(allEdges.map((e) => e.from_mem));
  const lonelyMemories = allMemories.filter((m) => !connectedMemIds.has(m.id));
  const sample = lonelyMemories.slice(0, SAMPLE_LIMIT).map((m) => ({ id: m.id, text: m.text }));

  return {
    totalMemories,
    edgesByType,
    lonelyMemories: {
      count: lonelyMemories.length,
      sample,
    },
  };
}
