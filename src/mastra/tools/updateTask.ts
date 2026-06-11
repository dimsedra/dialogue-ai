import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const updateTaskTool = createTool({
  id: 'updateTask',
  description: 'Updates an existing task. If updating context/notes, maintain chronological journal format.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to update"),
    text: z.string().optional().describe("Updated text"),
    completed: z.boolean().optional().describe("Whether the task is finished"),
    dueDate: z.string().optional().describe("Updated ISO-8601 due date (24-hour, e.g. '2026-05-15T14:00:00')"),
    timezone: z.string().optional().describe("The user's IANA timezone ID (e.g. 'Asia/Jakarta', 'UTC') to parse timestamps properly."),
    reminderOffset: z.number().optional().describe("Minutes before due date to remind the user. Pass -1 to remove existing reminder."),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    category: z.string().optional(),
    notes: z.string().optional().describe("Chronological journal. NEVER overwrite, always APPEND with timestamp."),
    progress: z.number().optional().describe("Estimated progress 0-100"),
    statusHook: z.string().optional().describe("A single punchy sentence summarizing current state")
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const { parseDateTime } = await import('../../lib/jobs/dateUtils');
    const updates: Record<string, any> = {};
    if (input.text !== undefined) updates.text = input.text;
    if (input.completed !== undefined) {
      updates.completed = input.completed;
      updates.completedAt = input.completed ? Date.now() : null;
    }
    if (input.dueDate !== undefined) {
      const parsedDate = parseDateTime(input.dueDate, input.timezone);
      updates.dueDate = parsedDate.getTime();
      updates.dueDateStr = input.dueDate.split('T')[0];
    }
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.category !== undefined) updates.category = input.category;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.progress !== undefined) updates.progress = input.progress;
    if (input.statusHook !== undefined) updates.statusHook = input.statusHook;
    if (input.reminderOffset !== undefined) updates.reminderOffset = input.reminderOffset < 0 ? null : input.reminderOffset;

    const record = await pb.collection("tasks").update(input.taskId, updates);

    try {
      const existingReminders = await pb.collection("scheduled_notifications").getFullList({
        filter: `targetId = "${record.id}" && kind = "task_remind" && delivered = false`
      });
      for (const er of existingReminders) {
        await pb.collection("scheduled_notifications").delete(er.id);
      }

      if (!record.completed && record.dueDate && record.reminderOffset !== null && record.reminderOffset >= 0) {
        const triggerAt = Math.max(Date.now(), record.dueDate - record.reminderOffset * 60 * 1000);
        await pb.collection("scheduled_notifications").create({
          user,
          kind: "task_remind",
          targetId: record.id,
          triggerAt,
          delivered: false,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      console.error("Failed to reschedule task reminder in PB:", err);
    }

    if (input.notes !== undefined) {
      const { ingestTaskNotes } = await import('../../lib/graph/ingest');
      await ingestTaskNotes(pb, input.taskId, record.notes);
    }

    return { success: true, taskId: input.taskId };
  }
});
