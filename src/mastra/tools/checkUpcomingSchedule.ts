import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const checkUpcomingScheduleTool = createTool({
  id: 'checkUpcomingSchedule',
  description: 'Queries upcoming calendar events, active tasks, and habit routines within a date range to help plan schedules and avoid conflicts.',
  inputSchema: z.object({
    startTime: z.string().describe("ISO-8601 start time (24-hour format, e.g. '2026-06-12T18:00:00')"),
    endTime: z.string().describe("ISO-8601 end time (24-hour format, e.g. '2026-06-12T21:00:00')"),
    timezone: z.string().describe("The user's IANA timezone ID (e.g. 'Asia/Jakarta', 'UTC') from ## Temporal Context to parse dates and format output times properly."),
  }),
  outputSchema: z.object({
    isScheduleClear: z.boolean().describe("True if there are absolutely no events, active tasks, or habits in the requested range. False otherwise."),
    conflictCount: z.number().describe("The total number of events, active tasks, and habits in the requested range."),
    conflictsList: z.array(z.string()).describe("A list of conflict description strings in the requested range."),
    summary: z.string().describe("A clean human-readable text summary of all events, tasks, and habits in the requested range."),
    events: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      startTime: z.number(),
      startTimeFormatted: z.string().describe("Human-readable start date/time (e.g. 'Friday, June 12, 2026 at 8:00 PM')"),
      endTime: z.number().optional(),
      endTimeFormatted: z.string().optional().describe("Human-readable end date/time"),
      eventType: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      outcome: z.string().optional(),
      statusHook: z.string().optional(),
      recurrence: z.any().optional(),
      cancelled: z.boolean().optional(),
    })),
    tasks: z.array(z.object({
      id: z.string(),
      text: z.string(),
      dueDate: z.number().optional(),
      dueDateFormatted: z.string().optional().describe("Human-readable due date/time"),
      dueDateStr: z.string().optional(),
      reminderOffset: z.number().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
      progress: z.number().optional(),
      statusHook: z.string().optional(),
      completed: z.boolean(),
    })),
    habits: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      frequency: z.string(),
      interval: z.number().optional(),
      daysOfWeek: z.array(z.number()).optional(),
      archived: z.boolean(),
      streak: z.number().optional(),
      lastCompleted: z.number().optional(),
    })),
  }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const { parseDateTime, expandRecurringEventsForWindow } = await import('../../lib/jobs/dateUtils');

    const startMs = parseDateTime(input.startTime, input.timezone).getTime();
    const endMs = parseDateTime(input.endTime, input.timezone).getTime();

    // Query all events for the user to expand recurring ones
    const rawEvents = await pb.collection("events").getFullList({
      filter: `user = "${user}"`,
    });

    const expandedEvents = expandRecurringEventsForWindow(rawEvents, startMs, endMs);

    // Query active tasks in range
    const tasks = await pb.collection("tasks").getFullList({
      filter: `user = "${user}" && dueDate >= ${startMs} && dueDate <= ${endMs}`,
      sort: 'dueDate',
    });

    // Query active habits
    const habits = await pb.collection("habits").getFullList({
      filter: `user = "${user}" && archived = false`,
    });

    const formatOpts: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: input.timezone || 'UTC',
    };

    const mappedEvents = expandedEvents.map((e: any) => ({
      id: e.id,
      title: e.title,
      description: e.description || undefined,
      startTime: e.startTime,
      startTimeFormatted: new Date(e.startTime).toLocaleString('en-US', formatOpts),
      endTime: e.endTime || undefined,
      endTimeFormatted: e.endTime ? new Date(e.endTime).toLocaleString('en-US', formatOpts) : undefined,
      eventType: e.eventType || undefined,
      location: e.location || undefined,
      notes: e.notes || undefined,
      outcome: e.outcome || undefined,
      statusHook: e.statusHook || undefined,
      recurrence: e.recurrence || undefined,
      cancelled: !!e.cancelled,
    }));

    const sortedEvents = [...mappedEvents].sort((a, b) => a.startTime - b.startTime);

    const mappedTasks = tasks.map((t: any) => ({
      id: t.id,
      text: t.text,
      dueDate: t.dueDate || undefined,
      dueDateFormatted: t.dueDate ? new Date(t.dueDate).toLocaleString('en-US', formatOpts) : undefined,
      dueDateStr: t.dueDateStr || undefined,
      reminderOffset: t.reminderOffset || undefined,
      priority: t.priority || undefined,
      category: t.category || undefined,
      notes: t.notes || undefined,
      progress: t.progress || undefined,
      statusHook: t.statusHook || undefined,
      completed: !!t.completed,
    }));

    const mappedHabits = habits.map((h: any) => ({
      id: h.id,
      name: h.name,
      description: h.description || undefined,
      frequency: h.frequency,
      interval: h.interval || undefined,
      daysOfWeek: h.daysOfWeek || undefined,
      archived: !!h.archived,
      streak: h.streak || undefined,
      lastCompleted: h.lastCompleted || undefined,
    }));

    // Generate clean text summary
    const parts: string[] = [];
    if (sortedEvents.length) {
      parts.push('Events:');
      sortedEvents.forEach((e: any) => {
        parts.push(`  - "${e.title}" from ${e.startTimeFormatted} to ${e.endTimeFormatted || '?'}${e.location ? ` @ ${e.location}` : ''}`);
      });
    } else {
      parts.push('Events: None');
    }

    if (mappedTasks.length) {
      parts.push('Tasks:');
      mappedTasks.forEach((t: any) => {
        parts.push(`  - "${t.text}" due ${t.dueDateFormatted || '?'} [Priority: ${t.priority || 'medium'}]${t.completed ? ' (Completed)' : ' (Active)'}`);
      });
    } else {
      parts.push('Tasks: None');
    }

    if (mappedHabits.length) {
      parts.push('Habit Routines:');
      mappedHabits.forEach((h: any) => {
        const days = h.daysOfWeek && h.daysOfWeek.length ? ` on days: ${h.daysOfWeek.join(', ')}` : '';
        parts.push(`  - "${h.name}" (${h.frequency}${days})`);
      });
    } else {
      parts.push('Habit Routines: None');
    }

    const summary = parts.join('\n');

    const activeEvents = sortedEvents.filter((e: any) => !e.cancelled);
    const activeTasks = mappedTasks.filter((t: any) => !t.completed);
    const activeHabits = mappedHabits.filter((h: any) => !h.archived);

    const conflictCount = activeEvents.length + activeTasks.length + activeHabits.length;
    const isScheduleClear = conflictCount === 0;

    const conflictsList: string[] = [];
    activeEvents.forEach((e: any) => {
      conflictsList.push(`Event: "${e.title}" from ${e.startTimeFormatted} to ${e.endTimeFormatted || '?'}`);
    });
    activeTasks.forEach((t: any) => {
      conflictsList.push(`Task: "${t.text}" due ${t.dueDateFormatted || '?'}`);
    });
    activeHabits.forEach((h: any) => {
      const days = h.daysOfWeek && h.daysOfWeek.length ? ` on days: ${h.daysOfWeek.join(', ')}` : '';
      conflictsList.push(`Habit Routine: "${h.name}" (${h.frequency}${days})`);
    });

    return {
      isScheduleClear,
      conflictCount,
      conflictsList,
      summary,
      events: sortedEvents,
      tasks: mappedTasks,
      habits: mappedHabits,
    };
  },
});

