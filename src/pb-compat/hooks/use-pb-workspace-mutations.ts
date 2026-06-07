import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import type { PbWorkspaces } from "../_generated/dataModel";

export function usePbWorkspaceCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbWorkspaces>({ collection: "workspaces", kind: "create" });
  return async (args: { name: string; icon: string; color: string }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      user: user.id as any,
      name: args.name,
      icon: args.icon,
      color: args.color,
      createdAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbWorkspaceUpdate() {
  const { user } = useAuth();
  const mutate = useMutation<PbWorkspaces>({ collection: "workspaces", kind: "update" });
  return async (args: {
    id: string;
    context?: string;
    agentName?: string;
    color?: string;
    defaultAgentPersonaId?: string | null;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const patch: Record<string, any> = {};
    if (args.context !== undefined) patch.context = args.context;
    if (args.agentName !== undefined) patch.agentName = args.agentName;
    if (args.color !== undefined) patch.color = args.color;
    if (args.defaultAgentPersonaId !== undefined) {
      patch.defaultAgentPersona = args.defaultAgentPersonaId === null ? "" : args.defaultAgentPersonaId;
    }
    const record = await mutate({ id: args.id, record: patch });
    return record;
  };
}
