import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import type { PbWorkspaces } from "../_generated/dataModel";
import { getPbClient } from "../client";
import { useAction, defineAction } from "../use-action";

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
  const runUpdate = useAction<
    {
      id: string;
      context?: string;
      agentName?: string;
      color?: string;
      archived?: boolean;
      activeBranchLimit?: number;
    },
    { success: boolean }
  >(defineAction("updateWorkspace"));

  return async (args: {
    id: string;
    context?: string;
    agentName?: string;
    color?: string;
    archived?: boolean;
    activeBranchLimit?: number;
  }) => {
    if (!user) throw new Error("Unauthorized");
    await runUpdate(args);
    const pb = getPbClient();
    const record = await pb.collection("workspaces").getOne(args.id);
    return record as unknown as PbWorkspaces;
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
