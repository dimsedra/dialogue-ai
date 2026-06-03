"use client";

import { motion } from "framer-motion";

type ToolApprovalCardProps = {
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDecline: () => void;
};

const TOOL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  addTask: { label: "Create Task", icon: "📋", color: "from-emerald-500/20 to-emerald-600/10" },
  updateTask: { label: "Update Task", icon: "✏️", color: "from-blue-500/20 to-blue-600/10" },
  completeTask: { label: "Complete Task", icon: "✅", color: "from-emerald-500/20 to-emerald-600/10" },
  deleteTask: { label: "Delete Task", icon: "🗑️", color: "from-red-500/20 to-red-600/10" },
  addEvent: { label: "Create Event", icon: "📅", color: "from-purple-500/20 to-purple-600/10" },
  updateEvent: { label: "Update Event", icon: "✏️", color: "from-blue-500/20 to-blue-600/10" },
  updateEventOccurrence: { label: "Update Recurring Event", icon: "🔄", color: "from-blue-500/20 to-blue-600/10" },
  deleteEvent: { label: "Delete Event", icon: "🗑️", color: "from-red-500/20 to-red-600/10" },
  batchAddTasks: { label: "Create Multiple Tasks", icon: "📋", color: "from-emerald-500/20 to-emerald-600/10" },
  create_habit: { label: "Create Habit", icon: "🔁", color: "from-amber-500/20 to-amber-600/10" },
  create_custom_reminder: { label: "Set Reminder", icon: "🔔", color: "from-amber-500/20 to-amber-600/10" },
};

function formatArgs(args: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "recurrence" && typeof value === "object" && value !== null) {
      const r = value as Record<string, unknown>;
      lines.push(`repeats ${r.frequency} every ${r.interval}`);
      if (r.daysOfWeek) lines.push(`on days: ${r.daysOfWeek}`);
    } else if (Array.isArray(value)) {
      if (value.length > 0) lines.push(`${key}: ${value.length} items`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines;
}

export function ToolApprovalCard({
  toolName,
  args,
  onApprove,
  onDecline,
}: ToolApprovalCardProps) {
  const meta = TOOL_LABELS[toolName] || { label: toolName, icon: "🔧", color: "from-gray-500/20 to-gray-600/10" };
  const argLines = formatArgs(args);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`relative rounded-xl border border-white/10 bg-gradient-to-br ${meta.color} backdrop-blur-md p-4 shadow-lg max-w-sm`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{meta.icon}</span>
        <span className="text-sm font-medium text-white/90">{meta.label}</span>
      </div>

      {argLines.length > 0 && (
        <div className="text-xs text-white/60 space-y-0.5 mb-3">
          {argLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white transition-colors"
        >
          Approve
        </button>
        <button
          onClick={onDecline}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
        >
          Decline
        </button>
      </div>
    </motion.div>
  );
}
