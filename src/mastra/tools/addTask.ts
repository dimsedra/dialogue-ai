import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';

export const addTaskTool = createTool({
  id: 'addTask',
  description: 'Creates a new task. Ask ONE field per turn (priority, category, due date, notes). Call this tool immediately after the last field is answered. No final confirmation needed.',
  inputSchema: z.object({
    text: z.string().describe("The task description"),
    dueDate: z.string().optional().describe("ISO-8601 due date/time (24-hour format, e.g. '2026-05-15T14:00:00')"),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
    progress: z.number().optional().describe("Initial progress (0-100)"),
    statusHook: z.string().optional().describe("A single punchy sentence summarizing current state")
  }),
  outputSchema: z.object({
    taskId: z.string(),
    text: z.string(),
  }),
  execute: async (input) => {
    const client = getConvexClient();
    const taskId = await client.mutation(api.tasks.add, {
      text: input.text,
      dueDate: input.dueDate ? new Date(input.dueDate).getTime() : undefined,
      dueDateStr: input.dueDate ? input.dueDate.split('T')[0] : undefined,
      priority: input.priority,
      category: input.category,
      notes: input.notes,
      progress: input.progress,
      statusHook: input.statusHook,
    });
    return { taskId: taskId as string, text: input.text };
  }
});
