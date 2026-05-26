"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useMemo, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { Scope } from "@/components/chat/types";
import { isSameDay } from "date-fns";
import {
  parseTaskDate,
  ConfirmDeleteData,
  ConfirmEditRecurringData,
  EventDoc,
  EventUpdateData,
  TaskDoc,
  DeleteConfirmModal,
  RecurringEditModal,
  EditTaskModal,
  EditEventModal,
  PanelHeader,
  FilterBar,
  TaskList,
  EventList,
  CalendarView,
  HabitList,
} from "./panel";

export function TaskPanel({
  activeWorkspaceId,
  onSync,
  onClose,
  onRefer,
}: {
  activeWorkspaceId: Id<"workspaces"> | undefined;
  onSync?: () => void;
  onClose?: () => void;
  onRefer?: (scope: Scope) => void;
}) {
  const tasks = useQuery(api.tasks.list, { workspaceId: activeWorkspaceId });
  const events = useQuery(api.events.list, { workspaceId: activeWorkspaceId });
  
  const todayDateString = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const rawHabits = useQuery(api.habits.getHabits, {
    workspaceId: activeWorkspaceId,
    todayDateString,
  });

  const toggleTask = useMutation(api.tasks.toggleCompleted);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const removeEvent = useMutation(api.events.remove);
  const updateEvent = useMutation(api.events.update);
  const updateOccurrence = useMutation(api.events.updateOccurrence);
  const cancelEventOccurrence = useMutation(api.events.cancelOccurrence);

  const [expandedTaskId, setExpandedTaskId] = useState<Id<"tasks"> | null>(null);
  const [view, setView] = useState<"tasks" | "events" | "calendar" | "habits">("tasks");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isLargeViewport, setIsLargeViewport] = useState(true);

  useEffect(() => {
    const checkViewport = () => setIsLargeViewport(window.innerWidth >= 1024);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // Editing State
  const [editingTaskObj, setEditingTaskObj] = useState<TaskDoc | null>(null);
  const [editingEventData, setEditingEventData] = useState<{ id: Id<"events">; event: EventDoc; timestamp: number } | null>(null);
  const [confirmEditRecurring, setConfirmEditRecurring] = useState<ConfirmEditRecurringData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteData | null>(null);

  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">("date");
  const [showFilters, setShowFilters] = useState(false);

  const workspaces = useQuery(api.workspaces.list, {});

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return (tasks as Doc<"tasks">[]).filter((t) => {
      const matchSearch =
        t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [tasks, searchQuery]);

  const sortedAndFilteredTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === "date") {
        const dateA = a.dueDate ? (typeof a.dueDate === "number" ? a.dueDate : parseTaskDate(a.dueDate)?.getTime() || 0) : 0;
        const dateB = b.dueDate ? (typeof b.dueDate === "number" ? b.dueDate : parseTaskDate(b.dueDate)?.getTime() || 0) : 0;
        return dateA - dateB;
      }
      if (sortBy === "priority") {
        const weights: Record<string, number> = { high: 3, medium: 2, low: 1 };
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
    return (tasks as Doc<"tasks">[]).map((t) => parseTaskDate(t.dueDate)).filter(Boolean) as Date[];
  }, [tasks]);

  const eventDates = useMemo(() => {
    if (!events) return [];
    return events.map((e: any) => new Date(e.startTime));
  }, [events]);

  const displayEvents = useMemo(() => {
    if (!events) return [];
    const filtered = (events as Doc<"events">[]).filter(
      (e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => a.startTime - b.startTime);

    const now = Date.now();
    const seriesBest = new Map<string, Doc<"events">>();
    const deduplicated: Doc<"events">[] = [];

    for (const event of filtered) {
      if (event.recurrence) {
        const existing = seriesBest.get(event._id);
        if (!existing) {
          seriesBest.set(event._id, event);
        } else if (existing.startTime < now && event.startTime >= now) {
          // Upgrade: existing is past, current is upcoming
          seriesBest.set(event._id, event);
        } else if (existing.startTime < now && event.startTime < now && event.startTime > existing.startTime) {
          // Both past — keep the most recent
          seriesBest.set(event._id, event);
        } else if (existing.startTime >= now && event.startTime >= now && event.startTime < existing.startTime) {
          // Both upcoming — keep the sooner one
          seriesBest.set(event._id, event);
        }
      } else {
        deduplicated.push(event);
      }
    }
    for (const event of seriesBest.values()) {
      deduplicated.push(event);
    }

    return deduplicated;
  }, [events, searchQuery]);

  const tasksOnSelectedDate = useMemo(() => {
    if (!tasks || !selectedDate) return [];
    return (tasks as Doc<"tasks">[]).filter((t) => {
      const taskDate = parseTaskDate(t.dueDate);
      return taskDate ? isSameDay(taskDate, selectedDate) : false;
    });
  }, [tasks, selectedDate]);

  const eventsOnSelectedDate = useMemo(() => {
    if (!events || !selectedDate) return [];
    return events.filter((e: any) => isSameDay(new Date(e.startTime), selectedDate));
  }, [events, selectedDate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDelete) setConfirmDelete(null);
        else if (confirmEditRecurring) setConfirmEditRecurring(null);
        else {
          setEditingTaskObj(null);
          setEditingEventData(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDelete, confirmEditRecurring]);

  const handleUpdateTask = async (
    id: Id<"tasks">,
    updates: { text: string; priority: "low" | "medium" | "high"; category: string; dueDate?: number }
  ) => {
    await updateTask({ id, ...updates });
    setEditingTaskObj(null);
  };

  const handleDeleteTask = (id: Id<"tasks">) => {
    setConfirmDelete({ id, type: "task" });
  };

  const executeDeleteTask = async (id: Id<"tasks">) => {
    await deleteTask({ id });
    setConfirmDelete(null);
  };

  const handleUpdateEvent = async (id: Id<"events">, updates: EventUpdateData) => {
    await updateEvent({ id, ...updates });
    setEditingEventData(null);
  };

  const handleSaveRecurring = (data: ConfirmEditRecurringData) => {
    setConfirmEditRecurring(data);
    setEditingEventData(null);
  };

  const handleDeleteEvent = (event: EventDoc) => {
    setConfirmDelete({ id: event._id, type: "event", event });
  };

  const executeDeleteEvent = async (id: Id<"events">) => {
    await removeEvent({ id });
    setConfirmDelete(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1814] relative">
      <header className="p-6 shrink-0 space-y-6">
        <PanelHeader view={view} setView={setView} onClose={onClose} onSync={onSync} />
        {view !== "calendar" && view !== "habits" && (
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-12 scrollbar-hide">
        <AnimatePresence mode="wait">
          {view === "tasks" ? (
            <TaskList
              tasks={sortedAndFilteredTasks}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              isLargeViewport={isLargeViewport}
              expandedTaskId={expandedTaskId}
              setExpandedTaskId={setExpandedTaskId}
              onToggleTask={(id) => toggleTask({ id })}
              onEditTask={(task) => setEditingTaskObj(task)}
              onDeleteTask={handleDeleteTask}
              onReferTask={onRefer ? (task) => onRefer({ type: "task", id: task._id, title: task.text }) : undefined}
            />
          ) : view === "events" ? (
            <EventList
              events={displayEvents}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              isLargeViewport={isLargeViewport}
              onEditEvent={setEditingEventData}
              onDeleteEvent={handleDeleteEvent}
              onReferEvent={onRefer ? (event) => onRefer({ type: "event", id: event._id, title: event.title }) : undefined}
            />
          ) : view === "calendar" ? (
            <CalendarView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              taskDates={taskDates}
              eventDates={eventDates}
              tasksOnSelectedDate={tasksOnSelectedDate}
              eventsOnSelectedDate={eventsOnSelectedDate}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              isLargeViewport={isLargeViewport}
              onEditEvent={setEditingEventData}
              onDeleteEvent={handleDeleteEvent}
              onDeleteTask={handleDeleteTask}
              onReferDate={onRefer ? (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const dateString = `${year}-${month}-${day}`;
                onRefer({ type: "date", id: dateString, title: date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) });
              } : undefined}
              onReferEvent={onRefer ? (event) => onRefer({ type: "event", id: event._id, title: event.title }) : undefined}
              onReferTask={onRefer ? (task) => onRefer({ type: "task", id: task._id, title: task.text }) : undefined}
              habits={rawHabits}
              todayDateString={todayDateString}
              onReferHabit={onRefer ? (habit) => onRefer({ type: "habit", id: habit._id, title: habit.name }) : undefined}
            />
          ) : (
            <HabitList
              activeWorkspaceId={activeWorkspaceId}
              isLargeViewport={isLargeViewport}
              onReferHabit={onRefer ? (habit) => onRefer({ type: "habit", id: habit._id, title: habit.name }) : undefined}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {confirmDelete && (
          <DeleteConfirmModal
            target={confirmDelete}
            isLargeViewport={isLargeViewport}
            onConfirmDelete={async (id, type) => {
              if (type === "task") {
                await executeDeleteTask(id as Id<"tasks">);
              } else {
                await executeDeleteEvent(id as Id<"events">);
              }
            }}
            onConfirmDeleteOccurrence={async (id, timestamp) => {
              await cancelEventOccurrence({ id, timestamp });
              setConfirmDelete(null);
            }}
            onCancel={() => setConfirmDelete(null)}
          />
        )}

        {confirmEditRecurring && (
          <RecurringEditModal
            data={confirmEditRecurring}
            isLargeViewport={isLargeViewport}
            onSaveSeries={async (id, updates) => {
              await updateEvent({ id, ...updates });
              setConfirmEditRecurring(null);
            }}
            onSaveOccurrence={async (seriesId, originalStartTime, updates) => {
              await updateOccurrence({
                seriesId,
                originalStartTime,
                startTime: updates.startTime,
                endTime: updates.endTime,
                eventType: updates.eventType,
                title: updates.title,
                description: updates.description,
                location: updates.location,
              });
              setConfirmEditRecurring(null);
            }}
            onCancel={() => setConfirmEditRecurring(null)}
          />
        )}

        {editingTaskObj && (
          <EditTaskModal
            task={editingTaskObj}
            isLargeViewport={isLargeViewport}
            onSave={handleUpdateTask}
            onDelete={(id) => {
              handleDeleteTask(id);
              setEditingTaskObj(null);
            }}
            onClose={() => setEditingTaskObj(null)}
          />
        )}

        {editingEventData && (
          <EditEventModal
            editingData={editingEventData}
            isLargeViewport={isLargeViewport}
            onSave={handleUpdateEvent}
            onSaveRecurring={handleSaveRecurring}
            onDelete={(event) => {
              handleDeleteEvent(event);
              setEditingEventData(null);
            }}
            onClose={() => setEditingEventData(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
