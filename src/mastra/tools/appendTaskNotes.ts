import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const appendTaskNotesTool = createTool({
  id: 'appendTaskNotes',
  description: 'Appends a new chronological journal entry/notes to an existing task. Use this to proactively document updates, progress, blockers, or resolutions.',
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to append notes to"),
    notes: z.string().describe("The new progress update, blocker details, or general context to append"),
  }),
  outputSchema: z.object({ success: z.boolean(), taskId: z.string() }),
  execute: async (input) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newEntry = `[${timestamp}]\n- ${input.notes.trim()}`;

    const { getPbClient } = await import('../../lib/pb-server');
    const { ingestTaskNotes } = await import('../../lib/graph/ingest');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const task = await pb.collection("tasks").getOne(input.taskId);
    const currentNotes = task.notes ? task.notes.trim() : "";
    const updatedNotes = currentNotes ? `${currentNotes}\n\n${newEntry}` : newEntry;

    await pb.collection("tasks").update(input.taskId, { notes: updatedNotes });
    await ingestTaskNotes(pb, input.taskId, updatedNotes);

    return { success: true, taskId: input.taskId };
  }
});
