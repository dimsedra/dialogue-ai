import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { personasListQuery } from "../descriptors/personas";
import type { PbAgentPersonas } from "../_generated/dataModel";

const DEFAULT_PROMPT = "You build relationships through concrete behaviors, not prescribed tones.";

export function mapPersona(pb: PbAgentPersonas): PbAgentPersonas {
  return pb;
}

export function usePbPersonasList(): PbAgentPersonas[] | undefined {
  const { user } = useAuth();
  const personas = useQuery(
    personasListQuery,
    user ? { userId: user.id } : undefined,
  );
  if (personas === undefined) return undefined;
  if (!user) return [];

  const defaultPersona: PbAgentPersonas = {
    _id: "default_dialogue" as any,
    id: "default_dialogue" as any,
    collectionId: "",
    collectionName: "agent_personas",
    user: user.id as any,
    name: "Dialogue",
    prompt: DEFAULT_PROMPT,
    description: "The default system assistant focused on concrete behaviors.",
    isDefault: true,
    createdAt: 0,
  };

  return [defaultPersona, ...personas.map(mapPersona)];
}
