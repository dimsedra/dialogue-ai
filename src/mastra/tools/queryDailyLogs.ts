import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const queryDailyLogsTool = createTool({
  id: 'queryDailyLogs',
  description: 'Queries daily log entries by date range or topic. PREFERRED over saveSemanticMemory when you need to recall what happened on a specific day, what the user was working on recently, or find past activity context. Reads from daily-logs/ files.',
  inputSchema: z.object({
    dateFrom: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 7 days ago."),
    dateTo: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    keyword: z.string().optional().describe("Optional: filter entries by keyword/topic (case-insensitive)."),
    limit: z.number().optional().describe("Max entries to return (default 7)."),
  }),
  outputSchema: z.object({
    entries: z.array(z.object({
      date: z.string(),
      content: z.string(),
    })),
    totalFound: z.number(),
  }),
  execute: async (input) => {
    const { getFolioContext } = await import('../../lib/folio/sync');
    const { readdirSync, readFileSync, existsSync } = await import('fs');
    const { join } = await import('path');

    try {
      const { folioRootPath } = getFolioContext();
      const dailyLogsDir = join(folioRootPath, 'daily-logs');

      if (!existsSync(dailyLogsDir)) {
        return { entries: [], totalFound: 0 };
      }

      // Default date range: last 7 days to today
      const now = new Date();
      const defaultTo = now.toISOString().slice(0, 10);
      const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const from = input.dateFrom || defaultFrom;
      const to = input.dateTo || defaultTo;
      const keyword = input.keyword?.toLowerCase();
      const maxResults = input.limit || 7;

      // List daily log files
      const files = readdirSync(dailyLogsDir)
        .filter((f: string) => f.endsWith('.md'))
        .map((f: string) => f.replace('.md', ''))
        .filter((d: string) => d >= from && d <= to)
        .sort()
        .reverse();

      const entries: Array<{ date: string; content: string }> = [];

      for (const dateStr of files) {
        if (entries.length >= maxResults) break;

        const filePath = join(dailyLogsDir, `${dateStr}.md`);
        const content = readFileSync(filePath, 'utf8');

        if (keyword && !content.toLowerCase().includes(keyword)) {
          continue;
        }

        entries.push({ date: dateStr, content });
      }

      return { entries, totalFound: entries.length };
    } catch (err) {
      console.error('[queryDailyLogs Tool] Error:', err);
      return { entries: [], totalFound: 0 };
    }
  }
});
