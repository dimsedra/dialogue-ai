import PocketBase from 'pocketbase';

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
 * Computes the dot product of two vectors. Since our Xenova embeddings
 * are already L2-normalized on creation, the dot product is exactly 
 * equal to the cosine similarity.
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Searches the PocketBase memories collection by vector similarity in-memory,
 * then resolves their relationships to Tasks/Events/Habits from graph_edges.
 */
export async function retrieveGraphContext(
  pb: PocketBase,
  queryEmbedding: number[],
  options: RetrieveOptions = {}
): Promise<GraphContextResult[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  let userId = pb.authStore.record?.id;
  if (!userId) {
    try {
      // Bypasses to get the first user if run in admin or testing environment
      const firstUser = await pb.collection("users").getFirstListItem("");
      userId = firstUser?.id;
    } catch {
      return [];
    }
  }

  if (!userId) {
    return [];
  }

  // 1. Fetch all memories for the current user
  const memories = await pb.collection("memories").getFullList({
    filter: `user = "${userId}"`,
  });

  // 2. Compute similarity and sort matches
  const matches = memories
    .map((m) => {
      const emb = Array.isArray(m.embedding) ? m.embedding : [];
      const similarity = dotProduct(emb, queryEmbedding);
      return { id: m.id, text: m.text, similarity };
    })
    .filter((m) => m.similarity > threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  if (matches.length === 0) {
    return [];
  }

  // 3. Query all edges originating from these matched memories
  const matchFilter = matches.map((m) => `from_mem = "${m.id}"`).join(" || ");
  const edges = await pb.collection("graph_edges").getFullList({
    filter: `user = "${userId}" && (${matchFilter})`,
  });

  // 4. Resolve the target entities (Tasks, Events, Habits) referenced by the edges
  const taskIds = new Set<string>();
  const eventIds = new Set<string>();
  const habitIds = new Set<string>();

  for (const edge of edges) {
    if (edge.target_type === 'Task') taskIds.add(edge.to_id);
    else if (edge.target_type === 'Event') eventIds.add(edge.to_id);
    else if (edge.target_type === 'Habit') habitIds.add(edge.to_id);
  }

  const tasksPromise = taskIds.size > 0 
    ? pb.collection("tasks").getFullList({ filter: Array.from(taskIds).map((id) => `id = "${id}"`).join(" || ") })
    : Promise.resolve([]);

  const eventsPromise = eventIds.size > 0 
    ? pb.collection("events").getFullList({ filter: Array.from(eventIds).map((id) => `id = "${id}"`).join(" || ") })
    : Promise.resolve([]);

  const habitsPromise = habitIds.size > 0 
    ? pb.collection("habits").getFullList({ filter: Array.from(habitIds).map((id) => `id = "${id}"`).join(" || ") })
    : Promise.resolve([]);

  const [tasks, events, habits] = await Promise.all([tasksPromise, eventsPromise, habitsPromise]);

  const tasksMap = new Map(tasks.map((t) => [t.id, t]));
  const eventsMap = new Map((events).map((e) => [e.id, e]));
  const habitsMap = new Map((habits).map((h) => [h.id, h]));

  const toEntity = (record: any): GraphContextEntity => ({
    id: record.id,
    ...record,
  });

  // 5. Map the resolved nodes back to their matching memories
  return matches.map((m) => {
    const memEdges = edges.filter((e) => e.from_mem === m.id);
    const memTasks: GraphContextEntity[] = [];
    const memEvents: GraphContextEntity[] = [];
    const memHabits: GraphContextEntity[] = [];

    for (const edge of memEdges) {
      if (edge.target_type === 'Task') {
        const t = tasksMap.get(edge.to_id);
        if (t) memTasks.push(toEntity(t));
      } else if (edge.target_type === 'Event') {
        const e = eventsMap.get(edge.to_id);
        if (e) memEvents.push(toEntity(e));
      } else if (edge.target_type === 'Habit') {
        const h = habitsMap.get(edge.to_id);
        if (h) memHabits.push(toEntity(h));
      }
    }

    return {
      id: m.id,
      text: m.text,
      similarity: m.similarity,
      tasks: memTasks,
      events: memEvents,
      habits: memHabits,
    };
  });
}
