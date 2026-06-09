const fs = require('fs');
const path = require('path');

const pbBlocks = {
  'addTask.ts': {
    find: `    const taskId = await client.mutation(api.tasks.add, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");
      
      const record = await pb.collection("tasks").create({
        user,
        text: input.text,
        dueDate: input.dueDate ? new Date(input.dueDate).getTime() : undefined,
        dueDateStr: input.dueDate ? input.dueDate.split('T')[0] : undefined,
        priority: input.priority,
        category: input.category,
        notes: input.notes,
        progress: input.progress,
        statusHook: input.statusHook,
        completed: false,
        createdAt: Date.now(),
      });
      return { taskId: record.id, text: input.text };
    }\n\n    const taskId = await client.mutation(api.tasks.add, {`
  },

  'completeTask.ts': {
    find: `    await client.mutation(api.tasks.update, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("tasks").update(input.taskId, { completed: true });
      return { success: true, taskId: input.taskId };
    }\n\n    await client.mutation(api.tasks.update, {`
  },

  'deleteTask.ts': {
    find: `    await client.mutation(api.tasks.remove, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("tasks").delete(input.taskId);
      return { success: true, taskId: input.taskId };
    }\n\n    await client.mutation(api.tasks.remove, {`
  },

  'updateTask.ts': {
    find: `    await client.mutation(api.tasks.update, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("tasks").update(input.taskId, {
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
    }\n\n    await client.mutation(api.tasks.update, {`
  },

  'deleteEvent.ts': {
    find: `    await client.mutation(api.events.remove, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("events").delete(input.eventId);
      return { success: true, eventId: input.eventId };
    }\n\n    await client.mutation(api.events.remove, {`
  },

  'addEvent.ts': {
    find: `    const eventId = await client.mutation(api.events.add, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      const record = await pb.collection("events").create({
        user,
        title: input.title,
        description: input.description,
        startTime: startMs,
        endTime: endMs,
        eventType: input.eventType as "interval" | "point",
        location: input.location,
        notes: input.notes,
        outcome: input.outcome,
        statusHook: input.statusHook,
        recurrence: recurrence ?? undefined,
        createdAt: Date.now(),
      });
      return { eventId: record.id as string, title: input.title };
    }\n\n    const eventId = await client.mutation(api.events.add, {`
  },

  'updateEvent.ts': {
    find: `    await client.mutation(api.events.update, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      await pb.collection("events").update(input.eventId, {
        title: input.title,
        startTime: input.startTime ? new Date(input.startTime).getTime() : undefined,
        endTime: input.endTime ? new Date(input.endTime).getTime() : undefined,
        eventType: input.eventType as "interval" | "point",
        location: input.location,
        notes: input.notes,
        outcome: input.outcome,
        statusHook: input.statusHook,
        cancelled: input.cancelled,
        recurrence: recurrence ?? undefined,
      });
      return { success: true, eventId: input.eventId };
    }\n\n    await client.mutation(api.events.update, {`
  },

  'updateEventOccurrence.ts': {
    find: `    const detachedEventId = await client.mutation(api.events.updateOccurrence, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      const parent = await pb.collection("events").getOne(input.seriesId);
      if (!parent || parent.user !== user) throw new Error("Unauthorized");

      const originalStartTimeMs = new Date(input.originalStartTime).getTime();

      if (parent.recurrence) {
        const rec = typeof parent.recurrence === "string" ? JSON.parse(parent.recurrence) : parent.recurrence;
        const exceptions = rec.exceptions ?? [];
        const exceptionsStr = rec.exceptionsStr ?? [];
        const dateStr = new Date(originalStartTimeMs).toLocaleDateString("en-CA", {
          timeZone: "UTC",
        });

        if (!exceptions.includes(originalStartTimeMs)) {
          exceptions.push(originalStartTimeMs);
        }
        if (!exceptionsStr.includes(dateStr)) {
          exceptionsStr.push(dateStr);
        }

        await pb.collection("events").update(input.seriesId, {
          recurrence: {
            ...rec,
            exceptions,
            exceptionsStr,
          },
        });
      }

      const duration = parent.endTime !== undefined ? parent.endTime - parent.startTime : 0;
      const finalStartTime = input.startTime ? new Date(input.startTime).getTime() : originalStartTimeMs;
      const finalEndTime = parent.endTime !== undefined ? (input.endTime ? new Date(input.endTime).getTime() : finalStartTime + duration) : undefined;

      const record = await pb.collection("events").create({
        user,
        title: input.title ?? parent.title,
        description: parent.description,
        location: input.location ?? parent.location,
        notes: parent.notes,
        outcome: parent.outcome,
        statusHook: parent.statusHook,
        cancelled: input.cancelled || false,
        contextUpdatedAt: parent.contextUpdatedAt,
        startTime: finalStartTime,
        endTime: finalEndTime,
        eventType: input.eventType ?? parent.eventType,
        series: input.seriesId,
        workspace: parent.workspace,
        createdAt: Date.now(),
        reminderOffset: parent.reminderOffset,
      });

      return { success: true, detachedEventId: record.id };
    }\n\n    const detachedEventId = await client.mutation(api.events.updateOccurrence, {`
  },

  'saveSemanticMemory.ts': {
    find: `    // 4. Save to Convex so it appears in the UI Memories table
    const convexServerClient = (await import('../../lib/convex-server')).convexServerClient;
    const { api } = await import('../../../convex/_generated/api');
    
    await convexServerClient.mutation(api.ai.saveMemoryBackendSync, {
      text: input.text,
      embedding: truncatedEmbedding,
      // create a hash for deduplication logic inside Convex
      hash: crypto.createHash('sha256').update(input.text).digest('hex')
    });`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (user) {
        const hash = crypto.createHash('sha256').update(input.text).digest('hex');
        const existing = await pb.collection("memories").getList(1, 1, {
          filter: pb.filter("hash = {:hash}", { hash }),
        });
        if (existing.items.length === 0) {
          await pb.collection("memories").create({
            user,
            text: input.text,
            embedding: truncatedEmbedding,
            hash,
            createdAt: Date.now(),
          });
        }
      }
    } else {
      const convexServerClient = (await import('../../lib/convex-server')).convexServerClient;
      const { api } = await import('../../../convex/_generated/api');
      
      await convexServerClient.mutation(api.ai.saveMemoryBackendSync, {
        text: input.text,
        embedding: truncatedEmbedding,
        hash: crypto.createHash('sha256').update(input.text).digest('hex')
      });
    }`
  }
};

const otherToolsBlocks = [
  // 1: searchHistoricalEntitiesTool
  {
    find: `    const client = getConvexClient();\n    if (input.type === 'tasks' || input.type === 'all') {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");
      
      if (input.type === 'tasks' || input.type === 'all') {
        let filterStr = "user = {:user} && completed = true";
        const params = { user, query: "" };
        if (input.query) {
          filterStr += " && (text ~ {:query} || notes ~ {:query})";
          params.query = input.query;
        }
        const tasks = await pb.collection("tasks").getList(1, input.limit || 50, {
          filter: pb.filter(filterStr, params),
          sort: "-createdAt"
        });
        return { tasks: tasks.items };
      }
      if (input.type === 'events' || input.type === 'all') {
        let filterStr = "user = {:user} && startTime < {:now}";
        const params = { user, now: Date.now(), query: "" };
        if (input.query) {
          filterStr += " && (title ~ {:query} || description ~ {:query} || notes ~ {:query})";
          params.query = input.query;
        }
        const events = await pb.collection("events").getList(1, input.limit || 50, {
          filter: pb.filter(filterStr, params),
          sort: "-startTime"
        });
        return { events: events.items };
      }
      return { results: [] };
    }\n\n    const client = getConvexClient();\n    if (input.type === 'tasks' || input.type === 'all') {`
  },
  // 2: batchAddTasksTool
  {
    find: `    const client = getConvexClient();\n    const taskIds = await client.mutation(api.tasks.batchAdd, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");
      const taskIds = await Promise.all(input.tasks.map(async (t) => {
        const record = await pb.collection("tasks").create({
          user,
          text: t.text,
          priority: t.priority,
          category: t.category,
          dueDate: t.dueDate ? new Date(t.dueDate).getTime() : undefined,
          dueDateStr: t.dueDate ? t.dueDate.split('T')[0] : undefined,
          notes: t.notes,
          completed: false,
          createdAt: Date.now(),
        });
        return record.id;
      }));
      return { taskIds, count: taskIds.length };
    }\n\n    const client = getConvexClient();\n    const taskIds = await client.mutation(api.tasks.batchAdd, {`
  },
  // 3: getTaskNotesTool
  {
    find: `    const client = getConvexClient();\n    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const task = await pb.collection("tasks").getOne(input.taskId);
      return { notes: task?.notes || 'No notes found.', task };
    }\n\n    const client = getConvexClient();\n    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });`
  },
  // 4: getTaskResourcesTool
  {
    find: `    const client = getConvexClient();\n    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });\n    return { resources: task?.resources || [] };`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const task = await pb.collection("tasks").getOne(input.taskId);
      return { resources: task?.resources || [] };
    }\n\n    const client = getConvexClient();\n    const task = await client.query(api.tasks.get, { id: input.taskId as Id<"tasks"> });\n    return { resources: task?.resources || [] };`
  },
  // 5: getEventResourcesTool
  {
    find: `    const client = getConvexClient();\n    const event = await client.query(api.events.get, { id: input.eventId as Id<"events"> });\n    return { resources: event?.resources || [] };`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const event = await pb.collection("events").getOne(input.eventId);
      return { resources: event?.resources || [] };
    }\n\n    const client = getConvexClient();\n    const event = await client.query(api.events.get, { id: input.eventId as Id<"events"> });\n    return { resources: event?.resources || [] };`
  },
  // 6: listWorkspacesTool
  {
    find: `    const client = getConvexClient();\n    const workspaces = await client.query(api.workspaces.list, {});`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      const workspaces = await pb.collection("workspaces").getList(1, 200, {
        filter: pb.filter("user = {:user}", { user }),
      });
      return { workspaces: workspaces.items };
    }\n\n    const client = getConvexClient();\n    const workspaces = await client.query(api.workspaces.list, {});`
  },
  // 7: createHabitTool
  {
    find: `    const client = getConvexClient();\n    const habitId = await client.mutation(api.habits.createHabit, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");
      const record = await pb.collection("habits").create({
        user,
        name: input.name,
        description: input.description,
        frequency: input.frequency as "daily" | "custom",
        frequencyConfig: { daysOfWeek: input.daysOfWeek },
        createdAt: Date.now(),
      });
      return { habitId: record.id, name: input.name };
    }\n\n    const client = getConvexClient();\n    const habitId = await client.mutation(api.habits.createHabit, {`
  },
  // 8: logHabitTool
  {
    find: `    const client = getConvexClient();\n    const logId = await client.mutation(api.habits.logHabit, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
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
        timestamp: Date.now(),
      });
      return { success: true, logId: record.id };
    }\n\n    const client = getConvexClient();\n    const logId = await client.mutation(api.habits.logHabit, {`
  },
  // 9: getHabitConsistencyTool
  {
    find: `    const client = getConvexClient();\n    const result = await client.query(api.habits.getHabitConsistency, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      const habits = await pb.collection("habits").getList(1, 500, {
        filter: pb.filter("user = {:user} && archived != true", { user })
      });
      const habitLogs = await pb.collection("habit_logs").getList(1, 500, {
        filter: pb.filter("user = {:user} && dateString >= {:start} && dateString <= {:end}", {
          user, start: input.periodStartDate, end: input.periodEndDate
        })
      });

      const results = habits.items.map((habit) => {
        const logs = habitLogs.items.filter((l) => l.habit === habit.id);
        return {
          habitId: habit.id,
          name: habit.name,
          currentStreak: habit.currentStreak,
          longestStreak: habit.longestStreak,
          completedCount: logs.filter((l) => l.status === "completed").length,
          skippedCount: logs.filter((l) => l.status === "skipped").length,
        };
      });
      return results;
    }\n\n    const client = getConvexClient();\n    const result = await client.query(api.habits.getHabitConsistency, {`
  },
  // 10: listUnreadNotificationsTool
  {
    find: `    const client = getConvexClient();\n    const notifications = await client.query(api.notifications.listUnread, {});`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      const notifications = await pb.collection("notifications").getList(1, 500, {
        filter: pb.filter("user = {:user} && read = false", { user }),
        sort: "-createdAt"
      });
      return { notifications: notifications.items };
    }\n\n    const client = getConvexClient();\n    const notifications = await client.query(api.notifications.listUnread, {});`
  },
  // 11: createCustomReminderTool
  {
    find: `    const client = getConvexClient();\n    await client.mutation(api.notifications.createCustomReminder, {`,
    replace: `    const { isPbBackend } = await import('../../pb-compat');
    if (isPbBackend()) {
      const { getPbClient } = await import('../../lib/pb-server');
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");
      
      const dueMs = new Date(input.dueDate).getTime();
      if (isNaN(dueMs) || dueMs <= Date.now()) {
        throw new Error("Invalid or past due date");
      }

      await pb.collection("notifications").create({
        user,
        title: "Custom Reminder",
        message: input.message,
        type: "system",
        read: false,
        createdAt: Date.now(),
      });
      
      return { success: true, scheduledFor: input.dueDate, warning: "Push notification delay not natively supported in PB yet" };
    }\n\n    const client = getConvexClient();\n    await client.mutation(api.notifications.createCustomReminder, {`
  }
];

const toolsDir = path.join(__dirname, 'src', 'mastra', 'tools');

Object.keys(pbBlocks).forEach(file => {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(pbBlocks[file].find, pbBlocks[file].replace);

  if (file === 'saveSemanticMemory.ts') {
     content = content.replace(/status: "Memory securely sent to Graph Engine queue and Convex\."/g, 'status: "Memory securely sent to Graph Engine queue and UI backend."');
  }

  fs.writeFileSync(filePath, content);
});

// Now apply otherTools.ts
const otherToolsPath = path.join(toolsDir, 'otherTools.ts');
let otherToolsContent = fs.readFileSync(otherToolsPath, 'utf8');
otherToolsBlocks.forEach(block => {
  otherToolsContent = otherToolsContent.replace(block.find, block.replace);
});
fs.writeFileSync(otherToolsPath, otherToolsContent);

// Fix route.ts
const routePath = path.join(__dirname, 'src', 'app', 'api', 'chat', 'route.ts');
let routeContent = fs.readFileSync(routePath, 'utf8');
if (!routeContent.includes("import { isPbBackend } from '@/pb-compat';")) {
  routeContent = routeContent.replace(/import \{ isPbBackend \} from '@\/pb-compat\/env';/g, "import { isPbBackend } from '@/pb-compat';");
  fs.writeFileSync(routePath, routeContent);
}

console.log('Done porting tools');
