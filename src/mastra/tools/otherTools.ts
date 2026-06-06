import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const searchWebTool = createTool({
  id: 'searchWeb',
  description: 'YOU MUST call this whenever the user asks for news, real-time info, or facts you do not know. DO NOT apologize for lack of real-time data, use this tool instead.',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    let searchProvider: 'tavily' | 'serper' = 'tavily';
    let apiKey: string | null = process.env.TAVILY_API_KEY || process.env.NEXT_PUBLIC_TAVILY_API_KEY || null;

    try {
      const client = getConvexClient();
      const searchConfig = await client.query(api.ai.getSearchConfig);
      if (searchConfig?.apiKey) {
        apiKey = searchConfig.apiKey;
        searchProvider = (searchConfig.searchProvider as 'tavily' | 'serper') || 'tavily';
      }
    } catch (e) {
      console.error("Could not fetch search config from Convex:", e);
    }

    if (!apiKey) {
      return { error: `${searchProvider === 'serper' ? 'Serper' : 'Tavily'} API key is not configured. Please add it in Settings > Search Intelligence.` };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let res: Response;
      if (searchProvider === 'serper') {
        res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
          body: JSON.stringify({ q: query }),
          signal: controller.signal,
        });
      } else {
        res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey, query, include_answer: true }),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        return { error: `${searchProvider === 'serper' ? 'Serper' : 'Tavily'} API Error: ${data.error || data.detail || data.message || res.statusText}` };
      }

      let content: string;
      if (searchProvider === 'serper') {
        const organic = (data.organic || []).slice(0, 5).map((r: { title: string; snippet: string; link: string }) => `${r.title}: ${r.snippet} (${r.link})`).join('\n');
        const answerBox = data.answerBox?.answer || data.answerBox?.snippet || '';
        content = answerBox ? `${answerBox}\n\n${organic}` : organic || 'No results found.';
      } else {
        content = data.answer || (data.results ? data.results.map((r: { content: string }) => r.content).join('\n') : 'No results found.');
      }

      return { result: content };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: `Search timed out for "${query}"` };
      }
      return { error: `Error searching for "${query}": ${err instanceof Error ? err.message : 'Unknown error'}` };
    }
  }
});

export const searchHistoricalEntitiesTool = createTool({
  id: 'searchHistoricalEntities',
  description: 'Searches completed tasks and past calendar events within a date range.',
  inputSchema: z.object({
    type: z.string().describe("'tasks', 'events', or 'all'"),
    query: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    limit: z.number().optional()
  }),
  execute: async (input) => {
    const client = getConvexClient();
    if (input.type === 'tasks' || input.type === 'all') {
      const tasks = await client.query(api.tasks.searchHistory, {
        query: input.query,
        startTime: input.startTime,
        endTime: input.endTime,
        limit: input.limit,
      });
      return { tasks };
    }
    if (input.type === 'events' || input.type === 'all') {
      const events = await client.query(api.events.searchHistory, {
        query: input.query,
        startTime: input.startTime,
        endTime: input.endTime,
        limit: input.limit,
      });
      return { events };
    }
    return { results: [] };
  }
});

export const batchAddTasksTool = createTool({
  id: 'batchAddTasks',
  description: 'Creates multiple tasks in a single operation. Smart Grouping for errands.',
  inputSchema: z.object({
    tasks: z.array(z.object({
      text: z.string(),
      priority: z.string().optional(),
      category: z.string().optional(),
      dueDate: z.string().optional(),
      notes: z.string().optional()
    }))
  }),
  outputSchema: z.object({ taskIds: z.array(z.string()), count: z.number() }),
  execute: async (input) => {
    const client = getConvexClient();
    const taskIds = await client.mutation(api.tasks.batchAdd, {
      tasks: input.tasks.map(t => ({
        text: t.text,
        priority: t.priority as "low" | "medium" | "high" | undefined,
        category: t.category,
        dueDate: t.dueDate ? new Date(t.dueDate).getTime() : undefined,
        dueDateStr: t.dueDate ? t.dueDate.split('T')[0] : undefined,
        notes: t.notes,
      })),
    });
    return { taskIds: taskIds as string[], count: taskIds.length };
  }
});

export const getTaskNotesTool = createTool({
  id: 'getTaskNotes',
  description: 'Retrieves the full chronological notes/journal for a specific task.',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });
    return { notes: task?.notes || 'No notes found.', task };
  }
});

