import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import type { PbAgentPersonas } from "../_generated/dataModel";

export function usePbPersonaCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbAgentPersonas>({ collection: "agent_personas", kind: "create" });
  return async (args: { name: string; prompt: string; description?: string }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      user: user.id as any,
      name: args.name,
      prompt: args.prompt,
      description: args.description,
      isDefault: false,
      createdAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbPersonaUpdate() {
  const { user } = useAuth();
  const mutate = useMutation<PbAgentPersonas>({ collection: "agent_personas", kind: "update" });
  return async (args: {
    id: string;
    name?: string;
    prompt?: string;
    description?: string;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const patch: Record<string, any> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.prompt !== undefined) patch.prompt = args.prompt;
    if (args.description !== undefined) patch.description = args.description;
    const record = await mutate({ id: args.id, record: patch });
    return record;
  };
}

export function usePbPersonaDelete() {
  const { user } = useAuth();
  const mutate = useMutation({ collection: "agent_personas", kind: "delete" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    await mutate({ id: args.id });
  };
}
