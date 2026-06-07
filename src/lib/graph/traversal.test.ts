import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Database, Connection } from '@ladybugdb/core';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { retrieveGraphContext } from './traversal';
import { wireMentionsEdges } from './edges';

const DB_DIR = path.join(os.tmpdir(), `dialogue-graph-traversal-test-${process.pid}-${Date.now()}`);

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

// 384-dim test vectors. Non-zero values occupy the first N positions to
// keep the math easy to reason about. All are un-normalized; Kuzu's
// array_cosine_similarity handles normalization internally.
const QUERY_VEC = makeVec(1, 0, 0);    // [1, 0, ..., 0]   (unit x-axis)
const HIGH_VEC  = makeVec(0.9, 0.1, 0); // [0.9, 0.1, 0,...] (cos sim ~0.99 vs QUERY)
const MID_VEC   = makeVec(0.7, 0.7, 0); // [0.7, 0.7, 0,...] (cos sim ~0.71 vs QUERY)
const LOW_VEC   = makeVec(0, 0, 1);     // [0, ..., 0, 1]   (cos sim 0 vs QUERY; orthogonal)

function makeVec(a: number, b: number, c: number): number[] {
  const v = new Array(DIM).fill(0);
  v[0] = a;
  v[1] = b;
  v[DIM - 1] = c;
  return v;
}

async function createTask(id: string, title: string, category = 'test') {
  const stmt = await conn.prepare(
    'CREATE (t:Task {id: $id, title: $title, category: $cat})'
  );
  await conn.execute(stmt, { id, title, cat: category });
}

async function createEvent(id: string, title: string) {
  const stmt = await conn.prepare('CREATE (t:Event {id: $id, title: $title})');
  await conn.execute(stmt, { id, title });
}

async function createHabit(id: string, name: string) {
  const stmt = await conn.prepare('CREATE (t:Habit {id: $id, name: $name})');
  await conn.execute(stmt, { id, name });
}

async function createMemory(id: string, text: string, embedding: number[]) {
  const stmt = await conn.prepare(
    'CREATE (m:Memory {id: $id, text: $text, embedding: $emb})'
  );
  await conn.execute(stmt, { id, text, emb: embedding });
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
  // Tests share a single in-memory-style temp DB; otherwise primary-key
  // collisions on `id` and stale rows from earlier tests would leak.
  await conn.query('MATCH (n) DETACH DELETE n');
});

describe('retrieveGraphContext', () => {
  test('returns an empty array when there are no memories', async () => {
    const results = await retrieveGraphContext(conn, QUERY_VEC);
    expect(results).toEqual([]);
  });

  test('returns memories above the threshold, ordered by similarity DESC', async () => {
    await createMemory('mem-high', 'high-similarity memory', HIGH_VEC);
    await createMemory('mem-mid',  'mid-similarity memory',  MID_VEC);
    await createMemory('mem-low',  'low-similarity memory',  LOW_VEC);

    const results = await retrieveGraphContext(conn, QUERY_VEC, { threshold: 0.6 });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('mem-high');
    expect(results[1].id).toBe('mem-mid');
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  test('respects the threshold parameter — strict and loose cuts', async () => {
    await createMemory('mem-high', 'high', HIGH_VEC);
    await createMemory('mem-mid',  'mid',  MID_VEC);

    const strict = await retrieveGraphContext(conn, QUERY_VEC, { threshold: 0.95 });
    expect(strict).toHaveLength(1);
    expect(strict[0].id).toBe('mem-high');

    const loose = await retrieveGraphContext(conn, QUERY_VEC, { threshold: 0.5 });
    expect(loose).toHaveLength(2);
  });

  test('respects the limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await createMemory(`mem-${i}`, `memory ${i}`, HIGH_VEC);
    }

    const results = await retrieveGraphContext(conn, QUERY_VEC, { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test('returns a memory with NO mentions as empty arrays (no crash)', async () => {
    await createMemory('mem-lone', 'lone memory', HIGH_VEC);

    const results = await retrieveGraphContext(conn, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toEqual([]);
    expect(results[0].events).toEqual([]);
    expect(results[0].habits).toEqual([]);
  });

  test('expands MENTIONS_TASK edges to the tasks list', async () => {
    await createTask('task-1', 'First task');
    await createMemory('mem-tasks', 'memory', HIGH_VEC);
    await wireMentionsEdges(conn, 'mem-tasks', { taskIds: ['task-1'] });

    const results = await retrieveGraphContext(conn, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toHaveLength(1);
    expect(results[0].tasks[0].id).toBe('task-1');
  });

  test('expands MENTIONS_EVENT edges to the events list', async () => {
    await createEvent('event-1', 'First event');
    await createMemory('mem-events', 'memory', HIGH_VEC);
    await wireMentionsEdges(conn, 'mem-events', { eventIds: ['event-1'] });

    const results = await retrieveGraphContext(conn, QUERY_VEC);
    expect(results[0].events).toHaveLength(1);
    expect(results[0].events[0].id).toBe('event-1');
  });

  test('expands MENTIONS_HABIT edges to the habits list (Phase 2 Stage 1.2)', async () => {
    await createHabit('habit-1', 'First habit');
    await createMemory('mem-habits', 'memory', HIGH_VEC);
    await wireMentionsEdges(conn, 'mem-habits', { habitIds: ['habit-1'] });

    const results = await retrieveGraphContext(conn, QUERY_VEC);
    expect(results[0].habits).toHaveLength(1);
    expect(results[0].habits[0].id).toBe('habit-1');
  });

  test('does NOT produce cartesian-product duplicates (2 tasks, 1 event, 1 habit)', async () => {
    // Bug fix: the original query chained OPTIONAL MATCHes without WITH
    // between them, so a memory with 2 tasks and 1 event produced 2*1=2
    // rows and collect(t) / collect(e) over those 2 rows duplicated both
    // lists. The new query scopes each collect with WITH.
    await createTask('task-a', 'Task A');
    await createTask('task-b', 'Task B');
    await createEvent('event-a', 'Event A');
    await createHabit('habit-a', 'Habit A');
    await createMemory('mem-mix', 'mixed memory', HIGH_VEC);
    await wireMentionsEdges(conn, 'mem-mix', {
      taskIds: ['task-a', 'task-b'],
      eventIds: ['event-a'],
      habitIds: ['habit-a'],
    });

    const results = await retrieveGraphContext(conn, QUERY_VEC);
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
    await wireMentionsEdges(conn, 'mem-partial', {
      taskIds: ['task-x', 'task-y'],
      habitIds: ['habit-z'],
    });

    const results = await retrieveGraphContext(conn, QUERY_VEC);
    expect(results).toHaveLength(1);
    expect(results[0].tasks).toHaveLength(2);
    expect(results[0].events).toEqual([]);
    expect(results[0].habits).toHaveLength(1);
  });
});
