"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CheckCircle2, Circle, Clock, ListTodo, Sparkles, Tag, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Calendar as CalendarIcon, Grid, Filter, ArrowUpDown, Search, Trash2, Edit3, Save, X } from "lucide-react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../convex/_generated/dataModel";
import { DayPicker } from "react-day-picker";
import { format, isSameDay, parse, parseISO } from "date-fns";
import "react-day-picker/dist/style.css";

export function TaskPanel({ 
  activeWorkspaceId,
  onSync,
  onClose
}: { 
  activeWorkspaceId: Id<"workspaces"> | undefined,
  onSync?: () => void,
  onClose?: () => void
}) {
  const tasks = useQuery(api.tasks.listIncomplete, { workspaceId: activeWorkspaceId });
  const events = useQuery(api.events.list, { workspaceId: activeWorkspaceId });
  const toggleTask = useMutation(api.tasks.toggleCompleted);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const removeEvent = useMutation(api.events.remove);
  const updateEvent = useMutation(api.events.update);

  const [expandedTaskId, setExpandedTaskId] = useState<Id<"tasks"> | null>(null);
  const [view, setView] = useState<"tasks" | "events" | "calendar">("tasks");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Editing State
  const [editingTaskId, setEditingTaskId] = useState<Id<"tasks"> | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [editTaskCategory, setEditTaskCategory] = useState("");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  
  const [editingEventId, setEditingEventId] = useState<Id<"events"> | null>(null);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDesc, setEditEventDesc] = useState("");
  const [editEventLocation, setEditEventLocation] = useState("");
  const [editEventStartTime, setEditEventStartTime] = useState("");
  const [editEventEndTime, setEditEventEndTime] = useState("");

  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">("date");
  const [showFilters, setShowFilters] = useState(false);

  // Custom Modal State
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: "task" | "event" } | null>(null);

  const workspaces = useQuery(api.workspaces.list);

  // Helper to parse dates from the database (supports ISO and legacy human formats)
  const parseTaskDate = (dateStr: string | number | undefined): Date | null => {
    if (!dateStr) return null;
    if (typeof dateStr === 'number') return new Date(dateStr);
    try {
      if (dateStr.includes("T") || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        return parseISO(dateStr);
      }
      if (dateStr.includes(" at ")) {
        const datePart = dateStr.split(" at ")[0];
        return parse(datePart, "eeee, MMMM d", new Date());
      }
      if (dateStr.includes("/")) {
        const datePart = dateStr.split(",")[0];
        return parse(datePart, "M/d/yyyy", new Date());
      }
      const cleanDate = dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (cleanDate) return parse(cleanDate[0], "M/d/yyyy", new Date());
      return null;
    } catch {
      return null;
    }
  };

  const formatDateLabel = (date: Date | string | number | undefined) => {
    if (!date) return "";
    const d = typeof date === "string" ? parseTaskDate(date) : new Date(date);
    if (!d) return typeof date === "string" ? date : "";
    
    const yearStr = d.getFullYear() === new Date().getFullYear() ? "" : `, ${d.getFullYear()}`;
    return format(d, `MMM d${yearStr}, HH:mm`);
  };

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (view !== "tasks") return tasks;
    return tasks.filter(t => {
      const matchSearch = t.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         t.category?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;
      if (!selectedDate) return true;
      return t.dueDate ? isSameDay(new Date(t.dueDate), selectedDate) : false;
    });
  }, [tasks, searchQuery, selectedDate, view]);

  const sortedAndFilteredTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === "date") {
        const dateA = a.dueDate ? (typeof a.dueDate === 'number' ? a.dueDate : parseTaskDate(a.dueDate)?.getTime() || 0) : 0;
        const dateB = b.dueDate ? (typeof b.dueDate === 'number' ? b.dueDate : parseTaskDate(b.dueDate)?.getTime() || 0) : 0;
        return dateA - dateB;
      }
      if (sortBy === "priority") {
        const weights = { high: 3, medium: 2, low: 1 };
        return (weights[b.priority || "medium"] || 0) - (weights[a.priority || "medium"] || 0);
      }
      if (sortBy === "category") {
        return (a.category || "").localeCompare(b.category || "");
      }
      return 0;
    });
  }, [filteredTasks, sortBy]);

  const taskDates = useMemo(() => {
    if (!tasks) return [];
    return tasks.map(t => parseTaskDate(t.dueDate)).filter(Boolean) as Date[];
  }, [tasks]);

  const eventDates = useMemo(() => {
    if (!events) return [];
    return events.map(e => new Date(e.startTime));
  }, [events]);

  const tasksOnSelectedDate = useMemo(() => {
    if (!tasks || !selectedDate) return [];
    return tasks.filter(t => {
      const taskDate = parseTaskDate(t.dueDate);
      return taskDate ? isSameDay(taskDate, selectedDate) : false;
    });
  }, [tasks, selectedDate]);

  const eventsOnSelectedDate = useMemo(() => {
    if (!events || !selectedDate) return [];
    return events.filter(e => isSameDay(new Date(e.startTime), selectedDate));
  }, [events, selectedDate]);

  const syncWorkspace = () => {
    onSync?.();
  };

  const handleUpdateTask = async (id: Id<"tasks">) => {
    setIsSubmitting(true);
    try {
      const finalDueDate = editTaskDueDate ? new Date(editTaskDueDate).getTime() : undefined;

      await updateTask({ 
        id, 
        text: editTaskText,
        priority: editTaskPriority,
        category: editTaskCategory,
        dueDate: finalDueDate
      });
      setEditingTaskId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (id: Id<"tasks">) => {
    setConfirmDelete({ id, type: "task" });
  };

  const executeDeleteTask = async (id: Id<"tasks">) => {
    await deleteTask({ id });
    setConfirmDelete(null);
  };

  const handleUpdateEvent = async (id: Id<"events">) => {
    setIsSubmitting(true);
    try {
      let finalStartTime = 0;
      let finalEndTime = 0;

      if (editEventStartTime) {
        finalStartTime = new Date(editEventStartTime).getTime();
      }

      if (editEventEndTime) {
        finalEndTime = new Date(editEventEndTime).getTime();
      }

      await updateEvent({ 
        id, 
        title: editEventTitle, 
        description: editEventDesc,
        location: editEventLocation,
        startTime: finalStartTime || undefined,
        endTime: finalEndTime || undefined
      });
      setEditingEventId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (id: Id<"events">) => {
    setConfirmDelete({ id, type: "event" });
  };

  const executeDeleteEvent = async (id: Id<"events">) => {
    await removeEvent({ id });
    setConfirmDelete(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1814] relative">
      <header className="p-6 shrink-0 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#d4a373]/10 flex items-center justify-center">
              {view === "tasks" ? (
                <ListTodo className="w-5 h-5 text-[#d4a373]" />
              ) : view === "events" ? (
                <Clock className="w-5 h-5 text-[#d4a373]" />
              ) : (
                <CalendarIcon className="w-5 h-5 text-[#d4a373]" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#f2efeb]">
                {view === "tasks" ? "Tasks" : view === "events" ? "Events" : "Calendar"}
              </h2>
              <p className="text-[9px] text-[#a8a29e] uppercase tracking-widest font-bold">
                {view === "tasks" ? "Focus List" : view === "events" ? "Schedule" : "Timeline"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-[#0f0e0c] p-1 rounded-xl border border-[#2a2723]">
              <button
                onClick={() => setView("tasks")}
                className={`p-1.5 rounded-lg transition-all ${view === "tasks" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"}`}
                title="Task List"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView("events")}
                className={`p-1.5 rounded-lg transition-all ${view === "events" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"}`}
                title="Event List"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`p-1.5 rounded-lg transition-all ${view === "calendar" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"}`}
                title="Calendar View"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="hidden lg:flex p-2 rounded-xl text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
                title="Hide Planner"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {view !== "calendar" && (
          <div className="space-y-4">
            <button 
              onClick={syncWorkspace}
              disabled={!onSync}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#d4a373]/5 border border-[#d4a373]/10 hover:bg-[#d4a373]/10 transition-all group disabled:opacity-20 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[#d4a373] group-hover:scale-110 transition-transform duration-500" />
                <span className="text-xs font-bold text-[#f2efeb]">Sync workspace</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373] animate-pulse" />
                <ChevronRight className="w-3.5 h-3.5 text-[#a8a29e]/40 group-hover:text-[#f2efeb]" />
              </div>
            </button>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a8a29e]/40 group-focus-within:text-[#d4a373] transition-colors" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-xl pl-9 pr-4 py-2 text-xs text-[#f2efeb] focus:outline-none focus:border-[#d4a373]/30 transition-all"
                  />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-xl border transition-all ${showFilters ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]" : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"}`}
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-[#0f0e0c] border border-[#2a2723] rounded-xl flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-3 h-3 text-[#a8a29e]/40" />
                        <span className="text-[10px] font-bold text-[#a8a29e]/60 uppercase tracking-widest">Sort by</span>
                      </div>
                      <div className="flex gap-1">
                        {(["date", "priority", "category"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSortBy(s)}
                            className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${sortBy === s ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-12 scrollbar-hide">
        <AnimatePresence mode="wait">
          {view === "tasks" ? (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {sortedAndFilteredTasks?.map((task) => {
                const taskWorkspace = workspaces?.find(w => w._id === task.workspaceId);
                return (
                  <motion.div
                    key={task._id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`rounded-3xl border group transition-all duration-500 overflow-hidden ${
                      task.priority === "high" 
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
                        onClick={(e) => { e.stopPropagation(); toggleTask({ id: task._id }); }}
                        className="mt-1 transition-all duration-300 transform group-hover:scale-110"
                      >
                        <Circle className="w-4 h-4 text-[#a8a29e]/40 group-hover:text-[#d4a373]" />
                      </button>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col gap-1 flex-1">
                              {(!activeWorkspaceId && taskWorkspace) && (
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
                              {editingTaskId === task._id ? (
                                <div className="flex flex-col gap-3 pr-2 w-full" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    autoFocus
                                    className="w-full bg-[#0f0e0c] border border-[#d4a373]/30 rounded-lg px-2 py-1.5 text-sm text-[#f2efeb] outline-none"
                                    value={editTaskText}
                                    onChange={(e) => setEditTaskText(e.target.value)}
                                    placeholder="Task text..."
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Priority</span>
                                      <select 
                                        className="bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-2 py-1 text-[10px] text-[#f2efeb] outline-none"
                                        value={editTaskPriority}
                                        onChange={(e) => setEditTaskPriority(e.target.value as "low" | "medium" | "high")}
                                      >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                      </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Category</span>
                                      <input 
                                        className="bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-2 py-1 text-[10px] text-[#f2efeb] outline-none placeholder:text-[#a8a29e]/20"
                                        value={editTaskCategory}
                                        onChange={(e) => setEditTaskCategory(e.target.value)}
                                        placeholder="Work, Life..."
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Due Date</span>
                                    <input 
                                      type="datetime-local"
                                      className="bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-2 py-1 text-[10px] text-[#f2efeb] outline-none w-full appearance-none cursor-pointer"
                                      value={editTaskDueDate}
                                      onChange={(e) => setEditTaskDueDate(e.target.value)}
                                      onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                                    />
                                  </div>
                                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#2a2723]">
                                    <button 
                                      onClick={() => {
                                        setEditingTaskId(null);
                                      }} 
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                                    >
                                      <X className="w-3 h-3" />
                                      Cancel
                                    </button>
                                    <button 
                                      onClick={() => handleUpdateTask(task._id)} 
                                      disabled={isSubmitting}
                                      className="flex items-center gap-1 px-3 py-1 bg-[#d4a373] text-[#0f0e0c] rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all disabled:opacity-50"
                                    >
                                      {isSubmitting ? (
                                        <div className="w-3 h-3 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
                                      ) : (
                                        <Save className="w-3 h-3" />
                                      )}
                                      Save Task
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm font-medium text-[#f2efeb] leading-[1.5]">
                                  {task.text}
                                </p>
                              )}
                            </div>
                            <div className="mt-1 shrink-0 flex items-center gap-1">
                              {!editingTaskId && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all mr-2">
                                  <button 
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setEditingTaskId(task._id); 
                                      setEditTaskText(task.text);
                                      setEditTaskPriority(task.priority || "medium");
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
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      handleDeleteTask(task._id);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                              {expandedTaskId === task._id ? (
                                <ChevronUp className="w-3.5 h-3.5 text-[#a8a29e]/40" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-[#a8a29e]/40 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                        </div>

                        <AnimatePresence>
                          {expandedTaskId === task._id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="pt-4 mt-4 border-t border-[#2a2723] space-y-4"
                            >
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Priority</span>
                                  <div className="flex items-center gap-1.5">
                                    <AlertCircle className={`w-3 h-3 ${
                                      task.priority === "high" ? "text-red-400" : 
                                      task.priority === "medium" ? "text-orange-400" : "text-blue-400"
                                    }`} />
                                    <span className="text-[11px] text-[#f2efeb] capitalize font-medium">{task.priority || "Medium"}</span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Category</span>
                                  <div className="flex items-center gap-1.5">
                                    <Tag className="w-3 h-3 text-[#d4a373]/60" />
                                    <span className="text-[11px] text-[#f2efeb] font-medium">{task.category || "Uncategorized"}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Timeline</span>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-[#a8a29e]/40" />
                                  <span className="text-[11px] text-[#f2efeb] font-medium">
                                    {task.dueDate ? `Due ${formatDateLabel(task.dueDate)}` : "No due date set"}
                                  </span>
                                </div>
                              </div>

                              <div className="pt-2">
                                <span className="text-[9px] text-[#a8a29e]/30 italic">
                                  Created {new Date(task.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
              
              {sortedAndFilteredTasks?.length === 0 && (
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
          ) : view === "events" ? (
            <motion.div
              key="events"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {events?.filter(e => 
                e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                e.description?.toLowerCase().includes(searchQuery.toLowerCase())
              ).sort((a, b) => a.startTime - b.startTime).map((event) => (
                <motion.div
                  key={event._id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-2xl bg-[#1f1d19] border border-[#2a2723] hover:border-[#d4a373]/20 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373] shadow-[0_0_8px_rgba(212,163,115,0.4)]" />
                      {editingEventId === event._id ? (
                        <div className="flex-1 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Title</span>
                            <input 
                              autoFocus
                              className="w-full bg-[#0f0e0c] border border-[#d4a373]/30 rounded-lg px-2 py-1 text-xs text-[#f2efeb] outline-none"
                              value={editEventTitle}
                              onChange={(e) => setEditEventTitle(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Description</span>
                            <textarea 
                              className="w-full bg-[#0f0e0c] border border-[#d4a373]/30 rounded-lg px-2 py-1 text-[10px] text-[#a8a29e] outline-none resize-none"
                              value={editEventDesc}
                              onChange={(e) => setEditEventDesc(e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Location</span>
                            <input 
                              className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-2 py-1 text-[10px] text-[#f2efeb] outline-none"
                              value={editEventLocation}
                              onChange={(e) => setEditEventLocation(e.target.value)}
                              placeholder="Add location..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">Start Time</span>
                              <input 
                                type="datetime-local"
                                className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-2 py-1 text-[10px] text-[#f2efeb] outline-none appearance-none cursor-pointer"
                                value={editEventStartTime}
                                onChange={(e) => setEditEventStartTime(e.target.value)}
                                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold uppercase tracking-widest text-[#a8a29e]/40">End Time</span>
                              <input 
                                type="datetime-local"
                                className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-2 py-1 text-[10px] text-[#f2efeb] outline-none appearance-none cursor-pointer"
                                value={editEventEndTime}
                                onChange={(e) => setEditEventEndTime(e.target.value)}
                                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2 border-t border-[#2a2723]">
                             <button 
                               onClick={() => setEditingEventId(null)} 
                               disabled={isSubmitting}
                               className="px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#f2efeb] transition-all disabled:opacity-50"
                             >
                               Cancel
                             </button>
                             <button 
                               onClick={() => handleUpdateEvent(event._id)} 
                               disabled={isSubmitting}
                               className="px-3 py-1 bg-[#d4a373] text-[#0f0e0c] rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all disabled:opacity-50"
                             >
                               {isSubmitting ? (
                                 <div className="w-3 h-3 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
                               ) : (
                                 <Save className="w-3 h-3" />
                               )}
                               Save Event
                             </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-[#f2efeb] font-bold tracking-tight uppercase">{event.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!editingEventId && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setEditingEventId(event._id); 
                              setEditEventTitle(event.title);
                              setEditEventDesc(event.description || "");
                              setEditEventLocation(event.location || "");
                              setEditEventStartTime(format(new Date(event.startTime), "yyyy-MM-dd'T'HH:mm"));
                              setEditEventEndTime(format(new Date(event.endTime), "yyyy-MM-dd'T'HH:mm"));
                            }}
                            className="p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleDeleteEvent(event._id);
                            }}
                            className="p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <span className="text-[9px] font-bold text-[#d4a373]/60 uppercase tracking-widest whitespace-nowrap">Event</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[#a8a29e]/50 font-medium">
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      <span>{format(new Date(event.startTime), "MMM d, yyyy")}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span className="capitalize">
                        {format(new Date(event.startTime), "HH:mm")} - {format(new Date(event.endTime), "HH:mm")}
                      </span>
                      <span className="text-[8px] opacity-50 font-bold ml-1 uppercase tracking-tighter">
                        {Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ")}
                      </span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        <span>{event.location}</span>
                      </div>
                    )}
                  </div>

                  {event.description && (
                    <p className="mt-2 text-[10px] text-[#a8a29e]/40 italic leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </motion.div>
              ))}

              {events?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
                  <div className="w-16 h-16 rounded-3xl bg-[#1f1d19] border border-[#2a2723] flex items-center justify-center">
                    <CalendarIcon className="w-6 h-6 text-[#a8a29e]/20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#a8a29e]/50 uppercase tracking-widest">Open Schedule</p>
                    <p className="text-xs text-[#a8a29e]/30">No events found.</p>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="p-4 bg-[#1f1d19] rounded-3xl border border-[#2a2723] flex justify-center shadow-xl shadow-black/20">
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  modifiers={{ 
                    hasTask: taskDates,
                    hasEvent: eventDates
                  }}
                  modifiersClassNames={{
                    hasTask: "has-task-dot",
                    hasEvent: "has-event-dot"
                  }}
                  className="rdp-custom"
                  classNames={{
                    weekdays: "text-[10px] font-bold uppercase tracking-[0.2em] text-[#a8a29e]/40 p-2",
                    weekday: "p-2",
                    day: "p-0",
                    day_button: "rdp-day_button",
                    selected: "rdp-selected",
                    today: "rdp-today",
                    nav: "rdp-nav",
                    button_previous: "rdp-button_previous",
                    button_next: "rdp-button_next",
                    month_caption: "rdp-month_caption",
                    caption_label: "rdp-caption_label",
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-[#f2efeb]">
                      {selectedDate ? format(selectedDate, "MMMM d") : "Schedule"}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
                      {selectedDate ? format(selectedDate, "yyyy") : "Select a day"}
                    </p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-[#d4a373]/5 border border-[#d4a373]/10">
                    <span className="text-[10px] font-bold text-[#d4a373]">
                      {tasksOnSelectedDate.length + eventsOnSelectedDate.length} {tasksOnSelectedDate.length + eventsOnSelectedDate.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Events Section */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {eventsOnSelectedDate.map((event: any) => (
                    <div 
                      key={event._id}
                      className="p-4 rounded-2xl bg-[#1f1d19] border border-[#d4a373]/20 flex flex-col gap-2 group hover:bg-[#d4a373]/5 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373] shadow-[0_0_8px_rgba(212,163,115,0.4)]" />
                          <span className="text-xs text-[#f2efeb] font-bold tracking-tight uppercase">{event.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event._id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span className="text-[9px] font-bold text-[#d4a373]/60 uppercase tracking-widest">Event</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-[10px] text-[#a8a29e]/50 font-medium">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(event.startTime), "HH:mm")} - {format(new Date(event.endTime), "HH:mm")}</span>
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            <span>{event.location}</span>
                          </div>
                        )}
                      </div>
                      
                      {event.description && (
                        <p className="text-[10px] text-[#a8a29e]/40 italic leading-relaxed">
                          {event.description}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Tasks Section */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {tasksOnSelectedDate.map((task: any) => (
                    <div 
                      key={task._id}
                      className={`p-4 rounded-2xl bg-[#1f1d19] border border-[#2a2723] flex items-center gap-4 group hover:border-[#d4a373]/20 transition-all ${
                        task.priority === "high" ? "bg-[#d4a373]/5 border-[#d4a373]/10" : ""
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        task.priority === "high" ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]" : 
                        task.priority === "medium" ? "bg-orange-400" : "bg-[#a8a29e]/20"
                      }`} />
                      <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs text-[#f2efeb] truncate font-medium tracking-tight">{task.text}</span>
                          <span className="text-[9px] font-bold text-[#a8a29e]/30 uppercase tracking-widest">Task</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteTask(task._id); }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {tasksOnSelectedDate.length === 0 && eventsOnSelectedDate.length === 0 && (
                    <div className="py-12 text-center space-y-3 bg-[#1f1d19]/30 rounded-3xl border border-dashed border-[#2a2723]">
                      <CalendarIcon className="w-6 h-6 text-[#a8a29e]/10 mx-auto" />
                      <p className="text-[10px] text-[#a8a29e]/40 uppercase tracking-[0.2em] font-bold">Clear Horizon</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-sm p-6"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[280px] bg-[#1a1814] border border-[#d4a373]/20 rounded-2xl p-6 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-[#f2efeb] mb-2 leading-tight">
                Delete {confirmDelete.type === "task" ? "Task" : "Event"}?
              </h3>
              <p className="text-sm text-[#a8a29e] mb-6 leading-relaxed">
                This action cannot be undone. All data associated with this {confirmDelete.type} will be permanently removed.
              </p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    if (confirmDelete.type === "task") {
                      executeDeleteTask(confirmDelete.id as Id<"tasks">);
                    } else {
                      executeDeleteEvent(confirmDelete.id as Id<"events">);
                    }
                  }}
                  className="w-full py-3 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete Permanently
                </button>
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="w-full py-3 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
