import { describe, test, expect, beforeEach } from 'vitest';
import PocketBase from 'pocketbase';
import { getMemoryHealth } from './health';
import { wireMentionsEdges } from './edges';

// ============================================================================
// In-Memory Mock PocketBase Client for Graph Unit Testing
// ============================================================================

function matchSimpleCondition(item: any, cond: string): boolean {
  const match = cond.match(/^([\w_]+)\s*=\s*(.+)$/);
  if (!match) return false;
  const key = match[1];
  let val = match[2].trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.substring(1, val.length - 1);
  }
  const itemVal = item[key];
  return String(itemVal) === String(val);
}

function matchFilter(item: any, filter: string): boolean {
  const parts = filter.split("&&").map(p => p.trim());
  for (const part of parts) {
    if (part.includes("||")) {
      const groupStr = part.replace(/[()]/g, "");
      const subParts = groupStr.split("||").map(sp => sp.trim());
      let anyMatch = false;
      for (const subPart of subParts) {
        if (matchSimpleCondition(item, subPart)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) return false;
    } else {
      if (!matchSimpleCondition(item, part)) return false;
    }
  }
  return true;
}

class MockPocketBase {
  authStore = {
    record: { id: "test-user-id", collectionName: "users" }
  };

  collections: Record<string, any> = {};

  constructor() {
    this.reset();
  }

  reset() {
    this.collections = {
      users: this.createMockCollection([{ id: "test-user-id" }]),
      memories: this.createMockCollection([]),
      graph_edges: this.createMockCollection([]),
      tasks: this.createMockCollection([]),
      events: this.createMockCollection([]),
      habits: this.createMockCollection([]),
    };
  }

  createMockCollection(initialItems: any[]) {
    const items = [...initialItems];
    return {
      items,
      getList: async (page: number, limit: number, options: any) => {
        let filtered = [...items];
        if (options?.filter) {
          filtered = filtered.filter(item => matchFilter(item, options.filter));
        }
        return {
          items: filtered.slice((page - 1) * limit, page * limit),
          totalItems: filtered.length,
        };
      },
      getOne: async (id: string) => {
        const item = items.find(i => i.id === id);
        if (!item) throw new Error("404 Not Found");
        return item;
      },
      create: async (data: any) => {
        const newItem = { id: data.id || `id-${Math.random()}`, ...data };
        items.push(newItem);
        return newItem;
      },
      getFullList: async (options: any) => {
        let filtered = [...items];
        if (options?.filter) {
          filtered = filtered.filter(item => matchFilter(item, options.filter));
        }
        return filtered;
      },
      delete: async (id: string) => {
        const idx = items.findIndex(item => item.id === id);
        if (idx !== -1) {
          items.splice(idx, 1);
        }
        return true;
      }
    };
  }

  collection(name: string) {
    return this.collections[name];
  }
}

const pbMock = new MockPocketBase() as unknown as PocketBase;

const DIM = 384;
const ZERO_VEC = new Array(DIM).fill(0);

async function createTask(id: string, title: string, category = 'test') {
  await pbMock.collection('tasks').create({ id, title, category });
}

async function createEvent(id: string, title: string) {
  await pbMock.collection('events').create({ id, title });
}

async function createHabit(id: string, name: string) {
  await pbMock.collection('habits').create({ id, name });
}

async function createMemory(id: string, text: string) {
  await pbMock.collection('memories').create({ id, text, embedding: ZERO_VEC, user: "test-user-id" });
}

beforeEach(() => {
  (pbMock as any).reset();
});

describe('getMemoryHealth', () => {
  test('returns zero counts on an empty graph', async () => {
    const health = await getMemoryHealth(pbMock);
    expect(health.totalMemories).toBe(0);
    expect(health.edgesByType).toEqual({
      MENTIONS_TASK: 0,
      MENTIONS_EVENT: 0,
      MENTIONS_HABIT: 0,
    });
    expect(health.lonelyMemories.count).toBe(0);
    expect(health.lonelyMemories.sample).toEqual([]);
  });

  test('counts all memories regardless of edge state', async () => {
    await createMemory('mem-1', 'first');
    await createMemory('mem-2', 'second');
    await createMemory('mem-3', 'third');

    const health = await getMemoryHealth(pbMock);
    expect(health.totalMemories).toBe(3);
  });

  test('counts edges per MENTIONS_* type independently', async () => {
    await createTask('task-1', 'Task 1');
    await createTask('task-2', 'Task 2');
    await createEvent('event-1', 'Event 1');
    await createHabit('habit-1', 'Habit 1');
    await createHabit('habit-2', 'Habit 2');
    await createHabit('habit-3', 'Habit 3');
    await createMemory('mem-tasks', 'memory that mentions tasks');
    await createMemory('mem-events', 'memory that mentions event');
    await createMemory('mem-habits', 'memory that mentions habits');
    await createMemory('mem-mixed', 'mixed memory');

    await wireMentionsEdges(pbMock, 'mem-tasks', { taskIds: ['task-1', 'task-2'] });
    await wireMentionsEdges(pbMock, 'mem-events', { eventIds: ['event-1'] });
    await wireMentionsEdges(pbMock, 'mem-habits', { habitIds: ['habit-1', 'habit-2', 'habit-3'] });
    await wireMentionsEdges(pbMock, 'mem-mixed', {
      taskIds: ['task-1'],
      eventIds: ['event-1'],
      habitIds: ['habit-1'],
    });

    const health = await getMemoryHealth(pbMock);
    expect(health.edgesByType).toEqual({
      MENTIONS_TASK: 3, // 2 from mem-tasks + 1 from mem-mixed
      MENTIONS_EVENT: 2, // 1 from mem-events + 1 from mem-mixed
      MENTIONS_HABIT: 4, // 3 from mem-habits + 1 from mem-mixed
    });
  });

  test('detects lonely memories (Memories with no outgoing edges)', async () => {
    await createMemory('mem-lonely-1', 'no mentions at all');
    await createMemory('mem-lonely-2', 'also no mentions');
    await createMemory('mem-connected', 'this one has mentions');

    await createTask('task-1', 'Task 1');
    await wireMentionsEdges(pbMock, 'mem-connected', { taskIds: ['task-1'] });

    const health = await getMemoryHealth(pbMock);
    expect(health.totalMemories).toBe(3);
    expect(health.lonelyMemories.count).toBe(2);
    const lonelyIds = health.lonelyMemories.sample.map((m) => m.id).sort();
    expect(lonelyIds).toEqual(['mem-lonely-1', 'mem-lonely-2']);
    const texts = health.lonelyMemories.sample.map((m) => m.text).sort();
    expect(texts).toEqual(['also no mentions', 'no mentions at all']);
  });

  test('counts stale-ID no-op writes as successes but does NOT mark Memory as connected', async () => {
    await createMemory('mem-stale', 'memory with stale task ID');
    await wireMentionsEdges(pbMock, 'mem-stale', { taskIds: ['nonexistent-task-id'] });

    const health = await getMemoryHealth(pbMock);
    expect(health.totalMemories).toBe(1);
    expect(health.edgesByType.MENTIONS_TASK).toBe(0);
    expect(health.lonelyMemories.count).toBe(1);
    expect(health.lonelyMemories.sample[0].id).toBe('mem-stale');
  });

  test('caps the lonely sample at 50 and reports the cap as the count', async () => {
    for (let i = 0; i < 55; i++) {
      await createMemory(`mem-lonely-${i}`, `lonely ${i}`);
    }

    const health = await getMemoryHealth(pbMock);
    expect(health.totalMemories).toBe(55);
    expect(health.lonelyMemories.count).toBe(55);
    expect(health.lonelyMemories.sample).toHaveLength(50);
  });
});
