import { describe, expect, test, vi, beforeEach } from 'vitest';
import { parseMarkdownFile, serializeMarkdownFile } from './parser';
import { resolveEntityFromPath, syncMemoriesFileToDb, folioRequestContext } from './sync';
import fs from 'fs';
import PocketBase from 'pocketbase';
import crypto from 'crypto';
import { saveSemanticMemoryTool } from '../../mastra/tools/saveSemanticMemory';

// The mockPb variable is allowed inside vi.mock because it starts with "mock"
const mockPb: any = {
  authStore: { record: { id: "test-user-id" } },
  collections: {},
  reset() {
    this.collections = {
      users: createMockCollection([{ id: "test-user-id" }]),
      memories: createMockCollection([]),
      graph_edges: createMockCollection([]),
      tasks: createMockCollection([]),
      events: createMockCollection([]),
    };
  },
  collection(name: string) {
    return this.collections[name];
  }
};

vi.mock('../../lib/pb-server', () => ({
  getPbClient: () => mockPb,
}));

vi.mock('../graph/embedding', () => ({
  getLocalEmbedding: vi.fn().mockImplementation(async (text: string) => {
    const vec = Array(384).fill(0);
    if (text.toLowerCase().includes('coffee')) {
      vec[0] = 0.99;
    } else if (text.toLowerCase().includes('tea')) {
      vec[1] = 0.99;
    } else if (text.toLowerCase().includes('one')) {
      vec[2] = 0.99;
    } else if (text.toLowerCase().includes('two')) {
      vec[3] = 0.99;
    } else if (text.toLowerCase().includes('three')) {
      vec[4] = 0.99;
    } else {
      vec[5] = 0.99;
    }
    const mag = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return vec.map(v => v / mag);
  }),
}));

vi.mock('../../lib/graph/embedding', () => ({
  getLocalEmbedding: vi.fn().mockImplementation(async (text: string) => {
    const vec = Array(384).fill(0);
    if (text.toLowerCase().includes('coffee')) {
      vec[0] = 0.99;
    } else if (text.toLowerCase().includes('tea')) {
      vec[1] = 0.99;
    } else if (text.toLowerCase().includes('one')) {
      vec[2] = 0.99;
    } else if (text.toLowerCase().includes('two')) {
      vec[3] = 0.99;
    } else if (text.toLowerCase().includes('three')) {
      vec[4] = 0.99;
    } else {
      vec[5] = 0.99;
    }
    const mag = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return vec.map(v => v / mag);
  }),
}));

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

function createMockCollection(initialItems: any[]) {
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
      if (!item) {
        const err = new Error("404 Not Found") as any;
        err.status = 404;
        throw err;
      }
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
      }
      return true;
    }
  };
}

async function mockGetLocalEmbedding(text: string) {
  const vec = Array(384).fill(0);
  if (text.toLowerCase().includes('coffee')) {
    vec[0] = 0.99;
  } else if (text.toLowerCase().includes('tea')) {
    vec[1] = 0.99;
  } else if (text.toLowerCase().includes('one')) {
    vec[2] = 0.99;
  } else if (text.toLowerCase().includes('two')) {
    vec[3] = 0.99;
  } else if (text.toLowerCase().includes('three')) {
    vec[4] = 0.99;
  } else {
    vec[5] = 0.99;
  }
  const mag = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return vec.map(v => v / mag);
}

// ============================================================================
// Virtual Filesystem Mock
// ============================================================================

const mockFiles: Record<string, string> = {};

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mocked = {
    ...actual,
    existsSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('Dialogue Folio') || norm.includes('dialogue-folio')) {
        return !!mockFiles[norm];
      }
      return actual.existsSync(p);
    },
    readFileSync: (p: any, options?: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('Dialogue Folio') || norm.includes('dialogue-folio')) {
        if (!mockFiles[norm]) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
        return mockFiles[norm];
      }
      return actual.readFileSync(p, options);
    },
    writeFileSync: (p: any, data: any, options?: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('Dialogue Folio') || norm.includes('dialogue-folio')) {
        mockFiles[norm] = String(data);
        return;
      }
      actual.writeFileSync(p, data, options);
    },
    mkdirSync: () => undefined,
  };
  return {
    ...mocked,
    default: mocked,
  };
});

