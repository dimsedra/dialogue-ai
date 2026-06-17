import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import type { PbWorkspaces } from "../_generated/dataModel";
import { getPbClient } from "../client";

export function usePbWorkspaceCreate() {
  const { user } = useAuth();
  return async (args: { name: string; icon: string; color: string }) => {
    if (!user) throw new Error("Unauthorized");

    const pb = getPbClient();
    const token = pb.authStore.token;

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: args.name,
        icon: args.icon,
        color: args.color,
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to create workspace");
    }

    const data = (await res.json()) as { id: string };
    return data.id;
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
    archived?: boolean;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const patch: Record<string, any> = {};
    if (args.context !== undefined) patch.context = args.context;
    if (args.agentName !== undefined) patch.agentName = args.agentName;
    if (args.color !== undefined) patch.color = args.color;
    if (args.defaultAgentPersonaId !== undefined) {
      patch.defaultAgentPersona = args.defaultAgentPersonaId === null ? "" : args.defaultAgentPersonaId;
    }
    if (args.archived !== undefined) patch.archived = args.archived;
    const record = await mutate({ id: args.id, record: patch });
    return record;
  };
}

export function usePbWorkspaceDelete() {
  const { user } = useAuth();
  return async (id: string) => {
    if (!user) throw new Error("Unauthorized");

    const pb = getPbClient();
    const token = pb.authStore.token;

    const res = await fetch(`/api/workspaces/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to delete workspace");
    }

    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  };
}
