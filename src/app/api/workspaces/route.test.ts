import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import fs from 'fs';

// ============================================================================
// Mocks
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
    mkdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, '/');
      mockFiles[norm] = 'directory';
      return undefined;
    },
    writeFileSync: (p: any, content: any) => {
      const norm = String(p).replace(/\\/g, '/');
      mockFiles[norm] = content;
      return undefined;
    },
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('../../../lib/pb-actions/auth', () => ({
  verifyPbToken: vi.fn().mockImplementation(async (token: string) => {
    if (token === 'my-valid-token') {
      return { id: 'test-user-id' };
    }
    return null;
  }),
}));

const mockPbCreate = vi.fn().mockResolvedValue({ id: 'mocked-workspace-id' });

vi.mock('pocketbase', () => {
  return {
    default: class MockPocketBase {
      autoCancellation = vi.fn();
      authStore = {
        save: vi.fn(),
      };
      collection = vi.fn().mockReturnValue({
        create: mockPbCreate,
      });
    },
  };
});

beforeEach(() => {
  mockPbCreate.mockClear();
  for (const k of Object.keys(mockFiles)) {
    delete mockFiles[k];
  }
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('POST /api/workspaces', () => {
  test('returns 401 when authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test WS' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Unauthorized');
  });

  test('returns 401 when token is invalid', async () => {
    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
      body: JSON.stringify({ name: 'Test WS' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Unauthorized');
  });

  test('returns 400 when name is missing', async () => {
    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer my-valid-token',
      },
      body: JSON.stringify({ icon: 'Folder' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing name');
  });

  test('creates PocketBase record and directory on filesystem proactively', async () => {
    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer my-valid-token',
        'x-folio-path': 'C:/Users/user/Dialogue Folio',
      },
      body: JSON.stringify({
        name: 'My New Workspace',
        icon: 'Folder',
        color: '#ff0000',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ ok: true, id: 'mocked-workspace-id' });

    // Verify database record parameters
    expect(mockPbCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'test-user-id',
        name: 'My New Workspace',
        icon: 'Folder',
        color: '#ff0000',
      })
    );

    // Verify proactive folder creation on virtual disk
    expect(mockFiles['C:/Users/user/Dialogue Folio/workspaces/my-new-workspace-mocked-workspace-id']).toBe('directory');
  });
});
