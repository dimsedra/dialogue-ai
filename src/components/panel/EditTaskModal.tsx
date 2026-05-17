import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { AlertCircle, Circle, Clock, ListTodo, Save, Tag, Trash2, X } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";
import { TaskDoc } from "./types";

interface EditTaskModalProps {
  task: TaskDoc;
  isLargeViewport: boolean;
  onSave: (
    id: Id<"tasks">,
    updates: { text: string; priority: "low" | "medium" | "high"; category: string; dueDate?: number }
  ) => Promise<void>;
  onDelete: (id: Id<"tasks">) => void;
  onClose: () => void;
}

export function EditTaskModal({
  task,
  isLargeViewport,
  onSave,
  onDelete,
  onClose,
}: EditTaskModalProps) {
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [editTaskCategory, setEditTaskCategory] = useState("");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      const timer = setTimeout(() => {
        setEditTaskText(task.text);
        setEditTaskPriority((task.priority as "low" | "medium" | "high") || "medium");
        setEditTaskCategory(task.category || "");
        if (task.dueDate) {
          try {
            const date = new Date(task.dueDate);
            setEditTaskDueDate(format(date, "yyyy-MM-dd'T'HH:mm"));
          } catch {
            setEditTaskDueDate("");
          }
        } else {
          setEditTaskDueDate("");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [task]);

  const handleSave = async () => {
    if (isSubmitting || !editTaskText.trim()) return;
    setIsSubmitting(true);
    try {
      const finalDueDate = editTaskDueDate ? new Date(editTaskDueDate).getTime() : undefined;
      await onSave(task._id, {
        text: editTaskText,
        priority: editTaskPriority,
        category: editTaskCategory,
        dueDate: finalDueDate,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-md p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: "100%", opacity: 0, scale: 0.95 }}
        transition={isLargeViewport ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#1a1814] border border-[#d4a373]/20 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#2a2723]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#d4a373]/15 flex items-center justify-center text-[#d4a373]">
              <ListTodo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">Edit Task</h3>
              <span className="text-[10px] text-[#a8a29e]">Modify details and timeline</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Task Description</label>
            <textarea
              autoFocus
              name="panel-task-desc"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={3}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-2xl p-3 text-sm text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none resize-none transition-all"
              value={editTaskText}
              onChange={(e) => setEditTaskText(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Priority Level</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setEditTaskPriority("low")}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold capitalize transition-all border flex items-center justify-center gap-2 ${
                  editTaskPriority === "low"
                    ? "bg-blue-500/15 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10"
                    : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                }`}
              >
                <Circle className="w-3 h-3 text-blue-400" /> Low
              </button>
              <button
                type="button"
                onClick={() => setEditTaskPriority("medium")}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold capitalize transition-all border flex items-center justify-center gap-2 ${
                  editTaskPriority === "medium"
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                }`}
              >
                <AlertCircle className="w-3 h-3 text-amber-400" /> Medium
              </button>
              <button
                type="button"
                onClick={() => setEditTaskPriority("high")}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold capitalize transition-all border flex items-center justify-center gap-2 ${
                  editTaskPriority === "high"
                    ? "bg-red-500/15 border-red-500/50 text-red-400 shadow-lg shadow-red-500/10"
                    : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                }`}
              >
                <AlertCircle className="w-3 h-3 text-red-400" /> High
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Category</label>
              <div className="relative flex items-center">
                <Tag className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <input
                  name="panel-task-category"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all"
                  value={editTaskCategory}
                  onChange={(e) => setEditTaskCategory(e.target.value)}
                  placeholder="Work, Personal..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Due Date</label>
              <div className="relative flex items-center">
                <Clock className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <input
                  type="datetime-local"
                  name="panel-task-due"
                  autoComplete="off"
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all appearance-none cursor-pointer"
                  value={editTaskDueDate}
                  onChange={(e) => setEditTaskDueDate(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[#2a2723]">
          <button
            type="button"
            onClick={() => onDelete(task._id)}
            disabled={isSubmitting}
            className="p-2.5 rounded-xl text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            <Trash2 className="w-4 h-4" /> Delete Task
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#a8a29e] hover:text-[#f2efeb] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/20 flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Task
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
