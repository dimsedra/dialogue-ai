import { describe, expect, test, vi, beforeEach } from 'vitest';
import { resolveEntityFromPath, syncFolioFileToDb, reconcileFolio } from './sync';
import { createDialogueAgent } from '../../mastra/agents/dialogueAgent';
import { updateProfile } from '../pb-actions/updateProfile';
import { join } from 'path';

// Setup virtual filesystem mock
const mockFiles = vi.hoisted(() => {
  return {} as Record<string, string>;
});

const fsMock = vi.hoisted(() => {
  const mockObj = {
    existsSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('test-folio-profile') || norm.includes('dialogue-folio')) {
        return !!mockFiles[norm];
      }
      return false;
    },
    readFileSync: (p: any, options?: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('test-folio-profile') || norm.includes('dialogue-folio')) {
        if (!mockFiles[norm]) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
        return mockFiles[norm];
      }
      throw new Error(`ENOENT: no such file or directory, open '${p}'`);
    },
    writeFileSync: (p: any, content: any, options?: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('test-folio-profile') || norm.includes('dialogue-folio')) {
        mockFiles[norm] = content;
        return;
      }
      throw new Error(`Permission denied to write to '${p}'`);
    },
    mkdirSync: (p: any, options?: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('test-folio-profile') || norm.includes('dialogue-folio')) {
        mockFiles[norm] = 'directory';
        return;
      }
      throw new Error(`Permission denied to create directory '${p}'`);
    },
    statSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('test-folio-profile') || norm.includes('dialogue-folio')) {
        if (!mockFiles[norm]) throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
        return {
          isDirectory: () => mockFiles[norm] === 'directory',
          isFile: () => mockFiles[norm] !== 'directory',
        };
      }
      throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
    },
    readdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('test-folio-profile') || norm.includes('dialogue-folio')) {
        const prefix = norm.endsWith('/') ? norm : norm + '/';
        const keys = Object.keys(mockFiles).filter(k => k.startsWith(prefix));
        const subItems = keys.map(k => {
          const suffix = k.slice(prefix.length);
          const parts = suffix.split('/');
          return parts[0];
        });
        return Array.from(new Set(subItems)).filter(Boolean);
      }
      throw new Error(`ENOENT: no such file or directory, readdir '${p}'`);
    }
  };
  return {
    ...mockObj,
    default: mockObj
  };
});

vi.mock('fs', () => fsMock);
vi.mock('node:fs', () => fsMock);

function createMockCollection(initialItems: any[]) {
  const items = [...initialItems];
  return {
    items,
    getOne: async (id: string) => {
      const item = items.find(i => i.id === id);
      if (!item) {
        const err = new Error("404 Not Found") as any;
        err.status = 404;
        throw err;
      }
      return item;
    },
    getList: async (page: number, limit: number, options: any) => {
      let filtered = [...items];
      if (options?.filter) {
        const match = options.filter.match(/^user = "([^"]+)"$/);
        if (match) {
          const userId = match[1];
          filtered = filtered.filter(i => i.user === userId);
        }
      }
      return {
        items: filtered.slice((page - 1) * limit, page * limit),
        totalItems: filtered.length,
      };
    },
    getFirstListItem: async (filter: string) => {
      const match = filter.match(/user = "([^"]+)"/);
      if (match) {
        const userId = match[1];
        const item = items.find(i => i.user === userId);
        if (!item) {
          const err = new Error("404 Not Found") as any;
          err.status = 404;
          throw err;
        }
        return item;
      }
      throw new Error("Mock getFirstListItem filter not supported: " + filter);
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
    delete: async (id: string) => {
      const idx = items.findIndex(item => item.id === id);
      if (idx !== -1) {
        items.splice(idx, 1);
      }
      return true;
    },
    getFullList: async () => items,
  };
}

// Setup the mock PocketBase client
const mockPb: any = {
  authStore: {
    record: {
      id: 'user-123',
      email: 'user@dialogue.local',
      collectionName: 'users'
    },
    token: 'mock-token',
    save() {},
  },
  collections: {},
  collection(name: string) {
    return this.collections[name];
  }
};

vi.mock('pocketbase', () => {
  return {
    default: class MockPocketBase {
      authStore = mockPb.authStore;
      collection(name: string) {
        return mockPb.collection(name);
      }
    }
  };
});

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

