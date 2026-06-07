import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbMemories } from "../_generated/dataModel";

export function usePbMemoryCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbMemories>({ collection: "memories", kind: "create" });
  const update = useMutation<PbMemories>({ collection: "memories", kind: "update" });

  return async (args: {
    text: string;
    embedding: number[];
    hash?: string;
    createdAt?: number;
    updatedAt?: number;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const now = Date.now();

    if (args.hash) {
      const list = await pb.collection("memories").getList(1, 1, {
        filter: `user = "${user.id}" && hash = "${args.hash}"`,
      });
      const existing = list.items[0];
      if (existing) {
        await update({
          id: existing.id,
          record: {
            text: args.text,
            embedding: args.embedding,
            updatedAt: args.updatedAt || now,
          },
        });
        return existing.id;
      }
    }

    const record = await mutate({
      user: user.id as any,
      text: args.text,
      embedding: args.embedding,
      hash: args.hash || undefined,
      createdAt: args.createdAt || now,
      updatedAt: args.updatedAt || now,
    } as any);
    return record.id;
  };
}

export function usePbMemoryUpdate() {
  const { user } = useAuth();
  const mutate = useMutation<PbMemories>({ collection: "memories", kind: "update" });
  return async (args: { id: string; text: string }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      id: args.id,
      record: {
        text: args.text,
        updatedAt: Date.now(),
      },
    });
    return record;
  };
}

export function usePbMemoryDelete() {
  const { user } = useAuth();
  const mutate = useMutation({ collection: "memories", kind: "delete" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    await mutate({ id: args.id });
  };
}
