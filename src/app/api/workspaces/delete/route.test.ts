import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockFiles: Record<string, string> = {
  'C:/Users/user/Dialogue Folio/workspaces': 'directory',
  'C:/Users/user/Dialogue Folio/workspaces/my-ws-ws123': 'directory',
};

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
    mkdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      mockFiles[norm] = 'directory';
      return undefined;
    },
    readdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.endsWith('/workspaces')) {
        return ['my-ws-ws123'];
      }
      return [];
    },
    statSync: (p: any) => {
      return {
        isDirectory: () => true,
      };
    },
    renameSync: (from: any, to: any) => {
      const normFrom = String(from).replace(/\\/g, '/');
      const normTo = String(to).replace(/\\/g, '/');
      delete mockFiles[normFrom];
      mockFiles[normTo] = 'directory';
      return undefined;
    },
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('../../../../lib/pb-actions/auth', () => ({
  verifyPbToken: vi.fn().mockImplementation(async (token: string) => {
    if (token === 'my-valid-token') {
      return { id: 'test-user-id' };
    }
    return null;
  }),
}));

const mockPbDelete = vi.fn().mockResolvedValue(true);
const mockPbGetFullList = vi.fn().mockResolvedValue([]);

vi.mock('pocketbase', () => {
  return {
    default: class MockPocketBase {
      autoCancellation = vi.fn();
      authStore = {
        save: vi.fn(),
      };
      collection = vi.fn().mockReturnValue({
        delete: mockPbDelete,
        getFullList: mockPbGetFullList,
      });
    },
  };
});

beforeEach(() => {
  mockPbDelete.mockClear();
  mockPbGetFullList.mockClear();
  for (const k of Object.keys(mockFiles)) {
    delete mockFiles[k];
  }
  mockFiles['C:/Users/user/Dialogue Folio/workspaces'] = 'directory';
  mockFiles['C:/Users/user/Dialogue Folio/workspaces/my-ws-ws123'] = 'directory';
});

describe('POST /api/workspaces/delete', () => {
  test('returns 401 when authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/delete', {
      method: 'POST',
      body: JSON.stringify({ id: 'ws123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('successfully deletes database records and moves folder to .trash', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/delete', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer my-valid-token',
        'x-folio-path': 'C:/Users/user/Dialogue Folio',
      },
      body: JSON.stringify({ id: 'ws123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ ok: true });

    // Verify pocketbase delete was called for workspace ID
    expect(mockPbDelete).toHaveBeenCalledWith('ws123');

    // Verify that the workspace folder was moved to .trash/
    expect(mockFiles['C:/Users/user/Dialogue Folio/workspaces/my-ws-ws123']).toBeUndefined();
    const trashKeys = Object.keys(mockFiles).filter(k => k.startsWith('C:/Users/user/Dialogue Folio/.trash/my-ws-ws123-'));
    expect(trashKeys.length).toBe(1);
  });
});
