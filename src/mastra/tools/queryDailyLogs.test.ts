import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockFiles: Record<string, string> = {};

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: any) => {
      const s = String(p).replace(/\\/g, '/');
      if (s.includes('daily-logs')) {
        // Check both the exact path and if any file starts with this prefix
        return !!mockFiles[s] || Object.keys(mockFiles).some(k => k.startsWith(s + '/'));
      }
      return actual.existsSync(p);
    },
    readdirSync: (p: any) => {
      const s = String(p).replace(/\\/g, '/');
      const prefix = s.endsWith('/daily-logs') ? s : s;
      return Object.keys(mockFiles)
        .filter((k) => k.startsWith(prefix) && k.endsWith('.md'))
        .map((k) => k.split('/').pop()!);
    },
    readFileSync: (p: any, encoding?: any) => {
      const s = String(p).replace(/\\/g, '/');
      if (mockFiles[s] !== undefined) return mockFiles[s];
      throw new Error(`ENOENT: ${s}`);
    },
    default: {} as any,
  };
});

vi.mock('../../lib/folio/sync', () => ({
  getFolioContext: () => ({ folioRootPath: '/mock-folio' }),
  syncFolioFileToDb: vi.fn(),
}));

import { queryDailyLogsTool } from './queryDailyLogs';

beforeEach(() => {
  Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
  // Register the directory itself so existsSync returns true
  mockFiles['/mock-folio/daily-logs'] = 'directory';
  mockFiles['/mock-folio/daily-logs/2026-06-20.md'] = `# Daily Log 2026-06-20

## Summary
Worked on the observer debounce fix. Fixed the issue where runObserver was never called.

## Tasks
- [x] Fix observer debounce bug
- [x] Write tests for the fix

## Events
- [x] Team standup at 10am

## Habits
- [x] Morning run (30min)
`;
  mockFiles['/mock-folio/daily-logs/2026-06-21.md'] = `# Daily Log 2026-06-21

## Summary
Created queryDailyLogs tool for episodic memory access. Updated agent decision tree.

## Tasks
- [x] Create queryDailyLogs tool
- [ ] Update tests

## Events

## Habits
- [x] Reading (20min)
`;
  mockFiles['/mock-folio/daily-logs/2026-06-22.md'] = `# Daily Log 2026-06-22

## Summary
Refactored memory system. Atomic facts only in MEMORIES.md.

## Tasks
- [ ] Finish atomic-facts migration

## Events
- [x] Coffee with Alice at 3pm

## Habits
- [x] Morning yoga
`;
});

describe('queryDailyLogsTool', () => {
  test('returns entries within date range', async () => {
    const result = await queryDailyLogsTool.execute({
      dateFrom: '2026-06-20',
      dateTo: '2026-06-21',
    });
    expect(result.totalFound).toBe(2);
    expect(result.entries[0].date).toBe('2026-06-21');
    expect(result.entries[1].date).toBe('2026-06-20');
  });

  test('filters by keyword', async () => {
    const result = await queryDailyLogsTool.execute({
      dateFrom: '2026-06-20',
      dateTo: '2026-06-22',
      keyword: 'observer',
    });
    expect(result.totalFound).toBe(1);
    expect(result.entries[0].date).toBe('2026-06-20');
  });

  test('respects limit parameter', async () => {
    const result = await queryDailyLogsTool.execute({
      dateFrom: '2026-06-20',
      dateTo: '2026-06-22',
      limit: 2,
    });
    expect(result.totalFound).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  test('returns empty when no matches found', async () => {
    const result = await queryDailyLogsTool.execute({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-05',
    });
    expect(result.totalFound).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  test('returns empty when daily-logs dir missing', async () => {
    // Remove all files so daily-logs dir doesn't "exist"
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
    const result = await queryDailyLogsTool.execute({});
    expect(result.totalFound).toBe(0);
  });

  test('keyword match is case-insensitive', async () => {
    const result = await queryDailyLogsTool.execute({
      dateFrom: '2026-06-20',
      dateTo: '2026-06-22',
      keyword: 'OBSERVER',
    });
    expect(result.totalFound).toBe(1);
  });
});
