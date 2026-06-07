import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { listSessionsQuery, getSessionQuery } from "../descriptors/chatSessions";
import { usePbPersonasList } from "./use-pb-personas";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { PbChatSessions } from "../_generated/dataModel";

const DEFAULT_PROMPT = "You build relationships through concrete behaviors, not prescribed tones.";

export function mapSession(pb: PbChatSessions): Doc<"chatSessions"> {
  return {
    _id: pb.id as unknown as Doc<"chatSessions">["_id"],
    _creationTime: pb.createdAt,
    userId: pb.user as unknown as Doc<"chatSessions">["userId"],
    title: pb.title,
    workspaceId: pb.workspace as unknown as Doc<"chatSessions">["workspaceId"],
    agentPersonaId: pb.agentPersona as unknown as Doc<"chatSessions">["agentPersonaId"],
    timezone: pb.timezone,
    createdAt: pb.createdAt,
    lastActivity: pb.lastActivity,
    pinned: pb.pinned,
  } as unknown as Doc<"chatSessions">;
}

export function usePbSessionsList(args?: {
  workspaceId?: string;
  allWorkspaces?: boolean;
}): Doc<"chatSessions">[] | undefined {
  const { user } = useAuth();
  const sessions = useQuery(
    listSessionsQuery,
    user
      ? {
          userId: user.id,
          workspaceId: args?.workspaceId,
          allWorkspaces: args?.allWorkspaces,
        }
      : undefined,
  );
  if (!sessions) return undefined;
  return sessions.map(mapSession);
}

export interface PbSessionWithPersona extends Doc<"chatSessions"> {
  personaName: string;
  personaPrompt: string;
}

export function usePbSession(
  id: string | undefined,
): PbSessionWithPersona | null | undefined {
  const { user } = useAuth();
  const session = useQuery(
    getSessionQuery,
    id && user ? { id, userId: user.id } : undefined,
  );
  const personas = usePbPersonasList();

  if (session === undefined || personas === undefined) return undefined;
  if (session === null) return null;

  const mapped = mapSession(session);
  let personaName = "Dialogue";
  let personaPrompt = DEFAULT_PROMPT;

  if (session.agentPersona) {
    const persona = personas.find((p) => p._id === (session.agentPersona as any));
    if (persona) {
      personaName = persona.name;
      personaPrompt = persona.prompt;
    }
  }

  return {
    ...mapped,
    personaName,
    personaPrompt,
  };
}
