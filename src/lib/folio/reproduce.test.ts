import { describe, expect, test, vi, beforeEach } from 'vitest';
import { syncMemoriesFileToDb } from './sync';
import crypto from 'crypto';

// Setup virtual filesystem mock
const mockFiles: Record<string, string> = {};

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

vi.mock('../graph/embedding', () => ({
  getLocalEmbedding: vi.fn().mockResolvedValue(Array(384).fill(0)),
}));

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
    getFullList: async (options: any) => {
      let filtered = [...items];
      if (options?.filter && options.filter.includes('user =')) {
        // Simple mock filter logic for test
        const match = options.filter.match(/user = "([^"]+)"/);
        if (match) {
          const userId = match[1];
          filtered = filtered.filter(item => item.user === userId);
        }
      }
      return filtered;
    },
  };
}

describe('Sync Engine - Admin User ID Reproduction Test', () => {
  const folioRoot = 'C:/Users/user/Dialogue Folio';
  
  // Setup the mock PocketBase client simulating Admin Auth
  const mockPb: any = {
    authStore: {
      // Simulate admin auth record (e.g. key is admin-id, and collectionName is _superusers or absent)
      record: {
        id: 'admin-id-12345',
        email: 'admin@dialogue.local',
        collectionName: '_superusers'
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
        { id: 'real-user-999', email: 'user@example.com', name: 'Real User', collectionName: 'users' }
      ]),
      memories: createMockCollection([]),
    };
    
    // Clear files
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
  });

  test('Sync Engine correctly falls back to user ID when watcher runs as admin', async () => {
    const filePath = 'C:/Users/user/Dialogue Folio/system/MEMORIES.md';
    mockFiles[filePath] = `# Memories\n\n- Fact one\n- Fact two\n`;

    await syncMemoriesFileToDb(filePath, mockPb, folioRoot);

    const savedMemories = mockPb.collection('memories').items;
    expect(savedMemories.length).toBeGreaterThan(0);
    
    // Assert on the user ID assigned to the memory
    const userIdsUsed = savedMemories.map(m => m.user);
    console.log('User IDs assigned in DB memories:', userIdsUsed);
    
    // FIXED BEHAVIOR: It should fallback to the user record 'real-user-999'
    expect(userIdsUsed[0]).toBe('real-user-999');
  });
});
