import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { personasListQuery } from "../descriptors/personas";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { PbAgentPersonas } from "../_generated/dataModel";

const DEFAULT_PROMPT = "You build relationships through concrete behaviors, not prescribed tones.";

export function mapPersona(pb: PbAgentPersonas): Doc<"agentPersonas"> {
  return {
    _id: pb.id as unknown as Doc<"agentPersonas">["_id"],
    _creationTime: pb.createdAt,
    userId: pb.user as unknown as Doc<"agentPersonas">["userId"],
    name: pb.name,
    prompt: pb.prompt,
    description: pb.description,
    isDefault: pb.isDefault,
    createdAt: pb.createdAt,
  } as unknown as Doc<"agentPersonas">;
}

export function usePbPersonasList(): Doc<"agentPersonas">[] | undefined {
  const { user } = useAuth();
  const personas = useQuery(
    personasListQuery,
    user ? { userId: user.id } : undefined,
  );
  if (personas === undefined) return undefined;
  if (!user) return [];

  const defaultPersona: Doc<"agentPersonas"> = {
    _id: "default_dialogue" as any,
    _creationTime: 0,
    userId: user.id as any,
    name: "Dialogue",
    prompt: DEFAULT_PROMPT,
    description: "The default system assistant focused on concrete behaviors.",
    isDefault: true,
    createdAt: 0,
  };

  return [defaultPersona, ...personas.map(mapPersona)];
}
