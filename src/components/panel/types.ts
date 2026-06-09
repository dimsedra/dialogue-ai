import { PbTasks, PbEvents } from "@/pb-compat/_generated/dataModel";

export type TaskDoc = PbTasks;
export type EventDoc = PbEvents;

export interface EventUpdateData {
  title: string;
  description: string;
  location: string;
  startTime?: number;
  endTime?: number;
  eventType?: "interval" | "point";
  recurrence?: { frequency: "daily" | "weekly"; interval: number; daysOfWeek?: number[]; until?: number } | null;
  workspaceId?: string | null;
  reminderOffset?: number | null;
  resources?: unknown[];
  overwriteResources?: boolean;
}

export interface ConfirmEditRecurringData {
  id: string;
  event: EventDoc;
  updates: EventUpdateData;
  timestamp: number;
}

export interface ConfirmDeleteData {
  id: string;
  type: "task" | "event";
  event?: EventDoc;
}
