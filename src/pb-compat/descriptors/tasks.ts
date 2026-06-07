import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbTasks } from "../_generated/dataModel";

export type TasksListArgs = {
  workspaceId?: string;
  userId?: string;
} | undefined;

export type TasksGetArgs = {
  id: string;
  userId?: string;
} | undefined;

export type TasksSearchHistoryArgs = {
  query?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  userId?: string;
} | undefined;

export function buildTasksListFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escapedUser}"`;
  
  if (args?.workspaceId) {
    const wsId = args.workspaceId;
    if (typeof wsId === "string" && wsId.length > 0) {
      const escapedWs = wsId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      filter += ` && workspace = "${escapedWs}"`;
    }
  }
  return filter;
}

export function buildTasksGetFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const id = args?.id;
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof id !== "string" || id.length === 0 || typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escapedId = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `id = "${escapedId}" && user = "${escapedUser}"`;
}

export function buildTasksSearchHistoryFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escapedUser}" && completed = true`;

  if (args?.startTime !== undefined) {
    const start = args.startTime;
    filter += ` && (completedAt >= ${start} || (completedAt = null && createdAt >= ${start}))`;
  }
  if (args?.endTime !== undefined) {
    const end = args.endTime;
    filter += ` && (completedAt <= ${end} || (completedAt = null && createdAt <= ${end}))`;
  }
  if (args?.query) {
    const q = args.query;
    if (typeof q === "string" && q.length > 0) {
      const escapedQ = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      filter += ` && text ~ "${escapedQ}"`;
    }
  }
  return filter;
}

async function listTasksImpl(
  args: TasksListArgs,
): Promise<PbTasks[]> {
  const pb = getPbClient();
  const filter = buildTasksListFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("tasks").getList(1, 200, {
    filter,
    sort: "+createdAt",
  });
  return list.items as unknown as PbTasks[];
}

async function getTaskImpl(
  args: TasksGetArgs,
): Promise<PbTasks | null> {
  const pb = getPbClient();
  const filter = buildTasksGetFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return null;
  const list = await pb.collection("tasks").getList(1, 1, {
    filter,
  });
  return (list.items[0] as unknown as PbTasks) ?? null;
}

async function searchHistoryTasksImpl(
  args: TasksSearchHistoryArgs,
): Promise<PbTasks[]> {
  const pb = getPbClient();
  const filter = buildTasksSearchHistoryFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const limit = args?.limit ?? 100;
  const list = await pb.collection("tasks").getList(1, limit, {
    filter,
    sort: "-completedAt,-createdAt",
  });
  return list.items as unknown as PbTasks[];
}

export const tasksListQuery = defineQuery<
  TasksListArgs,
  PbTasks[]
>(
  {
    collection: "tasks",
    kind: "list",
    buildFilter: buildTasksListFilter,
  },
  listTasksImpl,
);

export const tasksGetQuery = defineQuery<
  TasksGetArgs,
  PbTasks | null
>(
  {
    collection: "tasks",
    kind: "first",
    buildFilter: buildTasksGetFilter,
  },
  getTaskImpl,
);

export const tasksSearchHistoryQuery = defineQuery<
  TasksSearchHistoryArgs,
  PbTasks[]
>(
  {
    collection: "tasks",
    kind: "list",
    buildFilter: buildTasksSearchHistoryFilter,
  },
  searchHistoryTasksImpl,
);
