import { useQuery } from "../use-query";
import { defineQuery } from "../use-query";
import { useAuth } from "../auth";
import type { PbReflections } from "../_generated/dataModel";

const getReflectionQuery = defineQuery<{ id: string }, PbReflections>(
  {
    collection: "reflections",
    kind: "get",
    buildFilter: (args) => `id = "${args?.id}"`,
  },
  async () => ({} as PbReflections)
);

export function usePbReflection(id: string | null) {
  const { user } = useAuth();
  const res = useQuery(getReflectionQuery, user && id ? { id } : "skip");
  
  if (!user || !res) return null;
  
  return {
    ...res,
    _id: res.id as any,
    userId: res.user as any,
    workspaceId: res.workspace as any,
  } as any;
}

const getPublicReflectionQuery = defineQuery<{ id: string }, PbReflections>(
  {
    collection: "reflections",
    kind: "get",
    buildFilter: (args) => `id = "${args?.id}" && shared = true`,
  },
  async () => ({} as PbReflections)
);

export function usePbPublicReflection(id: string | null) {
  const res = useQuery(getPublicReflectionQuery, id ? { id } : "skip");
  if (!res) return null;
  return {
    ...res,
    _id: res.id as any,
    userId: res.user as any,
    workspaceId: res.workspace as any,
  } as any;
}
