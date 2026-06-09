import { describe, test, expect, beforeEach, vi } from 'vitest';
import PocketBase from 'pocketbase';
import { chunkText, ingestTaskNotes, ingestEventNotes, ingestHabitLogNotes, deleteSourceMemories } from './ingest';

// Mock getLocalEmbedding to return a mock vector
vi.mock('./embedding', () => ({
  getLocalEmbedding: vi.fn().mockResolvedValue(Array(384).fill(0.2)),
}));

// ============================================================================
// In-Memory Mock PocketBase Client
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
  // Strip outer parentheses if present
  let cleanFilter = filter.trim();
  if (cleanFilter.startsWith("(") && cleanFilter.endsWith(")")) {
    cleanFilter = cleanFilter.substring(1, cleanFilter.length - 1).trim();
  }
  
  const parts = cleanFilter.split("&&").map(p => p.trim());
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
      users: this.createMockCollection("users", [{ id: "test-user-id" }]),
      memories: this.createMockCollection("memories", []),
      graph_edges: this.createMockCollection("graph_edges", []),
      tasks: this.createMockCollection("tasks", []),
      events: this.createMockCollection("events", []),
      habits: this.createMockCollection("habits", []),
      habit_logs: this.createMockCollection("habit_logs", []),
    };
  }

  createMockCollection(name: string, initialItems: any[]) {
    const self = this;
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
      update: async (id: string, data: any) => {
        const item = items.find(i => i.id === id);
        if (!item) throw new Error("404 Not Found");
        Object.assign(item, data);
        return item;
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
          if (name === "memories") {
            const edgesCol = self.collections.graph_edges;
            if (edgesCol) {
              let i = edgesCol.items.length;
              while (i--) {
                if (edgesCol.items[i].from_mem === id) {
                  edgesCol.items.splice(i, 1);
                }
              }
            }
          }
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

// ============================================================================
// Unit Tests
// ============================================================================

describe('Chunking & Notes Ingestion Tests', () => {
  beforeEach(() => {
    (pbMock as any).reset();
  });

  test('chunkText splits paragraphs correctly', () => {
    const text = "Paragraph 1.\n\nParagraph 2 is longer.\n\nParagraph 3.";
    const chunks = chunkText(text, 10);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe("Paragraph 1.");
    expect(chunks[1]).toBe("Paragraph 2 is longer.");
    expect(chunks[2]).toBe("Paragraph 3.");
  });

  test('chunkText splits single large paragraph by sentences if it exceeds max size', () => {
    const text = "This is sentence one. This is sentence two. This is sentence three.";
    const chunks = chunkText(text, 25);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe("This is sentence one.");
    expect(chunks[1]).toBe("This is sentence two.");
    expect(chunks[2]).toBe("This is sentence three.");
  });

  test('ingestTaskNotes creates memories and MENTIONS_TASK edges', async () => {
    // 1. Setup target task
    await pbMock.collection('tasks').create({ id: 'task-1', title: 'Task One' });

    // 2. Ingest notes with small maxChunkSize to force 2 memories
    const notes = "First entry.\n\nSecond entry is here.";
    await ingestTaskNotes(pbMock, 'task-1', notes, 15);

    // 3. Assert memories created
    const memories = await pbMock.collection('memories').getFullList({});
    expect(memories.length).toBe(2);
    expect(memories[0].source_id).toBe('task-1');
    expect(memories[0].source_type).toBe('Task');

    // 4. Assert graph edges created
    const edges = await pbMock.collection('graph_edges').getFullList({});
    expect(edges.length).toBe(2);
    expect(edges[0].from_mem).toBe(memories[0].id);
    expect(edges[0].to_id).toBe('task-1');
    expect(edges[0].edge_type).toBe('MENTIONS_TASK');
  });

  test('ingestTaskNotes updates existing memories in place and deletes leftover ones', async () => {
    await pbMock.collection('tasks').create({ id: 'task-1', title: 'Task One' });

    // Initial ingestion of 3 chunks
    await ingestTaskNotes(pbMock, 'task-1', "A.\n\nB.\n\nC.", 2);
    const memories1 = await pbMock.collection('memories').getFullList({});
    expect(memories1.length).toBe(3);
    const initialIds = memories1.map(m => m.id);

    // Ingest 2 chunks (should update first two, delete third)
    await ingestTaskNotes(pbMock, 'task-1', "Updated A.\n\nUpdated B.", 2);
    const memories2 = await pbMock.collection('memories').getFullList({});
    expect(memories2.length).toBe(2);

    expect(memories2[0].id).toBe(initialIds[0]);
    expect(memories2[0].text).toBe("Updated A.");
    expect(memories2[1].id).toBe(initialIds[1]);
    expect(memories2[1].text).toBe("Updated B.");

    // Verify leftover edge was also deleted
    const edges = await pbMock.collection('graph_edges').getFullList({});
    expect(edges.length).toBe(2);
  });

  test('ingestEventNotes chunks prep notes and outcomes together', async () => {
    await pbMock.collection('events').create({ id: 'event-1', title: 'Meeting' });

    await ingestEventNotes(pbMock, 'event-1', "Prep notes.", "Meeting outcome.");
    const memories = await pbMock.collection('memories').getFullList({});
    expect(memories.length).toBe(2);
    expect(memories[0].text).toBe("Prep notes.");
    expect(memories[1].text).toBe("Meeting outcome.");

    const edges = await pbMock.collection('graph_edges').getFullList({});
    expect(edges.length).toBe(2);
    expect(edges[0].edge_type).toBe('MENTIONS_EVENT');
    expect(edges[0].to_id).toBe('event-1');
  });

  test('ingestHabitLogNotes links memories to parent habit ID', async () => {
    await pbMock.collection('habits').create({ id: 'habit-1', name: 'Meditation' });

    await ingestHabitLogNotes(pbMock, 'log-1', 'habit-1', "Felt very calm today.");
    const memories = await pbMock.collection('memories').getFullList({});
    expect(memories.length).toBe(1);
    expect(memories[0].source_id).toBe('log-1');
    expect(memories[0].source_type).toBe('HabitLog');

    const edges = await pbMock.collection('graph_edges').getFullList({});
    expect(edges.length).toBe(1);
    expect(edges[0].edge_type).toBe('MENTIONS_HABIT');
    expect(edges[0].to_id).toBe('habit-1');
  });

  test('deleteSourceMemories deletes all source-associated memories', async () => {
    await pbMock.collection('tasks').create({ id: 'task-1', title: 'Task One' });
    await ingestTaskNotes(pbMock, 'task-1', "Important note.");

    const initialMemories = await pbMock.collection('memories').getFullList({});
    expect(initialMemories.length).toBe(1);

    await deleteSourceMemories(pbMock, 'task-1', 'Task');
    const finalMemories = await pbMock.collection('memories').getFullList({});
    expect(finalMemories.length).toBe(0);
  });
});
