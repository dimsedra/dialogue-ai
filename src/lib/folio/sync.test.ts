import { describe, expect, test, vi, beforeEach } from 'vitest';
import { parseMarkdownFile, serializeMarkdownFile } from './parser';
import { resolveEntityFromPath, syncMemoriesFileToDb, folioRequestContext, syncFolioFileToDb, reconcileFolio } from './sync';
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
      workspaces: createMockCollection([]),
      chat_sessions: createMockCollection([]),
      habits: createMockCollection([]),
      reflections: createMockCollection([]),
      daily_logs: createMockCollection([]),
    };
  },
  collection(name: string) {
    return this.collections[name];
  }
};

vi.mock('../../lib/pb-server', () => ({
  getPbClient: () => mockPb,
  getActiveUserId: async (pb: any) => {
    if (pb.authStore.record && pb.authStore.record.collectionName === 'users') {
      return pb.authStore.record.id;
    }
    const users = await pb.collection('users').getFullList({ limit: 1 });
    return users[0]?.id;
  }
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
      const newItem = { id: data.id || Math.random().toString(36).substring(2, 17).padEnd(15, '0'), ...data };
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
    getFirstListItem: async (filter: string) => {
      let filtered = [...items];
      const parts = filter.split('&&').map(s => s.trim());
      for (const part of parts) {
        const eqMatch = part.match(/^(\w+)\s*=\s*"([^"]*)"$/);
        if (eqMatch) {
          const key = eqMatch[1];
          const val = eqMatch[2];
          filtered = filtered.filter((item: any) => String(item[key]) === val);
        }
      }
      if (filtered.length === 0) {
        const err = new Error("404 Not Found") as any;
        err.status = 404;
        throw err;
      }
      return filtered[0];
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
        if (mockFiles[norm]) return true;
        const prefix = norm + '/';
        return Object.keys(mockFiles).some(k => k.startsWith(prefix));
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
    renameSync: (oldPath: any, newPath: any) => {
      const normOld = String(oldPath).replace(/\\/g, '/');
      const normNew = String(newPath).replace(/\\/g, '/');
      if (mockFiles[normOld]) {
        mockFiles[normNew] = mockFiles[normOld];
        delete mockFiles[normOld];
        return;
      }
    },
    unlinkSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (mockFiles[norm]) {
        delete mockFiles[norm];
      }
    },
    mkdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('Dialogue Folio') || norm.includes('dialogue-folio')) {
        mockFiles[norm] = 'directory';
      }
    },
    readdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      const prefix = norm + '/';
      const results = new Set<string>();
      for (const k of Object.keys(mockFiles)) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          const slashIdx = rest.indexOf('/');
          if (slashIdx === -1) {
            results.add(rest);
          } else {
            results.add(rest.slice(0, slashIdx));
          }
        }
      }
      return Array.from(results);
    },
    statSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      const isFile = norm.endsWith('.md');
      return {
        isFile: () => isFile,
        isDirectory: () => !isFile,
      } as any;
    },
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
    expect(resolved).toBeNull();
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
      'C:/Users/user/Dialogue Folio/system/MEMORIES.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'global',
      collectionName: 'memories',
      workspaceId: null,
    });

    const resolvedLegacy = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/system/memories.md',
      folioRoot
    );
    expect(resolvedLegacy).toEqual({
      id: 'global',
      collectionName: 'memories',
      workspaceId: null,
    });
  });

  test('resolves workspace memories file path', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/work-123/MEMORIES.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'work-123',
      collectionName: 'memories',
      workspaceId: 'work-123',
    });

    const resolvedLegacy = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/work-123/workspace_memories.md',
      folioRoot
    );
    expect(resolvedLegacy).toEqual({
      id: 'work-123',
      collectionName: 'memories',
      workspaceId: 'work-123',
    });
  });

  test('resolves new-style workspace events', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/workspaces/my-new-workspace-lh7p5oqw2n8xxyz/events/event-lh7p5oqw2n8xxyz.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'events',
      workspaceId: 'lh7p5oqw2n8xxyz',
    });
  });

  test('resolves new-style workspace memories file path', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/workspaces/my-new-workspace-lh7p5oqw2n8xxyz/MEMORIES.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'memories',
      workspaceId: 'lh7p5oqw2n8xxyz',
    });
  });

  test('resolves new-style workspace CONTEXT.md file path', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/workspaces/my-new-workspace-lh7p5oqw2n8xxyz/CONTEXT.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'lh7p5oqw2n8xxyz',
      collectionName: 'workspaces',
      workspaceId: 'lh7p5oqw2n8xxyz',
    });
  });

  test('resolves old-style workspace CONTEXT.md file path', () => {
    const resolved = resolveEntityFromPath(
      'C:/Users/user/Dialogue Folio/work-123/CONTEXT.md',
      folioRoot
    );
    expect(resolved).toEqual({
      id: 'work-123',
      collectionName: 'workspaces',
      workspaceId: 'work-123',
    });
  });
});

