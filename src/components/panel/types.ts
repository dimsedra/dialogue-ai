import { Doc, Id } from "../../../convex/_generated/dataModel";

export type TaskDoc = Doc<"tasks">;
export type EventDoc = Doc<"events">;

export interface EventUpdateData {
  title: string;
  description: string;
  location: string;
  startTime?: number;
  endTime?: number;
  eventType?: "interval" | "point";
  recurrence?: { frequency: "daily" | "weekly"; interval: number; daysOfWeek?: number[]; until?: number } | null;
  workspaceId?: Id<"workspaces"> | null;
  reminderOffset?: number | null;
  resources?: any[];
  overwriteResources?: boolean;
}

export interface ConfirmEditRecurringData {
  id: Id<"events">;
  event: EventDoc;
  updates: EventUpdateData;
  timestamp: number;
}

export interface ConfirmDeleteData {
  id: string;
  type: "task" | "event";
  event?: EventDoc;
}
