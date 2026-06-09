import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbTasks } from "../_generated/dataModel";

export function usePbTaskCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbTasks>({ collection: "tasks", kind: "create" });
  return async (args: {
    text: string;
    workspaceId?: string;
    dueDate?: number;
    dueDateStr?: string;
    priority?: "low" | "medium" | "high";
    category?: string;
    notes?: string;
    progress?: number;
    statusHook?: string;
    reminderOffset?: number;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      user: user.id as any,
      text: args.text || "Untitled Task",
      workspace: (args.workspaceId || undefined) as any,
      completed: false,
      dueDate: args.dueDate || undefined,
      dueDateStr: args.dueDateStr || undefined,
      priority: args.priority || undefined,
      category: args.category || undefined,
      notes: args.notes || undefined,
      progress: args.progress || undefined,
      statusHook: args.statusHook || undefined,
      reminderOffset: args.reminderOffset || undefined,
      createdAt: Date.now(),
    } as any);

    if (args.notes) {
      const pb = getPbClient();
      const token = pb.authStore.token || null;
      import("../use-action").then(({ executePbAction }) => {
        executePbAction({ name: "ingestNotes" }, { targetId: record.id, targetType: "Task" }, { token }).catch(err => {
          console.error("Failed to trigger task notes ingestion:", err);
        });
      });
    }

    return record.id;
  };
}

export function usePbTaskUpdate() {
  const { user } = useAuth();
  const mutate = useMutation<PbTasks>({ collection: "tasks", kind: "update" });
  return async (args: {
    taskId: string;
    text?: string;
    workspaceId?: string | null;
    dueDate?: number | null;
    dueDateStr?: string | null;
    priority?: "low" | "medium" | "high" | null;
    category?: string | null;
    notes?: string | null;
    progress?: number | null;
    statusHook?: string | null;
    reminderOffset?: number | null;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const patch: Record<string, any> = {};
    if (args.text !== undefined) patch.text = args.text || "Untitled Task";
    if (args.workspaceId !== undefined) patch.workspace = args.workspaceId === null ? "" : args.workspaceId;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate === null ? undefined : args.dueDate;
    if (args.dueDateStr !== undefined) patch.dueDateStr = args.dueDateStr === null ? "" : args.dueDateStr;
    if (args.priority !== undefined) patch.priority = args.priority === null ? undefined : args.priority;
    if (args.category !== undefined) patch.category = args.category === null ? "" : args.category;
    if (args.notes !== undefined) patch.notes = args.notes === null ? "" : args.notes;
    if (args.progress !== undefined) patch.progress = args.progress === null ? undefined : args.progress;
    if (args.statusHook !== undefined) patch.statusHook = args.statusHook === null ? "" : args.statusHook;
    if (args.reminderOffset !== undefined) patch.reminderOffset = args.reminderOffset === null ? undefined : args.reminderOffset;

    const record = await mutate({ id: args.taskId, record: patch });

    if (args.notes !== undefined) {
      const pb = getPbClient();
      const token = pb.authStore.token || null;
      import("../use-action").then(({ executePbAction }) => {
        executePbAction({ name: "ingestNotes" }, { targetId: record.id, targetType: "Task" }, { token }).catch(err => {
          console.error("Failed to trigger task notes update ingestion:", err);
        });
      });
    }

    return record;
  };
}

export function usePbTaskToggleCompleted() {
  const { user } = useAuth();
  const mutate = useMutation<PbTasks>({ collection: "tasks", kind: "update" });
  return async (args: { id: string; completed: boolean }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      id: args.id,
      record: {
        completed: args.completed,
        completedAt: args.completed ? Date.now() : undefined,
      },
    });
    return record;
  };
}

export function usePbTaskDelete() {
  const { user } = useAuth();
  const mutate = useMutation({ collection: "tasks", kind: "delete" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    await mutate({ id: args.id });

    const pb = getPbClient();
    const token = pb.authStore.token || null;
    import("../use-action").then(({ executePbAction }) => {
      executePbAction({ name: "ingestNotes" }, { targetId: args.id, targetType: "Task" }, { token }).catch(err => {
        console.error("Failed to trigger task notes delete ingestion:", err);
      });
    });
  };
}

export function usePbTasksRollOver() {
  const { user } = useAuth();
  const mutate = useMutation<PbTasks>({ collection: "tasks", kind: "update" });
  return async (args: { timezone?: string; timezoneOffset?: number }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const now = Date.now();
    const offset = args.timezoneOffset ?? 0;

    // Calculate today's date string and start timestamp
    const localNow = new Date(now - offset * 60000);
    const todayStr = localNow.toISOString().slice(0, 10);
    const todayStartMs = Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
      0, 0, 0, 0,
    ) + offset * 60000;

    // Find overdue tasks
    const list = await pb.collection("tasks").getList(1, 500, {
      filter: `user = "${user.id}" && completed = false && dueDate < ${now}`,
    });

    let count = 0;
    await Promise.all(
      list.items.map(async (item) => {
        await mutate({
          id: item.id,
          record: {
            dueDate: todayStartMs,
            dueDateStr: todayStr,
          },
        });
        count++;
      })
    );
    return count;
  };
}
