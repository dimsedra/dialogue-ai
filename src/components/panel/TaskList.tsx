import { motion, AnimatePresence } from "framer-motion";
import { Circle, Edit3, Trash2, ChevronUp, ChevronDown, Clock, AlertCircle, Tag, CheckCircle2, Archive, Paperclip } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { TaskDoc } from "./types";
import { formatDateLabel } from "./utils";
import { ResourceTray } from "./ResourceTray";

interface TaskListProps {
  tasks: Doc<"tasks">[] | undefined;
  workspaces: Doc<"workspaces">[] | undefined;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  isLargeViewport: boolean;
  expandedTaskId: Id<"tasks"> | null;
  setExpandedTaskId: (id: Id<"tasks"> | null) => void;
  onToggleTask: (id: Id<"tasks">) => void;
  onEditTask: (task: TaskDoc) => void;
  onDeleteTask: (id: Id<"tasks">) => void;
}

export function TaskList({
  tasks,
  workspaces,
  activeWorkspaceId,
  isLargeViewport,
  expandedTaskId,
  setExpandedTaskId,
  onToggleTask,
  onEditTask,
  onDeleteTask,
}: TaskListProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { activeTasks, recentCompletedTasks, olderCount } = useMemo(() => {
    if (!tasks) return { activeTasks: [], recentCompletedTasks: [], olderCount: 0 };
    const active: Doc<"tasks">[] = [];
    const completed: Doc<"tasks">[] = [];

    for (const t of tasks) {
      if (t.completed) completed.push(t);
      else active.push(t);
    }

    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const recentComp: Doc<"tasks">[] = [];
    let oldCnt = 0;

    for (const t of completed) {
      const time = t.completedAt || t.contextUpdatedAt || t.createdAt;
      if (time >= sevenDaysAgo) recentComp.push(t);
      else oldCnt++;
    }

    return { activeTasks: active, recentCompletedTasks: recentComp, olderCount: oldCnt };
  }, [tasks, now]);

  const renderTask = (task: Doc<"tasks">, isCompletedArchive: boolean) => {
    const taskWorkspace = workspaces?.find((w) => w._id === task.workspaceId);
    return (
      <motion.div
        key={task._id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={isLargeViewport ? { duration: 0.3 } : { duration: 0 }}
        className={`rounded-3xl border group transition-all duration-500 overflow-hidden ${
          isCompletedArchive
            ? "bg-[#1f1d19]/40 border-[#2a2723]/60 opacity-60 hover:opacity-100"
            : task.priority === "high"
            ? "bg-[#d4a373]/5 border-[#d4a373]/20 hover:border-[#d4a373]/40 shadow-xl shadow-[#d4a373]/5"
            : "bg-[#1f1d19] border-[#2a2723] hover:border-[#d4a373]/20"
        } ${expandedTaskId === task._id ? "ring-1 ring-[#d4a373]/30" : ""}`}
      >
        <div
          className="p-5 cursor-pointer"
          onClick={() => setExpandedTaskId(expandedTaskId === task._id ? null : task._id)}
        >
          <div className="flex gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleTask(task._id);
              }}
              className="mt-1 transition-all duration-300 transform group-hover:scale-110"
            >
              {task.completed ? (
                <CheckCircle2 className="w-4 h-4 text-[#d4a373] fill-[#d4a373]/20" />
              ) : (
                <Circle className="w-4 h-4 text-[#a8a29e]/40 group-hover:text-[#d4a373]" />
              )}
            </button>
            <div className="flex-1 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  {!activeWorkspaceId && taskWorkspace && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                        style={{ backgroundColor: taskWorkspace.color }}
                      />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#a8a29e]/40">
                        {taskWorkspace.name}
                      </span>
                    </div>
                  )}
                  <p
                    className={`text-sm font-medium leading-[1.5] transition-all ${
                      task.completed ? "text-[#a8a29e]/40 line-through" : "text-[#f2efeb]"
                    }`}
                  >
                    {task.text}
                  </p>
                </div>
                <div className="mt-1 shrink-0 flex items-center gap-1">
                  <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all mr-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTask(task as TaskDoc);
                      }}
                      className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTask(task._id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {expandedTaskId === task._id ? (
                    <ChevronUp className="w-3.5 h-3.5 text-[#a8a29e]/40" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#a8a29e]/40 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                {task.dueDate && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#a8a29e]/60">
                    <Clock className="w-3.5 h-3.5 text-[#d4a373]/40" />
                    {formatDateLabel(task.dueDate)}
                  </div>
                )}
                {task.priority === "high" && (
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-[#d4a373]/10 text-[#d4a373] border border-[#d4a373]/20">
                    High
                  </span>
                )}
                {task.resources && task.resources.length > 0 && (
                  <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/30">
                    <Paperclip className="w-2.5 h-2.5" />
                    <span>{task.resources.length}</span>
                  </div>
                )}
              </div>

              {expandedTaskId === task._id && (
                <div className="pt-4 mt-4 border-t border-[#2a2723] space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
                        Priority
                      </span>
                      <div className="flex items-center gap-1.5">
                        <AlertCircle
                          className={`w-3 h-3 ${
                            task.priority === "high"
                              ? "text-red-400"
                              : task.priority === "medium"
                              ? "text-orange-400"
                              : "text-blue-400"
                          }`}
                        />
                        <span className="text-[11px] text-[#f2efeb] capitalize font-medium">
                          {task.priority || "Medium"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
                        Category
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-[#d4a373]/60" />
                        <span className="text-[11px] text-[#f2efeb] font-medium">
                          {task.category || "Uncategorized"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
                      Timeline
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-[#a8a29e]/40" />
                      <span className="text-[11px] text-[#f2efeb] font-medium">
                        {task.dueDate ? `Due ${formatDateLabel(task.dueDate)}` : "No due date set"}
                      </span>
                    </div>
                  </div>

                  {task.resources && task.resources.length > 0 && (
                    <ResourceTray resources={task.resources} />
                  )}

                  <div className="pt-2">
                    <span className="text-[9px] text-[#a8a29e]/30 italic">
                      Created {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      key="tasks"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={isLargeViewport ? undefined : { duration: 0 }}
      className="space-y-3"
    >
      <AnimatePresence mode="popLayout">
        {activeTasks.map((task) => renderTask(task, false))}
      </AnimatePresence>

      {activeTasks.length === 0 && recentCompletedTasks.length > 0 && (
        <div className="py-8 text-center">
          <p className="text-xs font-medium text-[#a8a29e]/40 italic">No active tasks. Great job!</p>
        </div>
      )}

      {recentCompletedTasks.length > 0 && (
        <div className="pt-6 mt-6 border-t border-[#2a2723]">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center justify-between w-full py-2 px-1 text-[11px] font-bold text-[#a8a29e]/60 uppercase tracking-widest hover:text-[#f2efeb] transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Archive className="w-3.5 h-3.5 text-[#d4a373]/60 group-hover:text-[#d4a373] transition-colors" />
              <span>Completed Archive ({recentCompletedTasks.length})</span>
            </div>
            {showCompleted ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#a8a29e]/60 group-hover:text-[#f2efeb] transition-colors" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#a8a29e]/60 group-hover:text-[#f2efeb] transition-colors" />
            )}
          </button>

          <AnimatePresence>
            {showCompleted && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3 mt-3 overflow-hidden"
              >
                {recentCompletedTasks.map((task) => renderTask(task, true))}
                {olderCount > 0 && (
                  <div className="pt-3 px-2 text-[11px] text-[#a8a29e]/40 italic border-t border-[#2a2723]/40 flex items-center justify-center text-center">
                    💡 +{olderCount} older archived {olderCount === 1 ? "task" : "tasks"}. Ask AI to summarize your past accomplishments.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {activeTasks.length === 0 && recentCompletedTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-[#1f1d19] border border-[#2a2723] flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-[#d4a373]/20" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#a8a29e]/50 uppercase tracking-widest">Quiet Moment</p>
            <p className="text-xs text-[#a8a29e]/30">You&apos;re all caught up for now.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
