import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbAgentPersonas } from "../_generated/dataModel";

export type PersonasListArgs = {
  userId?: string;
} | undefined;

export function buildPersonasListFilter(
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

async function listPersonasImpl(
  args: PersonasListArgs,
): Promise<PbAgentPersonas[]> {
  const pb = getPbClient();
  const filter = buildPersonasListFilter(args as Record<string, unknown> | undefined);
  if (filter === "1 = 2") return [];
  const list = await pb.collection("agent_personas").getList(1, 100, {
    filter,
    sort: "+createdAt",
  });
  return list.items as unknown as PbAgentPersonas[];
}

export const personasListQuery = defineQuery<
  PersonasListArgs,
  PbAgentPersonas[]
>(
  {
    collection: "agent_personas",
    kind: "list",
    buildFilter: buildPersonasListFilter,
  },
  listPersonasImpl,
);
