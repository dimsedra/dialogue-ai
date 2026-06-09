import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getConvexClient } from '../../lib/convex-server';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

export const appendTaskNotesTool = createTool({
  id: 'appendTaskNotes',
  description: 'Appends a new chronological journal entry/notes to an existing task. Use this to proactively document updates, progress, blockers, or resolutions.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to append notes to"),
    notes: z.string().describe("The new progress update, blocker details, or general context to append"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const { isPbBackend } = await import('../../pb-compat/env');
    
    // Format timestamp
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newEntry = `[${timestamp}]\n- ${input.notes.trim()}`;

    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const { ingestTaskNotes } = await import('../../lib/graph/ingest');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      // 1. Fetch current task
      const task = await pb.collection("tasks").getOne(input.taskId);
      const currentNotes = task.notes ? task.notes.trim() : "";
      const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

      // 2. Update task
      await pb.collection("tasks").update(input.taskId, { notes: updatedNotes });

      // 3. Ingest notes semantically into the graph
      await ingestTaskNotes(pb, input.taskId, updatedNotes);

      return { success: true, taskId: input.taskId };
    }

    // Convex fallback
    const client = getConvexClient();
    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });
    const currentNotes = task?.notes ? task.notes.trim() : "";
    const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

    await client.mutation(api.tasks.updateTask, {
      id: input.taskId as Id<"tasks">,
      notes: updatedNotes,
    });

    return { success: true, taskId: input.taskId };
  }
});