export const fetchUrlTool = createTool({
  id: 'fetchUrl',
  description: 'YOU MUST call this whenever the user shares a URL or asks about content behind a link. Fetches and reads the content of a URL shared by the user.',
  inputSchema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    let fetchUrl = url;
    try {
      const gdocMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (gdocMatch) fetchUrl = `https://docs.google.com/document/d/${gdocMatch[1]}/export?format=txt`;
      const gsheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (gsheetMatch) fetchUrl = `https://docs.google.com/spreadsheets/d/${gsheetMatch[1]}/export?format=tsv`;
      const gslideMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
      if (gslideMatch) fetchUrl = `https://docs.google.com/presentation/d/${gslideMatch[1]}/export?format=txt`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(fetchUrl, {
        headers: { "User-Agent": "Dialogue/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        return { error: `Failed to fetch URL: HTTP ${res.status}` };
      }
      
      const text = await res.text();
      const stripped = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
        
      const content = stripped.length > 10000
        ? stripped.slice(0, 10000) + "... [truncated]"
        : stripped;
        
      return { content: content || "No readable text found." };
    } catch (err: unknown) {
      return { error: `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  }
});

export const getTaskResourcesTool = createTool({
  id: 'getTaskResources',
  description: 'Retrieves the linked resources (URLs and files) for a specific task.',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });
    return { resources: task?.resources || [] };
  }
});

export const getEventResourcesTool = createTool({
  id: 'getEventResources',
  description: 'Retrieves the linked resources (URLs and files) for a specific event.',
  inputSchema: z.object({ eventId: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    const event = await client.query(api.events.get, { id: input.eventId as Id<"events"> });
    return { resources: event?.resources || [] };
  }
});

export const listWorkspacesTool = createTool({
  id: 'listWorkspaces',
  description: 'Lists all workspaces the user has created.',
  inputSchema: z.object({}),
  execute: async () => {
    const client = getConvexClient();
    const workspaces = await client.query(api.workspaces.list, {});
    return { workspaces };
  }
});

export const createHabitTool = createTool({
  id: 'create_habit',
  description: 'Creates a new habit routine for the user in the active workspace. Do not use for one-off tasks.',
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    frequency: z.string(),
    daysOfWeek: z.array(z.number()).optional()
  }),
  outputSchema: z.object({ habitId: z.string(), name: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    const habitId = await client.mutation(api.habits.createHabit, {
      name: input.name,
      description: input.description,
      frequency: input.frequency as "daily" | "custom",
      frequencyConfig: { daysOfWeek: input.daysOfWeek },
    });
    return { habitId: habitId as string, name: input.name };
  }
});

export const logHabitTool = createTool({
  id: 'log_habit',
  description: 'Logs a habit execution (completed or skipped) silently. Runs instantly without confirmation.',
  inputSchema: z.object({
    habitId: z.string(),
    dateString: z.string(),
    status: z.string(),
    notes: z.string().optional()
  }),
  outputSchema: z.object({ success: z.boolean(), logId: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    const logId = await client.mutation(api.habits.logHabit, {
      habitId: input.habitId as Id<"habits">,
      dateString: input.dateString,
      status: input.status as "completed" | "skipped",
      notes: input.notes,
    });
    return { success: true, logId: logId as string };
  }
});

export const getHabitConsistencyTool = createTool({
  id: 'get_habit_consistency',
  description: 'Queries consistency percentages, streaks, and logs. Executed silently.',
  inputSchema: z.object({
    periodStartDate: z.string(),
    periodEndDate: z.string()
  }),
  execute: async (input) => {
    const client = getConvexClient();
    const result = await client.query(api.habits.getHabitConsistency, {
      periodStartDate: input.periodStartDate,
      periodEndDate: input.periodEndDate,
    });
    return result;
  }
});

export const listUnreadNotificationsTool = createTool({
  id: 'list_unread_notifications',
  description: 'Retrieves a list of unread notifications and alerts for the active user.',
  inputSchema: z.object({}),
  execute: async () => {
    const client = getConvexClient();
    const notifications = await client.query(api.notifications.listUnread, {});
    return { notifications };
  }
});

export const createCustomReminderTool = createTool({
  id: 'create_custom_reminder',
  description: 'Schedules a custom reminder message to trigger as a system notification at a specific future date and time.',
  inputSchema: z.object({
    message: z.string(),
    dueDate: z.string()
  }),
  outputSchema: z.object({ success: z.boolean(), scheduledFor: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    await client.mutation(api.notifications.createCustomReminder, {
      message: input.message,
      dueDate: input.dueDate,
    });
    return { success: true, scheduledFor: input.dueDate };
  }
});
