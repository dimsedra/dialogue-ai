import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const addTaskTool = createTool({
  id: 'addTask',
  description: 'Creates a new task. Extract as many fields as possible from the user\'s natural language (description, due date, priority, category, notes). Only ask the user if information is missing or ambiguous.',
  inputSchema: z.object({
    text: z.string().describe("The task description"),
    dueDate: z.string().optional().describe("ISO-8601 due date/time (24-hour format, e.g. '2026-05-15T14:00:00')"),
    timezone: z.string().describe("The user's IANA timezone ID (e.g. 'Asia/Jakarta', 'UTC') from ## Temporal Context to parse timestamps properly."),
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
    const { getPbClient } = await import('../../lib/pb-server');
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { serializeMarkdownFile } = await import('../../lib/folio/parser');
    const { parseDateTime } = await import('../../lib/jobs/dateUtils');
    const { existsSync, mkdirSync, writeFileSync } = await import('fs');
    const { join } = await import('path');

    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");
    
    const { folioRootPath, basePath, activeSessionId } = getFolioContext();

    // Generate a new stable 15-character alphanumeric ID
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const taskId = Array.from({ length: 15 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

    const dueDateMs = input.dueDate ? parseDateTime(input.dueDate, input.timezone).getTime() : undefined;
    const dueDateStr = input.dueDate ? new Date(parseDateTime(input.dueDate, input.timezone)).toISOString() : undefined;

    const metadata: Record<string, any> = {
      id: taskId,
      title: input.text,
      status: 'todo',
      completed: false,
      priority: input.priority || 'medium',
      category: input.category || '',
      dueDate: dueDateStr || null,
      progress: input.progress || 0,
      statusHook: input.statusHook || '',
      reminderOffset: input.reminderOffset !== undefined ? input.reminderOffset : null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    if (activeSessionId) {
      try {
        const session = await pb.collection("chat_sessions").getOne(activeSessionId);
        if (session && session.sessionType === 'branch') {
          metadata.origin_branch = activeSessionId;
        }
      } catch {}
    }

    const notes = input.notes || '';
    const fileContent = serializeMarkdownFile(metadata, notes);

    const tasksDir = join(basePath, 'tasks');
    if (!existsSync(tasksDir)) {
      mkdirSync(tasksDir, { recursive: true });
    }

    const slug = input.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "task";
    const filePath = join(tasksDir, `${slug}-${taskId}.md`);
    writeFileSync(filePath, fileContent, 'utf8');

    // Sync to DB cache (which handles RAG embedding)
    await syncFolioFileToDb(filePath, pb, folioRootPath);

    // Schedule notification in DB if due date and reminder offset are set
    if (dueDateMs && input.reminderOffset !== undefined && input.reminderOffset >= 0) {
      const triggerAt = Math.max(Date.now(), dueDateMs - input.reminderOffset * 60 * 1000);
      await pb.collection("scheduled_notifications").create({
        user,
        kind: "task_remind",
        targetId: taskId,
        triggerAt,
        delivered: false,
        createdAt: Date.now(),
      });
    }

    return { taskId, text: input.text };
  }
});
