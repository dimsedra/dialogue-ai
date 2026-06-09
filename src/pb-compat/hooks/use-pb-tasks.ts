import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { tasksListQuery, tasksGetQuery, tasksSearchHistoryQuery } from "../descriptors/tasks";
import type { PbTasks } from "../_generated/dataModel";

export function mapTask(pb: PbTasks): PbTasks {
  return pb;
}

export function usePbTasksList(args?: { workspaceId?: string }): PbTasks[] | undefined {
  const { user } = useAuth();
  const tasks = useQuery(
    tasksListQuery,
    user ? { userId: user.id, workspaceId: args?.workspaceId } : undefined,
  );
  if (!tasks) return undefined;
  return tasks.map(mapTask);
}

export function usePbTask(id: string | undefined): PbTasks | null | undefined {
  const { user } = useAuth();
  const task = useQuery(
    tasksGetQuery,
    id && user ? { id, userId: user.id } : undefined,
  );
  if (task === undefined) return undefined;
  if (task === null) return null;
  return mapTask(task);
}

export function usePbTasksSearchHistory(args?: {
  query?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): PbTasks[] | undefined {
  const { user } = useAuth();
  const tasks = useQuery(
    tasksSearchHistoryQuery,
    user ? {
      userId: user.id,
      query: args?.query,
      startTime: args?.startTime,
      endTime: args?.endTime,
      limit: args?.limit,
    } : undefined,
  );
  if (!tasks) return undefined;
  return tasks.map(mapTask);
}
