import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { listSessionsQuery, getSessionQuery } from "../descriptors/chatSessions";
import type { PbChatSessions } from "../_generated/dataModel";

export function mapSession(pb: PbChatSessions): PbChatSessions {
  return pb;
}

export function usePbSessionsList(args?: {
  workspaceId?: string;
  allWorkspaces?: boolean;
}): PbChatSessions[] | undefined {
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

export function usePbSession(
  id: string | undefined,
): PbChatSessions | null | undefined {
  const { user } = useAuth();
  const session = useQuery(
    getSessionQuery,
    id && user ? { id, userId: user.id } : undefined,
  );

  if (session === undefined) return undefined;
  if (session === null) return null;

  return mapSession(session);
}
