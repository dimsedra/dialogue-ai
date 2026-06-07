import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbEvents } from "../_generated/dataModel";

export type EventsListArgs = {
  workspaceId?: string;
  userId?: string;
} | undefined;

export type EventsGetArgs = {
  id: string;
  userId?: string;
} | undefined;

export type EventsSearchHistoryArgs = {
  query?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  userId?: string;
} | undefined;

export function buildEventsListFilter(
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

export function buildEventsGetFilter(
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

export function buildEventsSearchHistoryFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const now = Date.now();
  let filter = `user = "${escapedUser}" && startTime < ${now}`;

  if (args?.startTime !== undefined) {
    filter += ` && startTime >= ${args.startTime}`;
  }
  if (args?.endTime !== undefined) {
    filter += ` && startTime <= ${args.endTime}`;
  }
  if (args?.query) {
    const q = args.query;
    if (typeof q === "string" && q.length > 0) {
      const escapedQ = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      filter += ` && (title ~ "${escapedQ}" || description ~ "${escapedQ}")`;
    }
  }
  return filter;
}

async function listEventsImpl(
  args: EventsListArgs,
): Promise<PbEvents[]> {
  const pb = getPbClient();
  const filter = buildEventsListFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("events").getList(1, 200, {
    filter,
    sort: "+startTime",
  });
  return list.items as unknown as PbEvents[];
}

async function getEventImpl(
  args: EventsGetArgs,
): Promise<PbEvents | null> {
  const pb = getPbClient();
  const filter = buildEventsGetFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return null;
  const list = await pb.collection("events").getList(1, 1, {
    filter,
  });
  return (list.items[0] as unknown as PbEvents) ?? null;
}

async function searchHistoryEventsImpl(
  args: EventsSearchHistoryArgs,
): Promise<PbEvents[]> {
  const pb = getPbClient();
  const filter = buildEventsSearchHistoryFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const limit = args?.limit ?? 100;
  const list = await pb.collection("events").getList(1, limit, {
    filter,
    sort: "-startTime",
  });
  return list.items as unknown as PbEvents[];
}

export const eventsListQuery = defineQuery<
  EventsListArgs,
  PbEvents[]
>(
  {
    collection: "events",
    kind: "list",
    buildFilter: buildEventsListFilter,
  },
  listEventsImpl,
);

export const eventsGetQuery = defineQuery<
  EventsGetArgs,
  PbEvents | null
>(
  {
    collection: "events",
    kind: "first",
    buildFilter: buildEventsGetFilter,
  },
  getEventImpl,
);

export const eventsSearchHistoryQuery = defineQuery<
  EventsSearchHistoryArgs,
  PbEvents[]
>(
  {
    collection: "events",
    kind: "list",
    buildFilter: buildEventsSearchHistoryFilter,
  },
  searchHistoryEventsImpl,
);
