import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbChatSessions } from "../_generated/dataModel";

export function usePbSessionCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbChatSessions>({ collection: "chat_sessions", kind: "create" });
  return async (args: { workspaceId?: string; title?: string }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      user: user.id as any,
      workspace: (args.workspaceId || undefined) as any,
      title: args.title || "New Session",
      pinned: false,
      lastActivity: Date.now(),
      createdAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbSessionDelete() {
  const { user } = useAuth();
  const mutate = useMutation({ collection: "chat_sessions", kind: "delete" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    await mutate({ id: args.id });
  };
}

export function usePbSessionRename() {
  const { user } = useAuth();
  const mutate = useMutation<PbChatSessions>({ collection: "chat_sessions", kind: "update" });
  return async (args: { id: string; title: string }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({ id: args.id, record: { title: args.title } });
    return record;
  };
}

export function usePbSessionTogglePin() {
  const { user } = useAuth();
  const mutate = useMutation<PbChatSessions>({ collection: "chat_sessions", kind: "update" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const session = await pb.collection("chat_sessions").getOne(args.id);
    if (!session || session.user !== user.id) throw new Error("Session not found or unauthorized");
    const record = await mutate({ id: args.id, record: { pinned: !session.pinned } });
    return record;
  };
}
