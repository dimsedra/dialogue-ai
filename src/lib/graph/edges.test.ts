import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Database, Connection } from '@ladybugdb/core';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { wireMentionsEdges } from './edges';

const DB_DIR = path.join(os.tmpdir(), `dialogue-graph-edges-test-${process.pid}-${Date.now()}`);

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

async function createMemory(id: string, text: string) {
  const stmt = await conn.prepare(
    'CREATE (m:Memory {id: $id, text: $text, embedding: $emb})'
  );
  await conn.execute(stmt, { id, text, emb: Array(384).fill(0.1) });
}

async function countEdges(
  memoryId: string,
  rel: string,
  targetLabel: string
): Promise<number> {
  const stmt = await conn.prepare(
    `MATCH (m:Memory {id: $mid})-[r:${rel}]->(t:${targetLabel}) RETURN count(r) AS c`
  );
  const result = (await conn.execute(stmt, { mid: memoryId })) as any;
  const single = Array.isArray(result) ? result[0] : result;
  const rows = await single.getAll();
  return Number(rows[0]?.c ?? 0);
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

describe('wireMentionsEdges', () => {
  test('creates a MENTIONS_TASK edge for a valid taskId', async () => {
    await createTask('task-1', 'Ship the dialogue binary');
    await createMemory('mem-1', 'user is shipping dialogue as a desktop app');

    const result = await wireMentionsEdges(conn, 'mem-1', { taskIds: ['task-1'] });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(await countEdges('mem-1', 'MENTIONS_TASK', 'Task')).toBe(1);
  });

  test('creates a MENTIONS_EVENT edge for a valid eventId', async () => {
    await createEvent('event-1', 'Dentist appointment');
    await createMemory('mem-2', 'user has a dentist appointment coming up');

    const result = await wireMentionsEdges(conn, 'mem-2', { eventIds: ['event-1'] });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(await countEdges('mem-2', 'MENTIONS_EVENT', 'Event')).toBe(1);
  });

  test('creates a MENTIONS_HABIT edge for a valid habitId', async () => {
    await createHabit('habit-1', 'morning run');
    await createMemory('mem-3', 'user is training for a 5k');

    const result = await wireMentionsEdges(conn, 'mem-3', { habitIds: ['habit-1'] });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(await countEdges('mem-3', 'MENTIONS_HABIT', 'Habit')).toBe(1);
  });

  test('creates multiple edge types in one call', async () => {
    await createTask('task-2', 'Project Phoenix');
    await createEvent('event-2', 'Phoenix launch');
    await createHabit('habit-2', 'weekly review');
    await createMemory('mem-4', 'user is wrapping up project phoenix');

    const result = await wireMentionsEdges(conn, 'mem-4', {
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

    const result = await wireMentionsEdges(conn, 'mem-5', {
      taskIds: ['task-3', 'task-4', 'task-5'],
    });
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(await countEdges('mem-5', 'MENTIONS_TASK', 'Task')).toBe(3);
  });

  test('is a no-op when no mentions are provided', async () => {
    await createMemory('mem-6', 'memory text');

    const result = await wireMentionsEdges(conn, 'mem-6', {});
    expect(result.attempted).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test('is a no-op when mention arrays are empty', async () => {
    await createMemory('mem-7', 'memory text');

    const result = await wireMentionsEdges(conn, 'mem-7', {
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

    const first = await wireMentionsEdges(conn, 'mem-8', { taskIds: ['task-6'] });
    expect(first.succeeded).toBe(1);

    const second = await wireMentionsEdges(conn, 'mem-8', { taskIds: ['task-6'] });
    expect(second.attempted).toBe(1);
    expect(second.succeeded).toBe(1);
    expect(second.failed).toBe(0);
    expect(await countEdges('mem-8', 'MENTIONS_TASK', 'Task')).toBe(1);
  });

  test('stale IDs do not throw — they are silent no-ops (MATCH returns 0 rows)', async () => {
    await createMemory('mem-9', 'memory text');

    const result = await wireMentionsEdges(conn, 'mem-9', {
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

    const result = await wireMentionsEdges(conn, 'mem-10', {
      taskIds: ['task-7', 'ghost-task'],
    });
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(await countEdges('mem-10', 'MENTIONS_TASK', 'Task')).toBe(1);
  });
});
