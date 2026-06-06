import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const updateTaskTool = createTool({
  id: 'updateTask',
  description: 'Updates an existing task. If updating context/notes, maintain chronological journal format.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to update"),
    text: z.string().optional().describe("Updated text"),
    completed: z.boolean().optional().describe("Whether the task is finished"),
    dueDate: z.string().optional().describe("Updated ISO-8601 due date (24-hour, e.g. '2026-05-15T14:00:00')"),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    category: z.string().optional(),
    notes: z.string().optional().describe("Chronological journal. NEVER overwrite, always APPEND with timestamp."),
    progress: z.number().optional().describe("Estimated progress 0-100"),
    statusHook: z.string().optional().describe("A single punchy sentence summarizing current state")
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const client = getConvexClient();
    await client.mutation(api.tasks.updateTask, {
      id: input.taskId as Id<"tasks">,
      text: input.text,
      completed: input.completed,
      dueDate: input.dueDate ? new Date(input.dueDate).getTime() : undefined,
      dueDateStr: input.dueDate ? input.dueDate.split('T')[0] : undefined,
      priority: input.priority,
      category: input.category,
      notes: input.notes,
      progress: input.progress,
      statusHook: input.statusHook,
    });
    return { success: true, taskId: input.taskId };
  }
});