describe('Sync memories file to DB', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  test('parses bullets, computes hashes, and upserts memories to DB cache', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/MEMORIES.md';
    mockFiles[filePath] = `# Memories\n\n- Fact number one\n* Fact number two\n`;

    await syncMemoriesFileToDb(filePath, mockPb, folioRoot);

    const dbItems = mockPb.collection('memories').items;
    expect(dbItems).toHaveLength(2);
    expect(dbItems.map((m: any) => m.text)).toContain('Fact number one');
    expect(dbItems.map((m: any) => m.text)).toContain('Fact number two');
    expect(dbItems[0].source_type).toBe('File');
    expect(dbItems[0].source_id).toBe('system/MEMORIES.md');
  });

  test('prunes deleted memories from DB cache', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/MEMORIES.md';
    
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
    const filePath = 'C:/Users/user/Dialogue Folio/system/MEMORIES.md';
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
    const filePath = 'C:/Users/user/Dialogue Folio/project-x/MEMORIES.md';
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
      expect(dbItems[0].source_id).toBe('project-x/MEMORIES.md');
    });
  });

  test('appends to workspace memories when active workspace is set with new style folder', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/workspaces/my-workspace-project-x/MEMORIES.md';
    mockFiles[filePath] = `# Memories\n\n`;

    await folioRequestContext.run({ folioRootPath: folioRoot, activeWorkspace: 'project-x', basePath: `${folioRoot}/workspaces/my-workspace-project-x` }, async () => {
      const result = (await saveSemanticMemoryTool.execute!({
        text: 'I prefer coffee',
      }, {} as any)) as any;
      expect(result.status).toBe('Memory saved.');
      
      const fileContent = mockFiles[filePath];
      expect(fileContent).toContain('- I prefer coffee');

      const dbItems = mockPb.collection('memories').items;
      expect(dbItems).toHaveLength(1);
      expect(dbItems[0].source_id).toBe('workspaces/my-workspace-project-x/MEMORIES.md');
    });
  });

  test('updates original file line when semantic duplicate (>0.85 similarity) resides in a File', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/MEMORIES.md';
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
      source_id: 'system/MEMORIES.md',
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
    const filePath = 'C:/Users/user/Dialogue Folio/system/MEMORIES.md';
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

describe('Reconcile Folio Path Migration', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  test('migrates legacy workspace memory source_id to new nested path on reconciliation', async () => {
    // Seed database with an old style file memory record
    await mockPb.collection('memories').create({
      id: 'mem-legacy-id',
      user: 'test-user-id',
      text: 'Fact about workspace',
      hash: crypto.createHash('sha256').update('Fact about workspace').digest('hex'),
      source_type: 'File',
      source_id: 'ws123/workspace_memories.md',
    });

    // Mock folder layout on disk (new layout: workspaces/my-workspace-ws123)
    mockFiles['C:/Users/user/Dialogue Folio'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws123'] = 'directory';
    const legacyWorkspaceMemoriesPath = 'C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws123/workspace_memories.md';
    mockFiles[legacyWorkspaceMemoriesPath] = `# Memories\n\n- Fact about workspace\n`;

    const { reconcileFolio } = await import('./sync');
    await reconcileFolio(folioRoot, mockPb);

    // Verify that the memory's source_id in the database was updated
    const dbItems = mockPb.collection('memories').items;
    expect(dbItems).toHaveLength(1);
    expect(dbItems[0].source_id).toBe('workspaces/my-workspace-ws123/MEMORIES.md');
    // Ensure it was NOT pruned
    expect(dbItems[0].id).toBe('mem-legacy-id');
    // Ensure old path is deleted and new path exists in mockFiles
    expect(mockFiles[legacyWorkspaceMemoriesPath]).toBeUndefined();
    expect(mockFiles['C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws123/MEMORIES.md']).toBe(`# Memories\n\n- Fact about workspace\n`);
  });
});

describe('Daily Log Synchronization', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  beforeEach(() => {
    mockPb.reset();
    mockPb.collections.habits = createMockCollection([
      { id: 'habit-water', name: 'Drink Water', frequency: 'daily', frequencyConfig: {}, currentStreak: 0, longestStreak: 0, archived: false, user: 'test-user-id' },
      { id: 'habit-gym', name: 'Gym', frequency: 'daily', frequencyConfig: {}, currentStreak: 0, longestStreak: 0, archived: false, user: 'test-user-id' },
    ]);
    mockPb.collections.habit_logs = createMockCollection([]);
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
  });

  test('resolves entity path correctly for daily log files', () => {
    const res = resolveEntityFromPath('C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md', folioRoot);
    expect(res).toEqual({
      id: '2026-06-17',
      collectionName: 'daily_logs',
      workspaceId: null,
    });
  });

  test('ignores workspace activity logs from sync resolution', () => {
    const res = resolveEntityFromPath('C:/Users/user/Dialogue Folio/workspaces/app-ws123/activity/2026-06-17.md', folioRoot);
    expect(res).toBeNull();
  });

  test('syncs habit checkbox status from global daily log file', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockFiles[filePath] = `---
date: 2026-06-17
type: daily-log
---

# Daily Log - 2026-06-17

## Today's Habits
- [x] Drink Water
- [ ] Gym
`;

    const { syncDailyLogFileToDb } = await import('./sync');
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);

    const logs = mockPb.collection('habit_logs').items;
    expect(logs).toHaveLength(2);

    const waterLog = logs.find((l: any) => l.habit === 'habit-water');
    expect(waterLog).toBeDefined();
    expect(waterLog.status).toBe('completed');
    expect(waterLog.dateString).toBe('2026-06-17');

    const gymLog = logs.find((l: any) => l.habit === 'habit-gym');
    expect(gymLog).toBeDefined();
    expect(gymLog.status).toBe('skipped');
    expect(gymLog.dateString).toBe('2026-06-17');

    // Check streak updates
    const updatedWaterHabit = mockPb.collection('habits').items.find((h: any) => h.id === 'habit-water');
    expect(updatedWaterHabit.currentStreak).toBe(1);
    expect(updatedWaterHabit.longestStreak).toBe(1);
    expect(updatedWaterHabit.lastLoggedDate).toBe('2026-06-17');
  });

  test('syncs task status, title, and progress notes from global daily log', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockPb.collections.tasks = createMockCollection([
      { id: 'task-1', text: 'Old Task Title', completed: false, user: 'test-user-id', workspace: 'ws-1', history_logs: [] }
    ]);
    mockPb.collections.workspaces = createMockCollection([
      { id: 'ws-1', name: 'My Workspace' }
    ]);

    // Mock individual task file on disk
    const taskDiskPath = 'C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws-1/tasks/old-task-title-task-1.md';
    mockFiles[taskDiskPath] = `---
id: task-1
title: Old Task Title
completed: false
status: todo
---
Initial notes body
`;

    // Seed daily log with updated checkbox, updated title, and progress notes
    mockFiles[filePath] = `---
date: 2026-06-17
type: daily-log
---

# Daily Log - 2026-06-17

## Journal & Raw Notes
Some notes here.

## Tasks completed today
- [x] New Task Title #tsk-task-1 @my-workspace
  * Progress note line 1
  * Progress note line 2
`;

    const { syncDailyLogFileToDb } = await import('./sync');
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);

    // Verify task updated in DB
    const task = mockPb.collection('tasks').items[0];
    expect(task.completed).toBe(true);
    expect(task.text).toBe('New Task Title');
    expect(task.history_logs).toBeDefined();
    expect(task.history_logs).toHaveLength(1);
    expect(task.history_logs[0]).toEqual({
      date: '2026-06-17',
      note: 'Progress note line 1\nProgress note line 2'
    });

    // Verify old task file is deleted and new task file is written on disk
    expect(mockFiles[taskDiskPath]).toBeUndefined();

    const newTaskDiskPath = 'C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws-1/tasks/new-task-title-task-1.md';
    expect(mockFiles[newTaskDiskPath]).toBeDefined();
    expect(mockFiles[newTaskDiskPath]).toContain('completed: true');
    expect(mockFiles[newTaskDiskPath]).toContain('status: completed');
    expect(mockFiles[newTaskDiskPath]).toContain('title: New Task Title');
  });

  test('syncs event cancellation status, title, and progress notes from global daily log', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockPb.collections.events = createMockCollection([
      { id: 'event-1', title: 'Old Event Title', cancelled: false, startTime: Date.now(), user: 'test-user-id', workspace: 'ws-1', history_logs: [] }
    ]);
    mockPb.collections.workspaces = createMockCollection([
      { id: 'ws-1', name: 'My Workspace' }
    ]);

    const eventDiskPath = 'C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws-1/events/old-event-title-event-1.md';
    mockFiles[eventDiskPath] = `---
id: event-1
title: Old Event Title
cancelled: false
startTime: 2026-06-17T10:00:00Z
---
Initial event details
`;

    mockFiles[filePath] = `---
date: 2026-06-17
type: daily-log
---

# Daily Log - 2026-06-17

## Events Today
- [ ] New Event Title (Time: 10:00) #evt-event-1 @my-workspace
  * Cancelled due to conflict
`;

    const { syncDailyLogFileToDb } = await import('./sync');
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);

    const event = mockPb.collection('events').items[0];
    expect(event.cancelled).toBe(true);
    expect(event.title).toBe('New Event Title');
    expect(event.history_logs).toBeDefined();
    expect(event.history_logs[0]).toEqual({
      date: '2026-06-17',
      note: 'Cancelled due to conflict'
    });

    // Check disk file renamed
    expect(mockFiles[eventDiskPath]).toBeUndefined();

    const newEventDiskPath = 'C:/Users/user/Dialogue Folio/workspaces/my-workspace-ws-1/events/new-event-title-event-1.md';
    expect(mockFiles[newEventDiskPath]).toBeDefined();
    expect(mockFiles[newEventDiskPath]).toContain('cancelled: true');
    expect(mockFiles[newEventDiskPath]).toContain('title: New Event Title');
  });

  test('child bullets notes ingestion is idempotent', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockPb.collections.tasks = createMockCollection([
      { 
        id: 'task-1', 
        text: 'Task 1', 
        completed: false, 
        user: 'test-user-id', 
        workspace: 'ws-1', 
        history_logs: [
          { date: '2026-06-16', note: 'Yesterday note' },
          { date: '2026-06-17', note: 'Old today note' }
        ] 
      }
    ]);
    mockPb.collections.workspaces = createMockCollection([
      { id: 'ws-1', name: 'My Workspace' }
    ]);

    mockFiles[filePath] = `---
date: 2026-06-17
type: daily-log
---

# Daily Log - 2026-06-17

## Tasks Completed Today
- [x] Task 1 #tsk-task-1
  * Updated today note
`;

    const { syncDailyLogFileToDb } = await import('./sync');
    // Run twice to ensure idempotency
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);

    const task = mockPb.collection('tasks').items[0];
    expect(task.history_logs).toHaveLength(2); // One for 2026-06-16, one for 2026-06-17
    expect(task.history_logs[0]).toEqual({ date: '2026-06-16', note: 'Yesterday note' });
    expect(task.history_logs[1]).toEqual({ date: '2026-06-17', note: 'Updated today note' });
  });

  test('creates daily_logs PB record with content and date on sync', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockPb.collections.daily_logs = createMockCollection([]);
    mockFiles[filePath] = `# Daily Log - 2026-06-17

## Summary
Worked on the project.

## Tasks
- [x] Fix bug #tsk-task-1
`;

    const { syncDailyLogFileToDb } = await import('./sync');
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);

    const logs = mockPb.collection('daily_logs').items;
    expect(logs).toHaveLength(1);
    expect(logs[0].date).toBe('2026-06-17');
    expect(logs[0].content).toContain('Worked on the project');
    expect(logs[0].user).toBe('test-user-id');
    expect(logs[0].createdAt).toBeDefined();
    expect(logs[0].updatedAt).toBeDefined();
  });

  test('updates existing daily_logs PB record on re-sync', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockPb.collections.daily_logs = createMockCollection([
      { id: 'dl-1', user: 'test-user-id', date: '2026-06-17', content: 'Old content', createdAt: 1000, updatedAt: 1000 }
    ]);
    mockFiles[filePath] = `# Daily Log - 2026-06-17

## Summary
Updated content.
`;

    const { syncDailyLogFileToDb } = await import('./sync');
    await syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot);

    const logs = mockPb.collection('daily_logs').items;
    expect(logs).toHaveLength(1);
    expect(logs[0].content).toContain('Updated content');
    expect(logs[0].updatedAt).toBeGreaterThan(1000);
    expect(logs[0].createdAt).toBe(1000); // Preserved from original
  });

  test('handles missing tasks and events gracefully (404) on daily log sync', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/daily-logs/2026-06-17.md';
    mockPb.collections.daily_logs = createMockCollection([]);
    mockPb.collections.tasks = createMockCollection([]);
    mockPb.collections.events = createMockCollection([]);

    mockFiles[filePath] = `---
date: 2026-06-17
type: daily-log
---

# Daily Log - 2026-06-17

## Tasks
- [x] Fix bug #tsk-task-missing

## Events
- [ ] Attend meeting #evt-event-missing
`;

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { syncDailyLogFileToDb } = await import('./sync');
    await expect(syncDailyLogFileToDb(filePath, mockPb, '2026-06-17', folioRoot)).resolves.not.toThrow();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Sync Engine] Task task-missing from daily log no longer exists in DB, skipping'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Sync Engine] Event event-missing from daily log no longer exists in DB, skipping'));

    consoleLogSpy.mockRestore();
  });
});

