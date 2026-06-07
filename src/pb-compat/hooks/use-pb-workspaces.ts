import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { workspacesListQuery, workspacesGetQuery } from "../descriptors/workspaces";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { PbWorkspaces } from "../_generated/dataModel";

export function mapWorkspace(pb: PbWorkspaces): Doc<"workspaces"> {
  return {
    _id: pb.id as unknown as Doc<"workspaces">["_id"],
    _creationTime: pb.createdAt,
    userId: pb.user as unknown as Doc<"workspaces">["userId"],
    name: pb.name,
    icon: pb.icon,
    color: pb.color,
    context: pb.context,
    agentName: pb.agentName,
    defaultAgentPersonaId: pb.defaultAgentPersona as unknown as Doc<"workspaces">["defaultAgentPersonaId"],
  } as unknown as Doc<"workspaces">;
}

export function usePbWorkspacesList(): Doc<"workspaces">[] | undefined {
  const { user } = useAuth();
  const workspaces = useQuery(
    workspacesListQuery,
    user ? { userId: user.id } : undefined,
  );
  if (!workspaces) return undefined;
  return workspaces.map(mapWorkspace);
}

export function usePbWorkspace(id: string | undefined): Doc<"workspaces"> | null | undefined {
  const { user } = useAuth();
  const workspace = useQuery(
    workspacesGetQuery,
    id && user ? { id, userId: user.id } : undefined,
  );
  if (workspace === undefined) return undefined;
  if (workspace === null) return null;
  return mapWorkspace(workspace);
}
