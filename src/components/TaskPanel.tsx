"use client";

import {
  usePbTasksList,
  usePbEventsList,
  usePbHabitsList,
  usePbWorkspacesList,
  usePbTaskToggleCompleted,
  usePbTaskDelete,
  usePbTaskUpdate,
  usePbEventDelete,
  usePbEventUpdate,
  usePbEventUpdateOccurrence,
  usePbEventCancelOccurrence,
  usePbTaskCreate,
  usePbEventCreate,
} from "@/pb-compat";
import { api as pbApi } from "@/pb-compat/api";
import { useState, useMemo, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { PbTasks, PbEvents } from "@/pb-compat/_generated/dataModel";
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
  CreateTaskModal,
  CreateEventModal,
} from "./panel";

export function TaskPanel({
  activeWorkspaceId,
  onSync,
  onClose,
  onRefer,
}: {
  activeWorkspaceId: string | undefined;
  onSync?: () => void;
  onClose?: () => void;
  onRefer?: (scope: Scope) => void;
}) {
  const tasks = usePbTasksList({ workspaceId: activeWorkspaceId });
  const events = usePbEventsList({ workspaceId: activeWorkspaceId });
  
  const todayDateString = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const rawHabits = usePbHabitsList({ workspaceId: activeWorkspaceId, todayDateString });

  const pbToggleTask = usePbTaskToggleCompleted();
  const toggleTask = async (args: { id: string }) => {
    const task = await pbApi.tasks.get({ id: args.id });
    const completed = task ? !task.completed : true;
    return pbToggleTask({ id: args.id, completed });
  };

  const deleteTask = usePbTaskDelete();
  const pbUpdateTask = usePbTaskUpdate();
  const updateTask = (args: any) => {
    const { id, ...rest } = args;
    return pbUpdateTask({ taskId: id, ...rest });
  };
  const removeEvent = usePbEventDelete();
  const pbUpdateEvent = usePbEventUpdate();
  const updateEvent = (args: any) => {
    const { id, ...rest } = args;
    return pbUpdateEvent({ eventId: id, ...rest });
  };
  const updateOccurrence = usePbEventUpdateOccurrence();
  const cancelEventOccurrence = usePbEventCancelOccurrence();
  const pbCreateTask = usePbTaskCreate();
  const createTask = (args: any) => {
    const { workspaceId, reminderOffset, ...rest } = args;
    return pbCreateTask({
      ...rest,
      workspaceId: workspaceId || undefined,
      reminderOffset: reminderOffset || undefined,
    });
  };
  const pbCreateEvent = usePbEventCreate();
  const createEvent = (args: any) => {
    const { workspaceId, reminderOffset, ...rest } = args;
    return pbCreateEvent({
      ...rest,
      workspaceId: workspaceId || undefined,
      reminderOffset: reminderOffset || undefined,
    });
  };

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [view, setView] = useState<"tasks" | "events" | "calendar" | "habits">("tasks");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isLargeViewport, setIsLargeViewport] = useState(true);

  const currentSearch = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    const params = new URLSearchParams(currentSearch);
    const viewParam = params.get("view");
    if (viewParam && ["tasks", "events", "calendar", "habits"].includes(viewParam)) {
      setView(viewParam as "tasks" | "events" | "calendar" | "habits");
    }
  }, [currentSearch]);

  useEffect(() => {
    const checkViewport = () => setIsLargeViewport(window.innerWidth >= 1024);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // Editing State
  const [editingTaskObj, setEditingTaskObj] = useState<TaskDoc | null>(null);
  const [editingEventData, setEditingEventData] = useState<{ id: string; event: EventDoc; timestamp: number } | null>(null);
  const [confirmEditRecurring, setConfirmEditRecurring] = useState<ConfirmEditRecurringData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteData | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);

  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "priority" | "category">("date");
  const [showFilters, setShowFilters] = useState(false);

  const workspaces = usePbWorkspacesList();

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return (tasks as PbTasks[]).filter((t) => {
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
    return (tasks as PbTasks[]).map((t) => parseTaskDate(t.dueDate)).filter(Boolean) as Date[];
  }, [tasks]);

  const eventDates = useMemo(() => {
    if (!events) return [];
    return events.map((e: any) => new Date(e.startTime));
  }, [events]);

  const displayEvents = useMemo(() => {
    if (!events) return [];
    const filtered = (events as PbEvents[]).filter(
      (e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => a.startTime - b.startTime);

    const now = Date.now();
    const seriesBest = new Map<string, PbEvents>();
    const deduplicated: PbEvents[] = [];

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
    return (tasks as PbTasks[]).filter((t) => {
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

  const handleCreateTask = async (updates: {
    text: string;
    priority: "low" | "medium" | "high";
    category: string;
    dueDate?: number;
    workspaceId?: string | null;
    resources?: any[];
    reminderOffset: number | null;
  }) => {
    await createTask(updates);
    setIsCreateTaskOpen(false);
  };

  const handleCreateEvent = async (updates: {
    title: string;
    description?: string;
    startTime: number;
    endTime?: number;
    eventType: "interval" | "point";
    location?: string;
    recurrence: any;
    workspaceId?: string | null;
    reminderOffset: number | null;
    resources?: any[];
  }) => {
    await createEvent({
      ...updates,
      workspaceId: updates.workspaceId === null ? undefined : updates.workspaceId,
    });
    setIsCreateEventOpen(false);
  };

  const handleUpdateTask = async (
    id: string,
    updates: {
      text: string;
      priority: "low" | "medium" | "high";
      category: string;
      dueDate?: number;
      workspaceId?: string | null;
      resources?: any[];
      overwriteResources?: boolean;
      reminderOffset?: number | null;
    }
  ) => {
    await updateTask({ id, ...updates });
    setEditingTaskObj(null);
  };

  const handleDeleteTask = (id: string) => {
    setConfirmDelete({ id, type: "task" });
  };

  const executeDeleteTask = async (id: string) => {
    await deleteTask({ id });
    setConfirmDelete(null);
  };

  const handleUpdateEvent = async (id: string, updates: EventUpdateData) => {
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

  const executeDeleteEvent = async (id: string) => {
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
              onCreateTask={() => setIsCreateTaskOpen(true)}
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
              onCreateEvent={() => setIsCreateEventOpen(true)}
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
                await executeDeleteTask(id as string);
              } else {
                await executeDeleteEvent(id as string);
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

        {isCreateTaskOpen && (
          <CreateTaskModal
            activeWorkspaceId={activeWorkspaceId}
            isLargeViewport={isLargeViewport}
            onSave={handleCreateTask}
            onClose={() => setIsCreateTaskOpen(false)}
          />
        )}

        {isCreateEventOpen && (
          <CreateEventModal
            activeWorkspaceId={activeWorkspaceId}
            isLargeViewport={isLargeViewport}
            onSave={handleCreateEvent}
            onClose={() => setIsCreateEventOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}


