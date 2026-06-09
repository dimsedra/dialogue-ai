import { describe, test, expect, beforeEach } from 'vitest';
import PocketBase from 'pocketbase';
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
    record: { id: "test-user-id" }
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

// Helper helpers to populate our mock DB
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
  await pbMock.collection('memories').create({ id, text, embedding: Array(384).fill(0.1) });
}

async function countEdges(
  memoryId: string,
  rel: string,
  targetLabel: string
): Promise<number> {
  const list = await pbMock.collection('graph_edges').getFullList({
    filter: `from_mem = "${memoryId}" && edge_type = "${rel}" && target_type = "${targetLabel}"`,
  });
  return list.length;
}

beforeEach(() => {
  (pbMock as any).reset();
});

describe('wireMentionsEdges', () => {
  test('creates a MENTIONS_TASK edge for a valid taskId', async () => {
    await createTask('task-1', 'Ship the dialogue binary');
    await createMemory('mem-1', 'user is shipping dialogue as a desktop app');

    const result = await wireMentionsEdges(pbMock, 'mem-1', { taskIds: ['task-1'] });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(await countEdges('mem-1', 'MENTIONS_TASK', 'Task')).toBe(1);
  });

  test('creates a MENTIONS_EVENT edge for a valid eventId', async () => {
    await createEvent('event-1', 'Dentist appointment');
    await createMemory('mem-2', 'user has a dentist appointment coming up');

    const result = await wireMentionsEdges(pbMock, 'mem-2', { eventIds: ['event-1'] });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(await countEdges('mem-2', 'MENTIONS_EVENT', 'Event')).toBe(1);
  });

  test('creates a MENTIONS_HABIT edge for a valid habitId', async () => {
    await createHabit('habit-1', 'morning run');
    await createMemory('mem-3', 'user is training for a 5k');

    const result = await wireMentionsEdges(pbMock, 'mem-3', { habitIds: ['habit-1'] });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(await countEdges('mem-3', 'MENTIONS_HABIT', 'Habit')).toBe(1);
  });

  test('creates multiple edge types in one call', async () => {
    await createTask('task-2', 'Project Phoenix');
    await createEvent('event-2', 'Phoenix launch');
    await createHabit('habit-2', 'weekly review');
    await createMemory('mem-4', 'user is wrapping up project phoenix');

    const result = await wireMentionsEdges(pbMock, 'mem-4', {
      taskIds: ['task-2'],
      eventIds: ['event-2'],
      habitIds: ['habit-2'],
    });
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(await countEdges('mem-4', 'MENTIONS_TASK', 'Task')).toBe(1);
    expect(await countEdges('mem-4', 'MENTIONS_EVENT', 'Event')).toBe(1);
    expect(await countEdges('mem-4', 'MENTIONS_HABIT', 'Habit')).toBe(1);
  });

  test('creates multiple edges of the same type from one memory', async () => {
    await createTask('task-3', 'Task A');
    await createTask('task-4', 'Task B');
    await createTask('task-5', 'Task C');
    await createMemory('mem-5', 'user has multiple active tasks');

    const result = await wireMentionsEdges(pbMock, 'mem-5', {
      taskIds: ['task-3', 'task-4', 'task-5'],
    });
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(await countEdges('mem-5', 'MENTIONS_TASK', 'Task')).toBe(3);
  });

  test('is a no-op when no mentions are provided', async () => {
    await createMemory('mem-6', 'memory text');

    const result = await wireMentionsEdges(pbMock, 'mem-6', {});
    expect(result.attempted).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test('is a no-op when mention arrays are empty', async () => {
    await createMemory('mem-7', 'memory text');

    const result = await wireMentionsEdges(pbMock, 'mem-7', {
      taskIds: [],
      eventIds: [],
      habitIds: [],
    });
    expect(result.attempted).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test('is idempotent — second call with same args does not throw and edge count stays at 1', async () => {
    await createTask('task-6', 'Idempotent task');
    await createMemory('mem-8', 'memory text');

    const first = await wireMentionsEdges(pbMock, 'mem-8', { taskIds: ['task-6'] });
    expect(first.succeeded).toBe(1);

    const second = await wireMentionsEdges(pbMock, 'mem-8', { taskIds: ['task-6'] });
    expect(second.attempted).toBe(1);
    expect(second.succeeded).toBe(1);
    expect(second.failed).toBe(0);
    expect(await countEdges('mem-8', 'MENTIONS_TASK', 'Task')).toBe(1);
  });

  test('stale IDs do not throw — they are silent no-ops (target check returns 404)', async () => {
    await createMemory('mem-9', 'memory text');

    const result = await wireMentionsEdges(pbMock, 'mem-9', {
      taskIds: ['nonexistent-task'],
    });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(await countEdges('mem-9', 'MENTIONS_TASK', 'Task')).toBe(0);
  });

  test('mixed valid + stale IDs — valid edges are created, stale are silent no-ops', async () => {
    await createTask('task-7', 'Real task');
    await createMemory('mem-10', 'memory text');

    const result = await wireMentionsEdges(pbMock, 'mem-10', {
      taskIds: ['task-7', 'ghost-task'],
    });
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(await countEdges('mem-10', 'MENTIONS_TASK', 'Task')).toBe(1);
  });
});
