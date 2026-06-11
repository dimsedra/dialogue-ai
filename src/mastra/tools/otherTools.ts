import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const searchWebTool = createTool({
  id: 'searchWeb',
  description: 'YOU MUST call this whenever the user asks for news, real-time info, or facts you do not know. DO NOT apologize for lack of real-time data, use this tool instead.',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    let searchProvider: 'tavily' | 'serper' = 'tavily';
    let apiKey: string | null = process.env.TAVILY_API_KEY || process.env.NEXT_PUBLIC_TAVILY_API_KEY || null;

    try {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const userId = pb.authStore.record?.id;
      if (userId) {
        try {
          const profile = await pb.collection('users').getOne(userId);
          const prefs = profile.preferences as any;
          if (prefs?.searchApiKey) {
            apiKey = prefs.searchApiKey;
            searchProvider = (prefs.searchProvider as 'tavily' | 'serper') || 'tavily';
          }
        } catch (e) {
          console.error("Could not fetch search config from PB:", e);
        }
      }
    } catch (e) {
      console.error("Could not fetch search config:", e);
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
  },
  background: { enabled: true }
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
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const results: any = {};
    
    if (input.type === 'tasks' || input.type === 'all') {
      const filters = [`user = "${user}"`];
      if (input.startTime) filters.push(`dueDate >= ${input.startTime}`);
      if (input.endTime) filters.push(`dueDate <= ${input.endTime}`);
      if (input.query) filters.push(`text ~ "${input.query.replace(/"/g, '\\"')}"`);
      const tasks = await pb.collection("tasks").getList(1, input.limit || 50, {
        filter: filters.join(' && '),
        sort: '-dueDate'
      });
      results.tasks = tasks.items.map((t: any) => ({
        id: t.id,
        text: t.text,
        dueDate: t.dueDate || undefined,
        priority: t.priority || undefined,
        completed: !!t.completed,
      }));
    }
    
    if (input.type === 'events' || input.type === 'all') {
      const filters = [`user = "${user}"`];
      if (input.startTime) filters.push(`startTime >= ${input.startTime}`);
      if (input.endTime) filters.push(`startTime <= ${input.endTime}`);
      if (input.query) filters.push(`title ~ "${input.query.replace(/"/g, '\\"')}"`);
      const events = await pb.collection("events").getList(1, input.limit || 50, {
        filter: filters.join(' && '),
        sort: '-startTime'
      });
      results.events = events.items.map((e: any) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime || undefined,
        location: e.location || undefined,
      }));
    }
    
    return results;
  },
  toModelOutput: (output: any) => {
    const parts: string[] = [];
    if (output.tasks?.length) {
      parts.push('Tasks:');
      output.tasks.forEach((t: any) => parts.push(
        `  "${t.text}"${t.dueDate ? ` due ${new Date(t.dueDate).toLocaleDateString()}` : ''}${t.priority ? ` [${t.priority}]` : ''}${t.completed ? ' ✓' : ''}`
      ));
    }
    if (output.events?.length) {
      parts.push('Events:');
      output.events.forEach((e: any) => parts.push(
        `  "${e.title}"${e.startTime ? ` ${new Date(e.startTime).toLocaleString()}` : ''}${e.location ? ` @ ${e.location}` : ''}`
      ));
    }
    return parts.join('\n') || 'No results found.';
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
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const taskIds = [];
    for (const t of input.tasks) {
      const record = await pb.collection("tasks").create({
        user,
        text: t.text,
        priority: t.priority || "medium",
        category: t.category,
        dueDate: t.dueDate ? new Date(t.dueDate).getTime() : undefined,
        dueDateStr: t.dueDate ? t.dueDate.split('T')[0] : undefined,
        notes: t.notes,
        completed: false,
        createdAt: Date.now()
      });
      taskIds.push(record.id);
    }
    return { taskIds, count: taskIds.length };
  }
});

export const getTaskNotesTool = createTool({
  id: 'getTaskNotes',
  description: 'Retrieves the full chronological notes/journal for a specific task.',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    try {
      const record = await pb.collection("tasks").getOne(input.taskId);
      return {
        notes: record.notes || 'No notes found.',
        task: {
          id: record.id,
          text: record.text,
          dueDate: record.dueDate || undefined,
          priority: record.priority || undefined,
          completed: !!record.completed,
        }
      };
    } catch (err) {
      return { notes: 'No notes found.', task: null };
    }
  },
  toModelOutput: (output: any) =>
    `Notes for "${output.task?.text || 'task'}":\n${output.notes || '(empty)'}`
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
  },
  background: { enabled: true }
});

export const getTaskResourcesTool = createTool({
  id: 'getTaskResources',
  description: 'Retrieves the linked resources (URLs and files) for a specific task.',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    try {
      const record = await pb.collection("tasks").getOne(input.taskId);
      return { resources: record.resources || [] };
    } catch {
      return { resources: [] };
    }
  }
});