beforeEach(() => {
  (mockPb as any).reset();
  for (const k of Object.keys(mockFiles)) {
    delete mockFiles[k];
  }
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('Markdown Parser & Serializer', () => {
  test('parses markdown with YAML frontmatter correctly', () => {
    const content = `---
id: task-123
title: Buy milk
completed: false
dueDate: 2026-06-12T00:00:00.000Z
priority: high
progress: 42
---
This is the markdown body.
It has multiple lines.
`;
    const parsed = parseMarkdownFile(content);
    expect(parsed.metadata.id).toBe('task-123');
    expect(parsed.metadata.title).toBe('Buy milk');
    expect(parsed.metadata.completed).toBe(false);
    expect(parsed.metadata.priority).toBe('high');
    expect(parsed.metadata.progress).toBe(42);
    expect(parsed.body.trim()).toBe('This is the markdown body.\nIt has multiple lines.');
  });

  test('parses markdown without frontmatter correctly', () => {
    const content = 'This is a simple file without frontmatter.';
    const parsed = parseMarkdownFile(content);
    expect(parsed.metadata).toEqual({});
    expect(parsed.body).toBe(content);
  });

  test('serializes metadata and body back to markdown correctly', () => {
    const metadata = {
      id: 'task-123',
      title: 'Buy milk',
      completed: false,
      priority: 'high',
      progress: 42,
    };
    const body = 'This is the markdown body.';
    const serialized = serializeMarkdownFile(metadata, body);
    expect(serialized).toContain('---');
    expect(serialized).toContain('id: task-123');
    expect(serialized).toContain('title: Buy milk');
    expect(serialized).toContain('completed: false');
    expect(serialized).toContain('priority: high');
    expect(serialized).toContain('progress: 42');
    expect(serialized.trim().endsWith(body)).toBe(true);
  });
});

describe('Path to Entity Resolver', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  test('resolves global tasks', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/tasks/task-lh7p5oqw2n8xxyz.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'tasks',
      workspaceId: null,
    });
  });

  test('resolves workspace events', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/work-123/events/event-lh7p5oqw2n8xxyz.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'events',
      workspaceId: 'work-123',
    });
  });

  test('ignores files outside tasks/events', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/notes/note-123.md',
      folioRoot
    );
    expect(resolved).toBeNull();
  });

  test('resolves global memories file path', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/system/memories.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'global',
      collectionName: 'memories',
      workspaceId: null,
    });
  });

  test('resolves workspace memories file path', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/work-123/workspace_memories.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'work-123',
      collectionName: 'memories',
      workspaceId: 'work-123',
    });
  });
});

describe('Sync memories file to DB', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  test('parses bullets, computes hashes, and upserts memories to DB cache', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/memories.md';
    mockFiles[filePath] = `# Memories\n\n- Fact number one\n* Fact number two\n`;

    await syncMemoriesFileToDb(filePath, mockPb, folioRoot);

    const dbItems = mockPb.collection('memories').items;
    expect(dbItems).toHaveLength(2);
    expect(dbItems.map((m: any) => m.text)).toContain('Fact number one');
    expect(dbItems.map((m: any) => m.text)).toContain('Fact number two');
    expect(dbItems[0].source_type).toBe('File');
    expect(dbItems[0].source_id).toBe('system/memories.md');
  });

  test('prunes deleted memories from DB cache', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/memories.md';
    
    // First sync
    mockFiles[filePath] = `# Memories\n\n- Fact number one\n- Fact number two\n`;
    await syncMemoriesFileToDb(filePath, mockPb, folioRoot);
    expect(mockPb.collection('memories').items).toHaveLength(2);

    // Second sync: remove "Fact number two" and add "Fact number three"
    mockFiles[filePath] = `# Memories\n\n- Fact number one\n- Fact number three\n`;
    await syncMemoriesFileToDb(filePath, mockPb, folioRoot);

    const dbItems = mockPb.collection('memories').items;
    expect(dbItems).toHaveLength(2);
    expect(dbItems.map((m: any) => m.text)).toContain('Fact number one');
    expect(dbItems.map((m: any) => m.text)).toContain('Fact number three');
    expect(dbItems.map((m: any) => m.text)).not.toContain('Fact number two');
  });
});

