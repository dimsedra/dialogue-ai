import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbWorkspaces } from "../_generated/dataModel";

export type WorkspacesListArgs = {
  userId?: string;
  includeArchived?: boolean;
} | undefined;

export type WorkspacesGetArgs = {
  id: string;
  userId?: string;
} | undefined;

export function buildWorkspacesListFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  const escaped = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escaped}"`;
  if (!args?.includeArchived) {
    filter += ` && archived != true`;
  }
  return filter;
}

export function buildWorkspacesGetFilter(
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

async function listWorkspacesImpl(
  args: WorkspacesListArgs,
): Promise<PbWorkspaces[]> {
  const pb = getPbClient();
  const filter = buildWorkspacesListFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("workspaces").getList(1, 100, {
    filter,
    sort: "+createdAt",
  });
  return list.items as unknown as PbWorkspaces[];
}

async function getWorkspaceImpl(
  args: WorkspacesGetArgs,
): Promise<PbWorkspaces | null> {
  const pb = getPbClient();
  const filter = buildWorkspacesGetFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return null;
  const list = await pb.collection("workspaces").getList(1, 1, {
    filter,
  });
  return (list.items[0] as unknown as PbWorkspaces) ?? null;
}

export const workspacesListQuery = defineQuery<
  WorkspacesListArgs,
  PbWorkspaces[]
>(
  {
    collection: "workspaces",
    kind: "list",
    buildFilter: buildWorkspacesListFilter,
  },
  listWorkspacesImpl,
);

export const workspacesGetQuery = defineQuery<
  WorkspacesGetArgs,
  PbWorkspaces | null
>(
  {
    collection: "workspaces",
    kind: "first",
    buildFilter: buildWorkspacesGetFilter,
  },
  getWorkspaceImpl,
);