describe('Folio Profile & Core Identity Sync Test', () => {
  const folioRoot = 'C:/Users/user/test-folio-profile';

  beforeEach(() => {
    mockPb.collections = {
      users: createMockCollection([
        { id: 'user-123', email: 'user@dialogue.local', name: 'Original Name', collectionName: 'users' }
      ]),
      user_profile: createMockCollection([
        { id: 'profile-123', user: 'user-123', name: 'Original Name', bio: 'Original Bio', preferences: { theme: 'dark' } }
      ]),
      tasks: createMockCollection([]),
      events: createMockCollection([]),
      memories: createMockCollection([]),
      workspaces: createMockCollection([]),
      graph_edges: createMockCollection([]),
      chat_sessions: createMockCollection([]),
      habits: createMockCollection([]),
    };
    
    // Clear virtual files
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }

    // Initialize root folder and directories in mock filesystem
    mockFiles[folioRoot] = 'directory';
    mockFiles[join(folioRoot, 'system').replace(/\\/g, '/')] = 'directory';
  });

  test('resolveEntityFromPath resolves system/USER.md correctly', () => {
    const info = resolveEntityFromPath(join(folioRoot, 'system', 'USER.md'), folioRoot);
    expect(info).not.toBeNull();
    expect(info?.collectionName).toBe('user_profile');
    expect(info?.id).toBe('user_profile');
  });

  test('syncFolioFileToDb updates PocketBase profile and user name from system/USER.md', async () => {
    const filePath = 'C:/Users/user/test-folio-profile/system/USER.md';
    mockFiles[filePath] = `# User Profile\n\n## Profile\n- Name: John Doe\n- Bio/Facts: John is a software developer.\n`;

    await syncFolioFileToDb(filePath, mockPb, folioRoot);

    const profile = mockPb.collections.user_profile.items[0];
    expect(profile.name).toBe('John Doe');
    expect(profile.bio).toBe('John is a software developer.');
    expect(profile.preferences.theme).toBe('dark'); // Preserved preferences

    const user = mockPb.collections.users.items[0];
    expect(user.name).toBe('John Doe');
  });

  test('reconcileFolio creates CORE.md and USER.md if missing', async () => {
    await reconcileFolio(folioRoot, mockPb);

    expect(mockFiles['C:/Users/user/test-folio-profile/system/CORE.md']).toContain('# Core Identity');
    expect(mockFiles['C:/Users/user/test-folio-profile/system/USER.md']).toContain('Name: Original Name');
    expect(mockFiles['C:/Users/user/test-folio-profile/system/USER.md']).toContain('Bio/Facts: Original Bio');
  });

  test('updateProfile server action writes to USER.md and preserves other sections', async () => {
    const filePath = 'C:/Users/user/test-folio-profile/system/USER.md';
    mockFiles[filePath] = `# User Profile\n\n## Profile\n- Name: Old Name\n- Bio/Facts: Old Bio\n\n## Observed Patterns\n- Loves writing tests.\n`;

    const ctx = {
      user: { id: 'user-123', email: 'user@dialogue.local' },
      token: 'mock-token'
    };

    // Override process.env.DEV_LOCAL_PATH for action
    process.env.DEV_LOCAL_PATH = folioRoot;

    await updateProfile({ name: 'New Name', bio: 'New Bio' }, ctx);

    const writtenContent = mockFiles[filePath];
    expect(writtenContent).toContain('- Name: New Name');
    expect(writtenContent).toContain('- Bio/Facts: New Bio');
    expect(writtenContent).toContain('## Observed Patterns');
    expect(writtenContent).toContain('- Loves writing tests.');
  });

  test('createDialogueAgent loads instructions from CORE.md and USER.md', async () => {
    mockFiles['C:/Users/user/test-folio-profile/system/CORE.md'] = '# My Core Identity\n\nYou are a helpful assistant.';
    mockFiles['C:/Users/user/test-folio-profile/system/USER.md'] = '# My Profile\n\n## Profile\n- Name: Alice\n- Bio/Facts: She likes hiking.';

    const agent = await createDialogueAgent(
      'gemini',
      'gemini-flash',
      'mock-api-key',
      null,
      null,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      'auto',
      undefined,
      null,
      folioRoot
    );

    const insts = await agent.getInstructions();
    expect(insts).toContain('You are a helpful assistant.');
    expect(insts).toContain('Name: Alice');
    expect(insts).toContain('Bio/Facts: She likes hiking.');
  });

  test('createDialogueAgent loads instructions from CONTEXT.md if workspace is provided', async () => {
    mockFiles['C:/Users/user/test-folio-profile/system/CORE.md'] = '# My Core Identity\n\nYou are a helpful assistant.';
    mockFiles['C:/Users/user/test-folio-profile/system/USER.md'] = '# My Profile\n\n## Profile\n- Name: Alice\n- Bio/Facts: She likes hiking.';
    mockFiles['C:/Users/user/test-folio-profile/workspaces/project-abc-ws-abc/CONTEXT.md'] = '# Project ABC\n\n## Purpose\nThis workspace is for writing tests.';

    // Mock Mastra Workspace and LocalFilesystem
    const mockWorkspace = {
      filesystem: {
        basePath: 'C:/Users/user/test-folio-profile/workspaces/project-abc-ws-abc'
      }
    };

    const agent = await createDialogueAgent(
      'gemini',
      'gemini-flash',
      'mock-api-key',
      null,
      null,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      'auto',
      mockWorkspace as any,
      null,
      folioRoot
    );

    const insts = await agent.getInstructions();
    expect(insts).toContain('You are a helpful assistant.');
    expect(insts).toContain('Name: Alice');
    expect(insts).toContain('Workspace Context');
    expect(insts).toContain('This workspace is for writing tests.');
  });

  test('createDialogueAgent appends overdueTriagePrompt to instructions', async () => {
    mockFiles['C:/Users/user/test-folio-profile/system/CORE.md'] = '# My Core Identity\n\nYou are a helpful assistant.';
    mockFiles['C:/Users/user/test-folio-profile/system/USER.md'] = '# My Profile\n\n## Profile\n- Name: Alice\n- Bio/Facts: She likes hiking.';

    const agent = await createDialogueAgent(
      'gemini',
      'gemini-flash',
      'mock-api-key',
      null,
      null,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      'auto',
      undefined,
      null,
      folioRoot,
      false, // isBranch
      null,  // todaySummary
      '## Overdue Task Alert\n- Task 1 is overdue. Suggest branching to triage.' // overdueTriagePrompt
    );

    const insts = await agent.getInstructions();
    expect(insts).toContain('You are a helpful assistant.');
    expect(insts).toContain('Task 1 is overdue. Suggest branching to triage.');
  });
});
