export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface DiffViewProps {
  label: string;
  oldVal: string | number | boolean | undefined | null;
  newVal: string | number | boolean | undefined | null;
  type?: "text" | "priority" | "date";
}

export interface TaskToolArgs {
  text: string;
  dueDate?: string;
  priority?: string;
  category?: string;
  titleHint?: string;
  oldValues?: {
    text?: string;
    priority?: string;
    category?: string;
    dueDate?: number;
    completed?: boolean;
  };
}

export interface EventToolArgs {
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  titleHint?: string;
  oldValues?: {
    title?: string;
    startTime?: number;
    endTime?: number;
    location?: string;
  };
}

export interface EnrichedToolArgs extends Record<string, unknown> {
  titleHint?: string;
  oldValues?: Record<string, unknown>;
  oldBio?: string;
}

export interface Scope {
  type: "task" | "event" | "date";
  id: string; // Document ID or date string (yyyy-MM-dd)
  title: string;
}
