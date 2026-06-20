import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbChatSessions } from "../_generated/dataModel";

export type SessionsListArgs = {
  workspaceId?: string;
  allWorkspaces?: boolean;
  userId?: string;
} | undefined;

export type SessionsGetArgs = {
  id: string;
  userId?: string;
} | undefined;

export function buildSessionsListFilter(
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

export function buildSessionsGetFilter(
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

async function listSessionsImpl(
  args: SessionsListArgs,
): Promise<PbChatSessions[]> {
  const pb = getPbClient();
  const filter = buildSessionsListFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("chat_sessions").getList(1, 200, {
    filter,
    sort: "-lastActivity,-createdAt",
  });
  return list.items as unknown as PbChatSessions[];
}

async function getSessionImpl(
  args: SessionsGetArgs,
): Promise<PbChatSessions | null> {
  const pb = getPbClient();
  const filter = buildSessionsGetFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return null;
  const list = await pb.collection("chat_sessions").getList(1, 1, {
    filter,
  });
  return (list.items[0] as unknown as PbChatSessions) ?? null;
}

export const listSessionsQuery = defineQuery<
  SessionsListArgs,
  PbChatSessions[]
>(
  {
    collection: "chat_sessions",
    kind: "list",
    buildFilter: buildSessionsListFilter,
  },
  listSessionsImpl,
);

export const getSessionQuery = defineQuery<
  SessionsGetArgs,
  PbChatSessions | null
>(
  {
    collection: "chat_sessions",
    kind: "first",
    buildFilter: buildSessionsGetFilter,
  },
  getSessionImpl,
);
