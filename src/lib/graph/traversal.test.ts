import { describe, test, expect, beforeEach } from 'vitest';
import PocketBase from 'pocketbase';
import { retrieveGraphContext } from './traversal';
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
  for (let part of parts) {
    // Strip outer parentheses if present
    if (part.startsWith("(") && part.endsWith(")")) {
      part = part.substring(1, part.length - 1).trim();
    }
    if (part.includes("||")) {
      const subParts = part.split("||").map(sp => sp.trim());
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

const DIM = 384;
const QUERY_VEC = makeVec(1, 0, 0);    // [1, 0, ..., 0]
const HIGH_VEC  = makeVec(0.99, 0.01, 0); // Normalized cos sim ~0.99 vs QUERY
const MID_VEC   = makeVec(0.71, 0.70, 0); // Normalized cos sim ~0.71 vs QUERY
const LOW_VEC   = makeVec(0, 0, 1);     // Orthogonal

function makeVec(a: number, b: number, c: number): number[] {
  const v = new Array(DIM).fill(0);
  v[0] = a;
  v[1] = b;
  v[DIM - 1] = c;
  return v;
}

// Helpers to populate our mock DB
async function createTask(id: string, title: string, category = 'test') {
  await pbMock.collection('tasks').create({ id, title, category });
}

async function createEvent(id: string, title: string) {
  await pbMock.collection('events').create({ id, title });
}

async function createHabit(id: string, name: string) {
  await pbMock.collection('habits').create({ id, name });
}

async function createMemory(id: string, text: string, embedding: number[]) {
  await pbMock.collection('memories').create({ id, text, embedding, user: "test-user-id" });
}

beforeEach(() => {
  (pbMock as any).reset();
});

describe('retrieveGraphContext', () => {
  test('returns an empty array when there are no memories', async () => {
    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results).toEqual([]);
  });

  test('returns memories above the threshold, ordered by similarity DESC', async () => {
    await createMemory('mem-high', 'high-similarity memory', HIGH_VEC);
    await createMemory('mem-mid',  'mid-similarity memory',  MID_VEC);
    await createMemory('mem-low',  'low-similarity memory',  LOW_VEC);

    const results = await retrieveGraphContext(pbMock, QUERY_VEC, { threshold: 0.6 });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('mem-high');
    expect(results[1].id).toBe('mem-mid');
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  test('respects the threshold parameter — strict and loose cuts', async () => {
    await createMemory('mem-high', 'high', HIGH_VEC);
    await createMemory('mem-mid',  'mid',  MID_VEC);

    const strict = await retrieveGraphContext(pbMock, QUERY_VEC, { threshold: 0.95 });
    expect(strict).toHaveLength(1);
    expect(strict[0].id).toBe('mem-high');

    const loose = await retrieveGraphContext(pbMock, QUERY_VEC, { threshold: 0.5 });
    expect(loose).toHaveLength(2);
  });

  test('respects the limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await createMemory(`mem-${i}`, `memory ${i}`, HIGH_VEC);
    }

    const results = await retrieveGraphContext(pbMock, QUERY_VEC, { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test('returns a memory with NO mentions as empty arrays (no crash)', async () => {
    await createMemory('mem-lone', 'lone memory', HIGH_VEC);

    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toEqual([]);
    expect(results[0].events).toEqual([]);
    expect(results[0].habits).toEqual([]);
  });

  test('expands MENTIONS_TASK edges to the tasks list', async () => {
    await createTask('task-1', 'First task');
    await createMemory('mem-tasks', 'memory', HIGH_VEC);
    await wireMentionsEdges(pbMock, 'mem-tasks', { taskIds: ['task-1'] });

    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toHaveLength(1);
    expect(results[0].tasks[0].id).toBe('task-1');
  });

  test('expands MENTIONS_EVENT edges to the events list', async () => {
    await createEvent('event-1', 'First event');
    await createMemory('mem-events', 'memory', HIGH_VEC);
    await wireMentionsEdges(pbMock, 'mem-events', { eventIds: ['event-1'] });

    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results[0].events).toHaveLength(1);
    expect(results[0].events[0].id).toBe('event-1');
  });

  test('expands MENTIONS_HABIT edges to the habits list', async () => {
    await createHabit('habit-1', 'First habit');
    await createMemory('mem-habits', 'memory', HIGH_VEC);
    await wireMentionsEdges(pbMock, 'mem-habits', { habitIds: ['habit-1'] });

    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results[0].habits).toHaveLength(1);
    expect(results[0].habits[0].id).toBe('habit-1');
  });

  test('does NOT produce cartesian-product duplicates (2 tasks, 1 event, 1 habit)', async () => {
    await createTask('task-a', 'Task A');
    await createTask('task-b', 'Task B');
    await createEvent('event-a', 'Event A');
    await createHabit('habit-a', 'Habit A');
    await createMemory('mem-mix', 'mixed memory', HIGH_VEC);
    await wireMentionsEdges(pbMock, 'mem-mix', {
      taskIds: ['task-a', 'task-b'],
      eventIds: ['event-a'],
      habitIds: ['habit-a'],
    });

    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toHaveLength(2);
    expect(results[0].events).toHaveLength(1);
    expect(results[0].habits).toHaveLength(1);

    const taskIds = results[0].tasks.map((t: any) => t.id).sort();
    expect(taskIds).toEqual(['task-a', 'task-b']);
    expect(results[0].events[0].id).toBe('event-a');
    expect(results[0].habits[0].id).toBe('habit-a');
  });

  test('partial mentions — 2 tasks, 0 events, 1 habit', async () => {
    await createTask('task-x', 'Task X');
    await createTask('task-y', 'Task Y');
    await createHabit('habit-z', 'Habit Z');
    await createMemory('mem-partial', 'partial', HIGH_VEC);
    await wireMentionsEdges(pbMock, 'mem-partial', {
      taskIds: ['task-x', 'task-y'],
      habitIds: ['habit-z'],
    });

    const results = await retrieveGraphContext(pbMock, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toHaveLength(2);
    expect(results[0].events).toEqual([]);
    expect(results[0].habits).toHaveLength(1);
  });
});
