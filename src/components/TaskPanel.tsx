"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CheckCircle2, Circle, Clock, ListTodo, Sparkles, Tag, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Calendar as CalendarIcon, Grid, Filter, ArrowUpDown, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../convex/_generated/dataModel";
import { DayPicker } from "react-day-picker";
import { format, isSameDay, parse, parseISO } from "date-fns";
import "react-day-picker/dist/style.css";

export function TaskPanel({ 
  activeWorkspaceId,
  onSync
}: { 
  activeWorkspaceId: Id<"workspaces"> | undefined,
  onSync?: () => void
}) {
  const tasks = useQuery(api.tasks.listIncomplete, { workspaceId: activeWorkspaceId });
  const events = useQuery(api.events.list, { workspaceId: activeWorkspaceId });
  const toggleTask = useMutation(api.tasks.toggleCompleted);
  const [expandedTaskId, setExpandedTaskId] = useState<Id<"tasks"> | null>(null);
  const [view, setView] = useState<"tasks" | "events" | "calendar">("tasks");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">("date");
  const [showFilters, setShowFilters] = useState(false);

  const workspaces = useQuery(api.workspaces.list);

  // Helper to parse dates from the database (supports ISO and legacy human formats)
  const parseTaskDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    try {
      // 1. Try ISO format (preferred)
      if (dateStr.includes("T") || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        return parseISO(dateStr);
      }

      // 2. Try AI format: "Weekday, Month Day at Time"
      if (dateStr.includes(" at ")) {
        const datePart = dateStr.split(" at ")[0];
        return parse(datePart, "eeee, MMMM d", new Date());
      }
      
      // 3. Try standard locale format: "M/d/yyyy, h:mm AM"
      if (dateStr.includes("/")) {
        const datePart = dateStr.split(",")[0];
        return parse(datePart, "M/d/yyyy", new Date());
      }

      // 4. Fallback: try to just find anything that looks like a date
      const cleanDate = dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (cleanDate) return parse(cleanDate[0], "M/d/yyyy", new Date());

      return null;
    } catch {
      return null;
    }
  };

  const formatDateLabel = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    const date = parseTaskDate(dateStr);
    if (!date) return dateStr;
    return format(date, "MMM d, h:mm a");
  };

  const taskDates = useMemo(() => {
    if (!tasks) return [];
    return tasks.map(t => parseTaskDate(t.dueDate)).filter(Boolean) as Date[];
  }, [tasks]);

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

  const eventDates = useMemo(() => {
    if (!events) return [];
    return events.map(e => new Date(e.startTime));
  }, [events]);

  const sortedAndFilteredTasks = useMemo(() => {
    if (!tasks) return [];
    
    const filtered = tasks.filter(t => 
      t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = parseTaskDate(a.dueDate)?.getTime() || 0;
        const dateB = parseTaskDate(b.dueDate)?.getTime() || 0;
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
  }, [tasks, searchQuery, sortBy]);

  const syncWorkspace = () => {
    onSync?.();
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#1a1814] overflow-hidden">
      <header className="px-6 py-4 lg:py-8 space-y-4 lg:space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#d4a373]/5 border border-[#d4a373]/10 flex items-center justify-center">
              {view === "tasks" ? (
                <ListTodo className="w-4 h-4 text-[#d4a373]" />
              ) : view === "events" ? (
                <Clock className="w-4 h-4 text-[#d4a373]" />
              ) : (
                <CalendarIcon className="w-4 h-4 text-[#d4a373]" />
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
                            <p className="text-sm font-medium text-[#f2efeb] leading-[1.5]">
                              {task.text}
                            </p>
                          </div>
                          <div className="mt-1 shrink-0">
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
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373] shadow-[0_0_8px_rgba(212,163,115,0.4)]" />
                      <span className="text-xs text-[#f2efeb] font-bold tracking-tight uppercase">{event.title}</span>
                    </div>
                    <span className="text-[9px] font-bold text-[#d4a373]/60 uppercase tracking-widest">Event</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[#a8a29e]/50 font-medium">
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      <span>{format(new Date(event.startTime), "MMM d, yyyy")}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{format(new Date(event.startTime), "h:mm a")} - {format(new Date(event.endTime), "h:mm a")}</span>
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
                  {eventsOnSelectedDate.map(event => (
                    <div 
                      key={event._id}
                      className="p-4 rounded-2xl bg-[#1f1d19] border border-[#d4a373]/20 flex flex-col gap-2 group hover:bg-[#d4a373]/5 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373] shadow-[0_0_8px_rgba(212,163,115,0.4)]" />
                          <span className="text-xs text-[#f2efeb] font-bold tracking-tight uppercase">{event.title}</span>
                        </div>
                        <span className="text-[9px] font-bold text-[#d4a373]/60 uppercase tracking-widest">Event</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-[10px] text-[#a8a29e]/50 font-medium">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(event.startTime), "h:mm a")} - {format(new Date(event.endTime), "h:mm a")}</span>
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
                  {tasksOnSelectedDate.map(task => (
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
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-[#f2efeb] truncate font-medium tracking-tight">{task.text}</span>
                        <span className="text-[9px] font-bold text-[#a8a29e]/30 uppercase tracking-widest">Task</span>
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
    </div>
  );
}
