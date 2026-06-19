import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { startWatcher, stopWatcher } from './watcher';
import chokidar from 'chokidar';
import { getPbAdmin } from '../pb-server-admin';
import { syncFolioFileToDb, pruneFolioFileFromDb } from './sync';

// Mock dependencies
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('chokidar', () => {
  const watch = vi.fn(() => mockWatcher);
  return {
    watch,
    default: {
      watch,
    },
  };
});

vi.mock('../pb-server-admin', () => ({
  getPbAdmin: vi.fn().mockResolvedValue({ id: 'mock-pb' }),
}));

vi.mock('./sync', () => ({
  syncFolioFileToDb: vi.fn().mockResolvedValue(undefined),
  pruneFolioFileFromDb: vi.fn().mockResolvedValue(undefined),
  resolveEntityFromPath: vi.fn().mockImplementation((filePath: string) => {
    if (filePath.includes('task-123.md')) {
      return { id: '123', collectionName: 'tasks', workspaceId: null };
    }
    return null;
  }),
}));

describe('Folio File Watcher', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (process.env as any).NODE_ENV = 'development';
    process.env.DEV_LOCAL_PATH = '/test/folio';
  });

  afterEach(async () => {
    (process.env as any).NODE_ENV = originalEnv;
    vi.useRealTimers();
    await stopWatcher();
  });

  test('should start chokidar watcher on resolved path', async () => {
    await startWatcher();

    expect(chokidar.watch).toHaveBeenCalledWith('/test/folio', expect.objectContaining({
      persistent: true,
      ignoreInitial: true,
    }));
  });

  test('should register add, change, unlink handlers', async () => {
    await startWatcher();

    expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
    expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
  });

  test('should trigger syncFolioFileToDb on valid add event after debounce', async () => {
    await startWatcher();

    // Get the registered 'add' callback
    const addCall = mockWatcher.on.mock.calls.find(
      (call: any) => call[0] === 'add'
    );
    expect(addCall).toBeDefined();
    const addCallback = addCall![1];

    // Trigger callback with valid path
    addCallback('/test/folio/tasks/task-123.md');

    // Shouldn't run immediately (debounced)
    expect(syncFolioFileToDb).not.toHaveBeenCalled();

    // Fast-forward timers by 250ms and await the async callback execution
    await vi.advanceTimersByTimeAsync(250);

    expect(getPbAdmin).toHaveBeenCalled();
    expect(syncFolioFileToDb).toHaveBeenCalledWith(
      '/test/folio/tasks/task-123.md',
      expect.any(Object),
      '/test/folio'
    );
  });

  test('should ignore add event on invalid path', async () => {
    await startWatcher();

    const addCall = mockWatcher.on.mock.calls.find(
      (call: any) => call[0] === 'add'
    );
    expect(addCall).toBeDefined();
    const addCallback = addCall![1];

    addCallback('/test/folio/some-random-file.txt');
    await vi.advanceTimersByTimeAsync(250);

    expect(syncFolioFileToDb).not.toHaveBeenCalled();
  });

  test('should trigger pruneFolioFileFromDb on unlink event', async () => {
    await startWatcher();

    const unlinkCall = mockWatcher.on.mock.calls.find(
      (call: any) => call[0] === 'unlink'
    );
    expect(unlinkCall).toBeDefined();
    const unlinkCallback = unlinkCall![1];

    // Await the async handler directly
    await unlinkCallback('/test/folio/tasks/task-123.md');

    expect(pruneFolioFileFromDb).toHaveBeenCalledWith(
      '/test/folio/tasks/task-123.md',
      expect.any(Object),
      '/test/folio'
    );
  });
});
