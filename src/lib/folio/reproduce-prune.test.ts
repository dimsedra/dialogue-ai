import { describe, expect, test, vi, beforeEach } from 'vitest';
import { reconcileFolio } from './sync';

// Setup virtual filesystem mock
const mockFiles: Record<string, string | 'directory'> = {};

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
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
    readdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('Dialogue Folio') || norm.includes('dialogue-folio')) {
        const keys = Object.keys(mockFiles).filter(k => k.startsWith(norm + '/'));
        const directChildren = new Set(
          keys.map(k => {
            const relative = k.slice(norm.length + 1);
            const firstSlash = relative.indexOf('/');
            return firstSlash === -1 ? relative : relative.slice(0, firstSlash);
          }).filter(name => name.length > 0)
        );
        return Array.from(directChildren);
      }
      return actual.readdirSync(p);
    },
    statSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('Dialogue Folio') || norm.includes('dialogue-folio')) {
        if (!mockFiles[norm]) throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
        return {
          isDirectory: () => mockFiles[norm] === 'directory',
          isFile: () => mockFiles[norm] !== 'directory',
        };
      }
      return actual.statSync(p);
    },
  };
});

function createMockCollection(initialItems: any[]) {
  const items = [...initialItems];
  return {
    items,
    getList: async () => ({ items: [], totalItems: 0 }),
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
    delete: async (id: string) => {
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) {
        items.splice(idx, 1);
      }
    },
    getFullList: async (options: any) => {
      return [...items];
    },
  };
}

describe('Sync Engine - Pruning Reproduction Test', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';
  
  const mockPb: any = {
    authStore: {
      record: {
        id: 'user-123',
        email: 'user@example.com',
        collectionName: 'users'
      }
    },
    collections: {},
    collection(name: string) {
      return this.collections[name];
    }
  };

  beforeEach(() => {
    // Reset mock database
    mockPb.collections = {
      users: createMockCollection([
        { id: 'user-123', email: 'user@example.com', name: 'Real User', collectionName: 'users' }
      ]),
      workspaces: createMockCollection([
        { id: '7ff', name: 'Casual', user: 'user-123' }
      ]),
      chat_sessions: createMockCollection([
        { id: 'session-123', workspace: '7ff', isTrunk: true, sessionType: 'trunk' }
      ]),
      tasks: createMockCollection([
        { id: 'task-123', workspace: '7ff', title: 'Test Task' }
      ]),
      events: createMockCollection([
        { id: 'event-123', workspace: '7ff', title: 'Test Event' }
      ]),
      memories: createMockCollection([]),
    };
    
    // Clear files
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }

    // Set up disk structure: workspace folder exists but has no tasks/events subdirectories
    mockFiles[`${folioRoot}`] = 'directory';
    mockFiles[`${folioRoot}/system`] = 'directory';
    mockFiles[`${folioRoot}/system/CORE.md`] = '# Core Identity\n';
    mockFiles[`${folioRoot}/system/USER.md`] = '# User Profile\n';
    mockFiles[`${folioRoot}/workspaces`] = 'directory';
    mockFiles[`${folioRoot}/workspaces/casual-7ff`] = 'directory';
    mockFiles[`${folioRoot}/workspaces/casual-7ff/.workspace.yaml`] = 'id: 7ff\nname: Casual\n';
    mockFiles[`${folioRoot}/workspaces/casual-7ff/CONTEXT.md`] = '# Casual\n';
  });

  test('reconcileFolio does NOT prune tasks and events from DB if their folder does not exist', async () => {
    // Currently, tasks and events directories are missing.
    // Let's run reconcileFolio
    await reconcileFolio(folioRoot, mockPb);

    // The task and event should NOT be pruned because the directories were missing on disk
    const tasks = mockPb.collection('tasks').items;
    const events = mockPb.collection('events').items;
    
    console.log('REPRODUCTION: Tasks after reconcile:', tasks);
    console.log('REPRODUCTION: Events after reconcile:', events);
    
    // Assert they are NOT deleted
    expect(tasks).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(tasks[0].id).toBe('task-123');
    expect(events[0].id).toBe('event-123');
  });
});
