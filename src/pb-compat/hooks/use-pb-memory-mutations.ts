import { useAction, defineAction } from "../use-action";

export function usePbMemoryCreate() {
  const runCreate = useAction<{ text: string; workspaceId?: string }, { id: string }>(
    defineAction("createMemory")
  );

  return async (args: {
    text: string;
    workspaceId?: string;
    embedding?: number[];
    hash?: string;
    createdAt?: number;
    updatedAt?: number;
  }) => {
    const res = await runCreate({
      text: args.text,
      workspaceId: args.workspaceId,
    });
    return res.id;
  };
}

export function usePbMemoryUpdate() {
  const runUpdate = useAction<{ id: string; text: string }, { success: boolean }>(
    defineAction("updateMemory")
  );

  return async (args: { id: string; text: string }) => {
    await runUpdate({ id: args.id, text: args.text });
    return { id: args.id, text: args.text };
  };
}

export function usePbMemoryDelete() {
  const runDelete = useAction<{ id: string }, { success: boolean }>(
    defineAction("deleteMemory")
  );

  return async (args: { id: string }) => {
    await runDelete({ id: args.id });
  };
}

