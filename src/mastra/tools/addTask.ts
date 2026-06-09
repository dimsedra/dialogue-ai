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
    reminderOffset: z.number().optional().describe("Minutes before due date to remind the user (e.g. 15). Only valid if dueDate is provided."),
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
    const { isPbBackend } = await import('../../pb-compat/env');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");
      
      const dueDateMs = input.dueDate ? new Date(input.dueDate).getTime() : undefined;
      const record = await pb.collection("tasks").create({
        user,
        text: input.text,
        dueDate: dueDateMs,
        dueDateStr: input.dueDate ? input.dueDate.split('T')[0] : undefined,
        reminderOffset: input.reminderOffset,
        priority: input.priority,
        category: input.category,
        notes: input.notes,
        progress: input.progress,
        statusHook: input.statusHook,
        completed: false,
        createdAt: Date.now(),
      });

      if (dueDateMs && input.reminderOffset !== undefined && input.reminderOffset >= 0) {
        const triggerAt = Math.max(Date.now(), dueDateMs - input.reminderOffset * 60 * 1000);
        await pb.collection("scheduled_notifications").create({
          user,
          kind: "task_remind",
          targetId: record.id,
          triggerAt,
          delivered: false,
          createdAt: Date.now(),
        });
      }

      // Ingest task notes semantically
      if (input.notes) {
        const { ingestTaskNotes } = await import('../../lib/graph/ingest');
        await ingestTaskNotes(pb, record.id, input.notes);
      }

      return { taskId: record.id, text: input.text };
    }

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
