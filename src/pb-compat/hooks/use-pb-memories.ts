import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { defineQuery } from "../use-query";
import { getPbClient } from "../client";
import type { PbMemories } from "../_generated/dataModel";
import type { Doc } from "../../../convex/_generated/dataModel";

export function mapMemory(pb: PbMemories): Doc<"memories"> {
  return {
    _id: pb.id as any,
    _creationTime: pb.createdAt,
    userId: pb.user as any,
    text: pb.text,
    embedding: pb.embedding,
    hash: pb.hash || undefined,
    createdAt: pb.createdAt,
    updatedAt: pb.updatedAt,
  } as any;
}

export const memoriesListQuery = defineQuery<
  { userId?: string } | undefined,
  PbMemories[]
>(
  {
    collection: "memories",
    kind: "list",
    buildFilter: (args) => {
      if (!args?.userId) return "1 = 2";
      return `user = "${args.userId}"`;
    },
  },
  async (args) => {
    const pb = getPbClient();
    const list = await pb.collection("memories").getList(1, 200, {
      filter: `user = "${args?.userId}"`,
      sort: "-createdAt",
    });
    return list.items as any;
  }
);

export function usePbMemoriesList(): Doc<"memories">[] | undefined {
  const { user } = useAuth();
  const list = useQuery(memoriesListQuery, user ? { userId: user.id } : undefined);
  if (list === undefined) return undefined;
  return list.map(mapMemory);
}
