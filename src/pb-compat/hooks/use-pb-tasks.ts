import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { tasksListQuery, tasksGetQuery, tasksSearchHistoryQuery } from "../descriptors/tasks";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { PbTasks } from "../_generated/dataModel";

export function mapTask(pb: PbTasks): Doc<"tasks"> {
  return {
    _id: pb.id as unknown as Doc<"tasks">["_id"],
    _creationTime: pb.createdAt,
    userId: pb.user as unknown as Doc<"tasks">["userId"],
    text: pb.text,
    workspaceId: pb.workspace as unknown as Doc<"tasks">["workspaceId"],
    completed: pb.completed,
    dueDate: pb.dueDate,
    dueDateStr: pb.dueDateStr,
    priority: pb.priority,
    category: pb.category,
    notes: pb.notes,
    progress: pb.progress,
    statusHook: pb.statusHook,
    contextUpdatedAt: pb.contextUpdatedAt,
    createdAt: pb.createdAt,
    completedAt: pb.completedAt,
    resources: pb.resources as unknown as Doc<"tasks">["resources"],
    reminderOffset: pb.reminderOffset,
    scheduledNotificationId: pb.scheduledNotificationId as unknown as Doc<"tasks">["scheduledNotificationId"],
  } as unknown as Doc<"tasks">;
}

export function usePbTasksList(args?: { workspaceId?: string }): Doc<"tasks">[] | undefined {
  const { user } = useAuth();
  const tasks = useQuery(
    tasksListQuery,
    user ? { userId: user.id, workspaceId: args?.workspaceId } : undefined,
  );
  if (!tasks) return undefined;
  return tasks.map(mapTask);
}

export function usePbTask(id: string | undefined): Doc<"tasks"> | null | undefined {
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
}): Doc<"tasks">[] | undefined {
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
