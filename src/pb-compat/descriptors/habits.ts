import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbHabits, PbHabitLogs } from "../_generated/dataModel";

export type HabitsListRawArgs = {
  workspaceId?: string;
  userId?: string;
} | undefined;

export type HabitLogsListRecentArgs = {
  userId?: string;
  limit?: number;
} | undefined;

export type HabitsGetArgs = {
  id: string;
  userId?: string;
} | undefined;

export type HabitsGetHabitConsistencyArgs = {
  workspaceId?: string;
  periodStartDate: string;
  periodEndDate: string;
  userId?: string;
} | undefined;

export function buildHabitsListRawFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escapedUser}" && archived = false`;
  
  if (args?.workspaceId) {
    const wsId = args.workspaceId;
    if (typeof wsId === "string" && wsId.length > 0) {
      const escapedWs = wsId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      filter += ` && workspace = "${escapedWs}"`;
    }
  }
  return filter;
}

export function buildHabitsGetFilter(
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

export function buildHabitLogsListRecentFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `user = "${escapedUser}"`;
}

export function buildHabitsGetHabitConsistencyFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  const start = args?.periodStartDate;
  const end = args?.periodEndDate;
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    typeof start !== "string" ||
    start.length === 0 ||
    typeof end !== "string" ||
    end.length === 0
  ) {
    return "1 = 2";
  }
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedStart = start.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedEnd = end.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `user = "${escapedUser}" && dateString >= "${escapedStart}" && dateString <= "${escapedEnd}"`;
}

async function listHabitsRawImpl(
  args: HabitsListRawArgs,
): Promise<PbHabits[]> {
  const pb = getPbClient();
  const filter = buildHabitsListRawFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("habits").getList(1, 200, {
    filter,
    sort: "+createdAt",
  });
  return list.items as unknown as PbHabits[];
}

async function getHabitImpl(
  args: HabitsGetArgs,
): Promise<PbHabits | null> {
  const pb = getPbClient();
  const filter = buildHabitsGetFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return null;
  const list = await pb.collection("habits").getList(1, 1, {
    filter,
  });
  return (list.items[0] as unknown as PbHabits) ?? null;
}

async function listRecentHabitLogsImpl(
  args: HabitLogsListRecentArgs,
): Promise<PbHabitLogs[]> {
  const pb = getPbClient();
  const filter = buildHabitLogsListRecentFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const limit = args?.limit ?? 500;
  const list = await pb.collection("habit_logs").getList(1, limit, {
    filter,
    sort: "-dateString,-timestamp",
  });
  return list.items as unknown as PbHabitLogs[];
}

async function getHabitConsistencyImpl(
  args: HabitsGetHabitConsistencyArgs,
): Promise<PbHabitLogs[]> {
  const pb = getPbClient();
  const filter = buildHabitsGetHabitConsistencyFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("habit_logs").getList(1, 500, {
    filter,
    sort: "-dateString",
  });
  return list.items as unknown as PbHabitLogs[];
}

export const habitsListRawQuery = defineQuery<
  HabitsListRawArgs,
  PbHabits[]
>(
  {
    collection: "habits",
    kind: "list",
    buildFilter: buildHabitsListRawFilter,
  },
  listHabitsRawImpl,
);

export const habitsGetQuery = defineQuery<
  HabitsGetArgs,
  PbHabits | null
>(
  {
    collection: "habits",
    kind: "first",
    buildFilter: buildHabitsGetFilter,
  },
  getHabitImpl,
);

export const habitLogsListRecentQuery = defineQuery<
  HabitLogsListRecentArgs,
  PbHabitLogs[]
>(
  {
    collection: "habit_logs",
    kind: "list",
    buildFilter: buildHabitLogsListRecentFilter,
  },
  listRecentHabitLogsImpl,
);

export const habitsGetHabitConsistencyQuery = defineQuery<
  HabitsGetHabitConsistencyArgs,
  PbHabitLogs[]
>(
  {
    collection: "habit_logs",
    kind: "list",
    buildFilter: buildHabitsGetHabitConsistencyFilter,
  },
  getHabitConsistencyImpl,
);
