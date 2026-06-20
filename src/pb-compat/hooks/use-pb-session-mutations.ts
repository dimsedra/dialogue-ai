import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbChatSessions } from "../_generated/dataModel";

export function usePbSessionCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbChatSessions>({ collection: "chat_sessions", kind: "create" });
  return async (args: { 
    workspaceId: string; 
    title?: string;
    sessionType?: 'trunk' | 'branch';
    parentSession?: string;
    branchedFromMessage?: string;
    branchedFromTimestamp?: number;
  }) => {
    if (!user) throw new Error("Unauthorized");
    if (!args.workspaceId) throw new Error("workspaceId is required");

    const pb = getPbClient();
    const type = args.sessionType || 'branch';

    if (type === 'branch') {
      const activeBranches = await pb.collection("chat_sessions").getList(1, 10, {
        filter: `workspace = "${args.workspaceId}" && sessionType = "branch" && archived = false`
      });

      let limit = 3;
      try {
        const ws = await pb.collection("workspaces").getOne(args.workspaceId);
        if (ws && typeof ws.activeBranchLimit === 'number') {
          limit = ws.activeBranchLimit;
        } else {
          const profile = await pb.collection("user_profile").getFirstListItem(`user = "${user.id}"`);
          if (profile?.preferences && typeof profile.preferences === 'object') {
            const limitPref = (profile.preferences as any).activeBranchLimit;
            if (typeof limitPref === 'number') {
              limit = limitPref;
            }
          }
        }
      } catch (e) {
        // Fall back to default limit of 3
      }

      if (activeBranches.totalItems >= limit) {
        throw new Error(`Cannot create new topic branch: You have reached the active branch limit of ${limit} for this workspace. Please merge or close an existing branch first.`);
      }
    }

    const record = await mutate({
      user: user.id as any,
      workspace: args.workspaceId as any,
      title: args.title || (type === 'trunk' ? "Workspace Trunk" : "New Branch"),
      pinned: type === 'trunk',
      lastActivity: Date.now(),
      createdAt: Date.now(),
      isTrunk: type === 'trunk',
      sessionType: type,
      parentSession: args.parentSession || null,
      branchedFromMessage: args.branchedFromMessage || null,
      branchedFromTimestamp: args.branchedFromTimestamp || null,
      archived: false,
    } as any);
    return record.id;
  };
}

export function usePbSessionMerge() {
  const { user } = useAuth();
  return async (args: { sessionId: string }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const token = pb.authStore.token;
    if (!token) throw new Error("Authentication token is missing");

    const res = await fetch("/api/jobs/mergeSession", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ args: { sessionId: args.sessionId } }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to merge branch session");
    }

    const data = await res.json();
    return data;
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