export const getEventResourcesTool = createTool({
  id: 'getEventResources',
  description: 'Retrieves the linked resources (URLs and files) for a specific event.',
  inputSchema: z.object({ eventId: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    try {
      const record = await pb.collection("events").getOne(input.eventId);
      return { resources: record.resources || [] };
    } catch {
      return { resources: [] };
    }
  }
});

export const listWorkspacesTool = createTool({
  id: 'listWorkspaces',
  description: 'Lists all workspaces the user has created.',
  inputSchema: z.object({}),
  execute: async () => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    const records = await pb.collection("workspaces").getFullList({ sort: '-createdAt' });
    return {
      workspaces: records.map((w: any) => ({
        id: w.id,
        name: w.name,
        icon: w.icon,
        color: w.color,
        createdAt: w.createdAt,
      }))
    };
  },
  toModelOutput: (output: any) => {
    if (!output.workspaces?.length) return 'No workspaces found.';
    return output.workspaces.map((w: any) => `"${w.name}"`).join(', ');
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
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const record = await pb.collection("habits").create({
      user,
      name: input.name,
      description: input.description,
      frequency: input.frequency,
      daysOfWeek: input.daysOfWeek || [],
      archived: false,
      createdAt: Date.now(),
    });
    return { habitId: record.id, name: input.name };
  }
});

export const logHabitTool = createTool({
  id: 'log_habit',
  description: 'Logs a habit execution (completed or skipped) silently. Always prompt for or deduce daily context to include in the notes field — habit log notes are automatically indexed into semantic memory (with MENTIONS_HABIT graph edges) via the ingestion pipeline. PREFERRED over saveSemanticMemory for habit-related observations.',
  inputSchema: z.object({
    habitId: z.string(),
    dateString: z.string(),
    status: z.string(),
    notes: z.string().optional()
  }),
  outputSchema: z.object({ success: z.boolean(), logId: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const record = await pb.collection("habit_logs").create({
      user,
      habit: input.habitId,
      dateString: input.dateString,
      status: input.status,
      notes: input.notes,
      createdAt: Date.now(),
    });

    if (input.notes) {
      const { ingestHabitLogNotes } = await import('../../lib/graph/ingest');
      await ingestHabitLogNotes(pb, record.id, input.habitId, input.notes);
    }

    return { success: true, logId: record.id };
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
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const habits = await pb.collection("habits").getFullList({
      filter: `user = "${user}" && archived = false`,
    });
    const logs = await pb.collection("habit_logs").getFullList({
      filter: `user = "${user}" && dateString >= "${input.periodStartDate}" && dateString <= "${input.periodEndDate}"`,
    });
    
    return {
      habits: habits.map((h: any) => ({
        id: h.id,
        name: h.name,
        frequency: h.frequency,
        daysOfWeek: h.daysOfWeek || [],
        logs: logs.filter((l: any) => l.habit === h.id).map((l: any) => ({
          dateString: l.dateString,
          status: l.status,
          notes: l.notes,
        })),
      })),
    };
  },
  toModelOutput: (output: any) => {
    if (!output.habits?.length) return 'No habits found.';
    return output.habits.map((h: any) => {
      const total = h.logs.length;
      const done = h.logs.filter((l: any) => l.status === 'completed').length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const sorted = [...h.logs].sort((a: any, b: any) => b.dateString.localeCompare(a.dateString));
      let streak = 0;
      for (const log of sorted) { if (log.status === 'completed') streak++; else break; }
      return `${h.name}: ${done}/${total} (${pct}%), ${streak}-day streak`;
    }).join('\n');
  }
});

export const listUnreadNotificationsTool = createTool({
  id: 'list_unread_notifications',
  description: 'Retrieves a list of unread notifications and alerts for the active user.',
  inputSchema: z.object({}),
  execute: async () => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const records = await pb.collection("scheduled_notifications").getList(1, 50, {
      filter: `user = "${user}" && delivered = false`,
      sort: 'triggerAt',
    });
    return {
      notifications: records.items.map((n: any) => ({
        id: n.id,
        kind: n.kind,
        targetId: n.targetId,
        triggerAt: n.triggerAt,
      }))
    };
  },
  toModelOutput: (output: any) => {
    if (!output.notifications?.length) return 'No unread notifications.';
    return output.notifications.map((n: any) =>
      `[${(n.kind || 'reminder').replace('_remind', '')}] ${n.targetId} — ${n.triggerAt ? new Date(n.triggerAt).toLocaleString() : '?'}`
    ).join('\n');
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
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const triggerAt = new Date(input.dueDate).getTime();
    
    // For custom reminders, we use kind "system" or we can store a fake task.
    // Wait, scheduled_notifications schema only allows ["event_remind", "task_remind", "habit_remind"].
    // Since schema is strict, we'll create a task with reminderOffset = 0, which gives us the same result.
    const record = await pb.collection("tasks").create({
      user,
      text: input.message,
      dueDate: triggerAt,
      dueDateStr: input.dueDate.split('T')[0],
      reminderOffset: 0,
      completed: false,
      category: "System Reminder",
      priority: "medium",
      createdAt: Date.now(),
    });

    await pb.collection("scheduled_notifications").create({
      user,
      kind: "task_remind",
      targetId: record.id,
      triggerAt,
      delivered: false,
      createdAt: Date.now(),
    });

    return { success: true, scheduledFor: input.dueDate };
  }
});
