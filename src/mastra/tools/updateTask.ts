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
    console.log('[updateTask Tool] Executing with input:', input);
    const { getPbClient } = await import('../../lib/pb-server');
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { parseMarkdownFile, serializeMarkdownFile } = await import('../../lib/folio/parser');
    const { parseDateTime } = await import('../../lib/jobs/dateUtils');
    const { existsSync, readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');

    try {
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      const { folioRootPath, basePath } = getFolioContext();

      // Normalize taskId by stripping any redundant "task-" prefix
      let cleanTaskId = input.taskId;
      if (cleanTaskId.startsWith('task-')) {
        cleanTaskId = cleanTaskId.slice(5);
      }

      const filePath = join(basePath, 'tasks', `task-${cleanTaskId}.md`);
      console.log('[updateTask Tool] Resolved filePath:', filePath);

      if (!existsSync(filePath)) {
        console.error('[updateTask Tool] Task file not found:', filePath);
        throw new Error(`Task file not found: tasks/task-${cleanTaskId}.md`);
      }

      const fileContent = readFileSync(filePath, 'utf8');
      const { metadata, body } = parseMarkdownFile(fileContent);
      console.log('[updateTask Tool] Current metadata:', metadata);

      // Merge updates into metadata
      if (input.text !== undefined) metadata.title = input.text;
      
      if (input.completed !== undefined) {
        metadata.completed = input.completed;
        metadata.status = input.completed ? 'completed' : 'todo';
        metadata.completedAt = input.completed ? new Date().toISOString() : null;
        if (input.completed) {
          metadata.progress = 100;
        }
      }
      
      if (input.dueDate !== undefined) {
        if (input.dueDate) {
          const parsedDate = parseDateTime(input.dueDate, input.timezone || 'UTC');
          metadata.dueDate = parsedDate.toISOString();
        } else {
          metadata.dueDate = null;
        }
      }
      
      if (input.priority !== undefined) metadata.priority = input.priority;
      if (input.category !== undefined) metadata.category = input.category;
      if (input.progress !== undefined) metadata.progress = input.progress;
      if (input.statusHook !== undefined) metadata.statusHook = input.statusHook;
      
      if (input.reminderOffset !== undefined) {
        metadata.reminderOffset = input.reminderOffset < 0 ? null : input.reminderOffset;
      }

      const newBody = input.notes !== undefined ? input.notes : body;
      
      // Serialize and save back to disk
      const updatedContent = serializeMarkdownFile(metadata, newBody);
      writeFileSync(filePath, updatedContent, 'utf8');
      console.log('[updateTask Tool] Updated file content on disk.');

      // Sync to DB cache (which updates index and schedules notifications)
      await syncFolioFileToDb(filePath, pb, folioRootPath);
      console.log('[updateTask Tool] Synced with DB successfully.');

      // Reschedule notifications in PB
      try {
        const existingReminders = await pb.collection("scheduled_notifications").getFullList({
          filter: `targetId = "${cleanTaskId}" && kind = "task_remind" && delivered = false`
        });
        for (const er of existingReminders) {
          await pb.collection("scheduled_notifications").delete(er.id);
        }
        console.log('[updateTask Tool] Cleaned up existing notifications.');

        // Fetch the newly synced record from DB to get resolved due dates
        const record = await pb.collection("tasks").getOne(cleanTaskId);

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
          console.log('[updateTask Tool] Rescheduled task reminder.');
        }
      } catch (err) {
        console.error("Failed to reschedule task reminder in PB:", err);
      }

      return { success: true, taskId: cleanTaskId };
    } catch (err) {
      console.error('[updateTask Tool] Error during execution:', err);
      throw err;
    }
  }
});