describe('saveSemanticMemory Tool', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  test('appends new bullet point to global memories when no duplicate is found', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/memories.md';
    mockFiles[filePath] = `# Memories\n\n- Fact number one\n`;

    await folioRequestContext.run({ folioRootPath: folioRoot, activeWorkspace: '', basePath: folioRoot }, async () => {
      const result = (await saveSemanticMemoryTool.execute!({
        text: 'I prefer coffee',
      }, {} as any)) as any;
      expect(result.status).toBe('Memory saved.');
      
      const fileContent = mockFiles[filePath];
      expect(fileContent).toContain('- Fact number one');
      expect(fileContent).toContain('- I prefer coffee');

      const dbItems = mockPb.collection('memories').items;
      expect(dbItems).toHaveLength(2);
      expect(dbItems.map((m: any) => m.text)).toContain('I prefer coffee');
    });
  });

  test('appends to workspace memories when active workspace is set', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/project-x/workspace_memories.md';
    mockFiles[filePath] = `# Memories\n\n`;

    await folioRequestContext.run({ folioRootPath: folioRoot, activeWorkspace: 'project-x', basePath: `${folioRoot}/project-x` }, async () => {
      const result = (await saveSemanticMemoryTool.execute!({
        text: 'I prefer coffee',
      }, {} as any)) as any;
      expect(result.status).toBe('Memory saved.');
      
      const fileContent = mockFiles[filePath];
      expect(fileContent).toContain('- I prefer coffee');

      const dbItems = mockPb.collection('memories').items;
      expect(dbItems).toHaveLength(1);
      expect(dbItems[0].source_id).toBe('project-x/workspace_memories.md');
    });
  });

  test('updates original file line when semantic duplicate (>0.85 similarity) resides in a File', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/memories.md';
    mockFiles[filePath] = `# Memories\n\n- I prefer coffee\n`;

    // Seed the database cache with the exact/duplicate record
    const hash = crypto.createHash('sha256').update('I prefer coffee').digest('hex');
    const mockEmbedding = await mockGetLocalEmbedding('I prefer coffee');
    await mockPb.collection('memories').create({
      id: 'mem-coffee-id',
      user: 'test-user-id',
      text: 'I prefer coffee',
      hash,
      embedding: mockEmbedding,
      source_type: 'File',
      source_id: 'system/memories.md',
    });

    await folioRequestContext.run({ folioRootPath: folioRoot, activeWorkspace: '', basePath: folioRoot }, async () => {
      // Execute with "I really like coffee" (which will trigger high similarity check)
      const result = (await saveSemanticMemoryTool.execute!({
        text: 'I really like coffee',
      }, {} as any)) as any;
      expect(result.status).toBe('Memory saved.');

      // Check that the file was updated: "I prefer coffee" replaced by "I really like coffee"
      const fileContent = mockFiles[filePath];
      expect(fileContent).not.toContain('I prefer coffee');
      expect(fileContent).toContain('- I really like coffee');

      // The old DB cache record should be pruned, and a new one synced
      const dbItems = mockPb.collection('memories').items;
      expect(dbItems).toHaveLength(1);
      expect(dbItems[0].text).toBe('I really like coffee');
    });
  });

  test('wires mentions and skips file write when semantic duplicate resides in a Task/Event note', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/memories.md';
    mockFiles[filePath] = `# Memories\n\n`;

    // Seed task so that wireMentionsEdges target validation succeeds
    await mockPb.collection('tasks').create({
      id: 'task-123',
      text: 'My task',
    });

    // Seed DB with a Task-sourced memory
    const hash = crypto.createHash('sha256').update('I prefer coffee').digest('hex');
    const mockEmbedding = await mockGetLocalEmbedding('I prefer coffee');
    await mockPb.collection('memories').create({
      id: 'mem-task-coffee-id',
      user: 'test-user-id',
      text: 'I prefer coffee',
      hash,
      embedding: mockEmbedding,
      source_type: 'Task',
      source_id: 'task-123',
    });

    await folioRequestContext.run({ folioRootPath: folioRoot, activeWorkspace: '', basePath: folioRoot }, async () => {
      // Execute with "I really like coffee"
      const result = (await saveSemanticMemoryTool.execute!({
        text: 'I really like coffee',
        taskIds: ['task-123'],
      }, {} as any)) as any;
      
      expect(result.status).toBe('skipped_duplicate');
      expect(result.payload.id).toBe('mem-task-coffee-id');

      // The file should NOT have been modified
      expect(mockFiles[filePath]).toBe(`# Memories\n\n`);

      // Verify that mentions edges were wired
      const edges = mockPb.collection('graph_edges').items;
      expect(edges).toHaveLength(1);
      expect(edges[0].from_mem).toBe('mem-task-coffee-id');
      expect(edges[0].to_id).toBe('task-123');
      expect(edges[0].target_type).toBe('Task');
    });
  });
});

