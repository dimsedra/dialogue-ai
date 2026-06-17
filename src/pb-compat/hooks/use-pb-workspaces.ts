import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { workspacesListQuery, workspacesGetQuery } from "../descriptors/workspaces";
import type { PbWorkspaces } from "../_generated/dataModel";

export function mapWorkspace(pb: PbWorkspaces): PbWorkspaces {
  return pb;
}

export function usePbWorkspacesList(args?: { includeArchived?: boolean }): PbWorkspaces[] | undefined {
  const { user } = useAuth();
  const workspaces = useQuery(
    workspacesListQuery,
    user ? { userId: user.id, ...args } : undefined,
  );
  if (!workspaces) return undefined;
  return workspaces.map(mapWorkspace);
}

export function usePbWorkspace(id: string | undefined): PbWorkspaces | null | undefined {
  const { user } = useAuth();
  const workspace = useQuery(
    workspacesGetQuery,
    id && user ? { id, userId: user.id } : undefined,
  );
  if (workspace === undefined) return undefined;
  if (workspace === null) return null;
  return mapWorkspace(workspace);
}