describe('Workspace CONTEXT.md Sync', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';

  beforeEach(() => {
    mockPb.collections.workspaces = createMockCollection([
      {
        id: 'abc',
        user: 'user123',
        name: 'Project ABC',
        icon: 'Briefcase',
        color: '#d4a373',
        context: 'Initial context',
      }
    ]);
    mockFiles['C:/Users/user/Dialogue Folio'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces/project-abc-abc'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/.workspace.yaml'] = `id: abc\nname: Project ABC\ncontext: Initial context\n`;
    mockFiles['C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/CONTEXT.md'] = `# Project ABC\n\n## Purpose\nInitial context\n`;
  });

  test('syncs CONTEXT.md changes to DB workspaces collection and updates .workspace.yaml', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/CONTEXT.md';
    mockFiles[filePath] = `# Project ABC\n\n## Purpose\nUpdated context on disk\n`;

    await syncFolioFileToDb(filePath, mockPb, folioRoot);

    const ws = mockPb.collection('workspaces').items.find((w: any) => w.id === 'abc');
    expect(ws.context).toBe('# Project ABC\n\n## Purpose\nUpdated context on disk\n');

    const yamlContent = mockFiles['C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/.workspace.yaml'];
    expect(yamlContent).toContain('Updated context on disk');
  });

  test('pruning CONTEXT.md clears context in DB and .workspace.yaml instead of deleting workspace', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/CONTEXT.md';
    delete mockFiles[filePath];

    const { pruneFolioFileFromDb } = await import('./sync');
    await pruneFolioFileFromDb(filePath, mockPb, folioRoot);

    // Workspace should NOT be deleted
    const ws = mockPb.collection('workspaces').items.find((w: any) => w.id === 'abc');
    expect(ws).toBeDefined();
    // Context should be cleared
    expect(ws.context).toBe('');

    const yamlContent = mockFiles['C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/.workspace.yaml'];
    expect(yamlContent).not.toContain('Initial context');
  });

  test('reconcileFolio restores missing CONTEXT.md from DB or generates default', async () => {
    // 1. Missing CONTEXT.md, exists in DB
    const path1 = 'C:/Users/user/Dialogue Folio/workspaces/project-abc-abc/CONTEXT.md';
    delete mockFiles[path1];

    mockPb.collections.workspaces = createMockCollection([
      {
        id: 'abc',
        user: 'user123',
        name: 'Project ABC',
        icon: 'Briefcase',
        color: '#d4a373',
        context: 'Existing context in DB',
      },
      {
        id: 'xyz',
        user: 'user123',
        name: 'Personal',
        context: '',
      }
    ]);

    mockFiles['C:/Users/user/Dialogue Folio/workspaces/personal-xyz'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces/personal-xyz/.workspace.yaml'] = `id: xyz\nname: Personal\n`;
    const path2 = 'C:/Users/user/Dialogue Folio/workspaces/personal-xyz/CONTEXT.md';

    await reconcileFolio(folioRoot, mockPb);

    // Should restore path1 from DB
    expect(mockFiles[path1]).toBe('Existing context in DB');

    // Should generate default for path2 (Personal workspace)
    expect(mockFiles[path2]).toContain('Casual daily companion space');
  });

  test('reconcileFolio auto-creates default Personal workspace on first launch', async () => {
    // Both disk and DB are completely empty of workspaces
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
    mockFiles['C:/Users/user/Dialogue Folio'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/system'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/system/CORE.md'] = '# Core Identity\n';
    mockFiles['C:/Users/user/Dialogue Folio/system/USER.md'] = '# User Profile\n';
    
    mockPb.collections.workspaces = createMockCollection([]);

    await reconcileFolio(folioRoot, mockPb);

    // It should create the Personal workspace record in DB
    const dbWorkspaces = mockPb.collection('workspaces').items;
    expect(dbWorkspaces).toHaveLength(1);
    expect(dbWorkspaces[0].name).toBe('Personal');

    // It should create workspaces/personal-[id] folder and files on disk
    const wsId = dbWorkspaces[0].id;
    const personalFolder = `C:/Users/user/Dialogue Folio/workspaces/personal-${wsId}`;
    expect(mockFiles[`${personalFolder}/.workspace.yaml`]).toBeDefined();
    expect(mockFiles[`${personalFolder}/.workspace.yaml`]).toContain('name: Personal');
    expect(mockFiles[`${personalFolder}/CONTEXT.md`]).toBeDefined();
    expect(mockFiles[`${personalFolder}/CONTEXT.md`]).toContain('Casual daily companion space');
    expect(mockFiles[`${personalFolder}/CONTEXT.md`]).toContain('Indonesian mixed with English');
  });

  test('reconcileFolio auto-creates trunk session if workspace lacks one', async () => {
    // Disk and DB have workspace but no trunk session
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
    mockFiles['C:/Users/user/Dialogue Folio'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/system'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/system/CORE.md'] = '# Core Identity\n';
    mockFiles['C:/Users/user/Dialogue Folio/system/USER.md'] = '# User Profile\n';

    mockPb.collections.workspaces = createMockCollection([
      {
        id: 'wsnotrunk',
        user: 'test-user-id',
        name: 'Workspace No Trunk',
      }
    ]);
    mockPb.collections.chat_sessions = createMockCollection([]);

    mockFiles['C:/Users/user/Dialogue Folio/workspaces/workspace-no-trunk-wsnotrunk'] = 'directory';
    mockFiles['C:/Users/user/Dialogue Folio/workspaces/workspace-no-trunk-wsnotrunk/.workspace.yaml'] = `id: wsnotrunk\nname: Workspace No Trunk\n`;

    await reconcileFolio(folioRoot, mockPb);

    const trunkSessions = mockPb.collection('chat_sessions').items.filter(
      (s: any) => s.workspace === 'wsnotrunk' && s.isTrunk === true
    );
    expect(trunkSessions).toHaveLength(1);
    expect(trunkSessions[0].title).toBe('Workspace No Trunk Trunk');
    expect(trunkSessions[0].sessionType).toBe('trunk');
    expect(trunkSessions[0].pinned).toBe(true);
  });
});



