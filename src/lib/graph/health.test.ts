import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Database, Connection } from '@ladybugdb/core';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getMemoryHealth } from './health';
import { wireMentionsEdges } from './edges';

const DB_DIR = path.join(os.tmpdir(), `dialogue-graph-health-test-${process.pid}-${Date.now()}`);

let db: Database;
let conn: Connection;

const SCHEMA_DDL = [
  `CREATE NODE TABLE Task(id STRING, title STRING, category STRING, PRIMARY KEY (id));`,
  `CREATE NODE TABLE Event(id STRING, title STRING, PRIMARY KEY (id));`,
  `CREATE NODE TABLE Habit(id STRING, name STRING, PRIMARY KEY (id));`,
  `CREATE NODE TABLE Memory(id STRING, text STRING, embedding FLOAT[384], PRIMARY KEY (id));`,
  `CREATE REL TABLE MENTIONS_TASK(FROM Memory TO Task);`,
  `CREATE REL TABLE MENTIONS_EVENT(FROM Memory TO Event);`,
  `CREATE REL TABLE MENTIONS_HABIT(FROM Memory TO Habit);`,
];

const DIM = 384;
const ZERO_VEC = new Array(DIM).fill(0);

async function createTask(id: string, title: string) {
  const stmt = await conn.prepare(
    'CREATE (t:Task {id: $id, title: $title, category: $cat})'
  );
  await conn.execute(stmt, { id, title, cat: 'test' });
}

async function createEvent(id: string, title: string) {
  const stmt = await conn.prepare('CREATE (t:Event {id: $id, title: $title})');
  await conn.execute(stmt, { id, title });
}

async function createHabit(id: string, name: string) {
  const stmt = await conn.prepare('CREATE (t:Habit {id: $id, name: $name})');
  await conn.execute(stmt, { id, name });
}

async function createMemory(id: string, text: string) {
  const stmt = await conn.prepare(
    'CREATE (m:Memory {id: $id, text: $text, embedding: $emb})'
  );
  await conn.execute(stmt, { id, text, emb: ZERO_VEC });
}

beforeAll(async () => {
  db = new Database(DB_DIR);
  conn = new Connection(db);
  for (const q of SCHEMA_DDL) {
    await conn.query(q);
  }
});

afterAll(async () => {
  try {
    fs.rmSync(DB_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

beforeEach(async () => {
  // Wipe the graph between tests so the describe block has a clean slate.
  await conn.query('MATCH (n) DETACH DELETE n');
});

describe('getMemoryHealth', () => {
  test('returns zero counts on an empty graph', async () => {
    const health = await getMemoryHealth(conn);
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

    const health = await getMemoryHealth(conn);
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

    await wireMentionsEdges(conn, 'mem-tasks', { taskIds: ['task-1', 'task-2'] });
    await wireMentionsEdges(conn, 'mem-events', { eventIds: ['event-1'] });
    await wireMentionsEdges(conn, 'mem-habits', { habitIds: ['habit-1', 'habit-2', 'habit-3'] });
    await wireMentionsEdges(conn, 'mem-mixed', {
      taskIds: ['task-1'],
      eventIds: ['event-1'],
      habitIds: ['habit-1'],
    });

    const health = await getMemoryHealth(conn);
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
    await wireMentionsEdges(conn, 'mem-connected', { taskIds: ['task-1'] });

    const health = await getMemoryHealth(conn);
    expect(health.totalMemories).toBe(3);
    expect(health.lonelyMemories.count).toBe(2);
    const lonelyIds = health.lonelyMemories.sample.map((m) => m.id).sort();
    expect(lonelyIds).toEqual(['mem-lonely-1', 'mem-lonely-2']);
    const texts = health.lonelyMemories.sample.map((m) => m.text).sort();
    expect(texts).toEqual(['also no mentions', 'no mentions at all']);
  });

  test('counts stale-ID no-op writes as successes but does NOT mark Memory as connected (Phase 2 Stage 1.1 + 1.3 integration)', async () => {
    // wireMentionsEdges is a silent no-op when target IDs don't exist. That
    // means the Memory ends up with NO edges — and getMemoryHealth should
    // correctly surface it as a "lonely" memory. This is the integration
    // point that motivated the orphan detection in the plan.
    await createMemory('mem-stale', 'memory with stale task ID');
    await wireMentionsEdges(conn, 'mem-stale', { taskIds: ['nonexistent-task-id'] });

    const health = await getMemoryHealth(conn);
    expect(health.totalMemories).toBe(1);
    expect(health.edgesByType.MENTIONS_TASK).toBe(0);
    expect(health.lonelyMemories.count).toBe(1);
    expect(health.lonelyMemories.sample[0].id).toBe('mem-stale');
  });

  test('caps the lonely sample at 50 and reports the cap as the count', async () => {
    for (let i = 0; i < 55; i++) {
      await createMemory(`mem-lonely-${i}`, `lonely ${i}`);
    }

    const health = await getMemoryHealth(conn);
    expect(health.totalMemories).toBe(55);
    expect(health.lonelyMemories.count).toBe(50);
    expect(health.lonelyMemories.sample).toHaveLength(50);
  });
});
