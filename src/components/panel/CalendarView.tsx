import { format, isSameDay } from "date-fns";
import { motion } from "framer-motion";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { Calendar as CalendarIcon, Clock, Edit3, RefreshCw, Tag, Trash2, Zap, MessageSquarePlus } from "lucide-react";
import { PbTasks, PbEvents, PbWorkspaces } from "@/pb-compat/_generated/dataModel";
import { EventDoc, TaskDoc } from "./types";
import { useState, useMemo } from "react";
import { usePbHabitLog } from "@/pb-compat";
import { HabitWithLogs } from "./HabitList";

interface CalendarViewProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  taskDates: Date[];
  eventDates: Date[];
  tasksOnSelectedDate: PbTasks[];
  eventsOnSelectedDate: PbEvents[];
  workspaces: PbWorkspaces[] | undefined;
  activeWorkspaceId: string | undefined;
  isLargeViewport: boolean;
  onEditEvent: (data: { id: string; event: EventDoc; timestamp: number }) => void;
  onDeleteEvent: (event: EventDoc) => void;
  onDeleteTask: (id: string) => void;
  onReferDate?: (date: Date) => void;
  onReferEvent?: (event: EventDoc) => void;
  onReferTask?: (task: TaskDoc) => void;
  habits?: HabitWithLogs[];
  todayDateString?: string;
  onReferHabit?: (habit: HabitWithLogs) => void;
}

export function CalendarView({
  selectedDate,
  setSelectedDate,
  taskDates,
  eventDates,
  tasksOnSelectedDate,
  eventsOnSelectedDate,
  workspaces,
  activeWorkspaceId,
  isLargeViewport,
  onEditEvent,
  onDeleteEvent,
  onDeleteTask,
  onReferDate,
  onReferEvent,
  onReferTask,
  habits,
  todayDateString,
  onReferHabit,
}: CalendarViewProps) {
  const logHabit = usePbHabitLog();
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const selectedDateStr = useMemo(() => {
    if (!selectedDate) return "";
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const habitsOnSelectedDate = useMemo(() => {
    if (!habits || !selectedDate) return [];
    const dayOfWeek = selectedDate.getDay();
    return habits.filter((h) => {
      // If logged on this day, display it
      const hasLog = h.recentLogs?.some((l) => l.dateString === selectedDateStr);
      if (hasLog) return true;

      // Otherwise show if scheduled
      if (h.frequency === "daily") return true;
      if (h.frequency === "custom" && h.frequencyConfig?.daysOfWeek) {
        return h.frequencyConfig.daysOfWeek.includes(dayOfWeek);
      }
      return false;
    });
  }, [habits, selectedDate, selectedDateStr]);

  const handleLogHabit = async (habitId: string, status: "completed" | "skipped") => {
    const opId = `${habitId}-${status}`;
    setLoggingId(opId);
    try {
      await logHabit({
        habitId,
        dateString: selectedDateStr,
        status,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (error) {
      console.error("Failed to log habit from calendar view:", error);
    } finally {
      setLoggingId(null);
    }
  };

  const totalAgendaItems = tasksOnSelectedDate.length + eventsOnSelectedDate.length + habitsOnSelectedDate.length;

  const hasTasksSelected = tasksOnSelectedDate.length > 0;
  const hasEventsSelected = eventsOnSelectedDate.length > 0;
  const hasHabitsSelected = habitsOnSelectedDate.length > 0;

  return (
    <motion.div
      key="calendar"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={isLargeViewport ? undefined : { duration: 0 }}
      className="space-y-6"
    >
      <div className="relative p-4 overflow-hidden bg-[#1f1d19] rounded-3xl border border-[#2a2723] flex flex-col items-stretch shadow-xl shadow-black/20">
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className="rdp-custom relative w-full"
          classNames={{
            weekdays: "text-[10px] font-bold uppercase tracking-[0.2em] text-[#a8a29e]/40 p-2",
            weekday: "p-2",
            day: "p-0",
            day_button: "rdp-day_button",
            selected: "rdp-selected",
            today: "rdp-today",
            nav: "rdp-nav absolute top-0 bottom-auto left-0 right-0 h-[40px] flex items-center justify-between pointer-events-none z-10",
            button_previous: "rdp-button_previous pointer-events-auto",
            button_next: "rdp-button_next pointer-events-auto",
            month_caption: "rdp-month_caption",
            caption_label: "rdp-caption_label",
          }}
        />

        {/* Legend Centered at the Bottom - Active Items Only */}
        {(hasTasksSelected || hasEventsSelected || hasHabitsSelected) && (
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-[#2a2723]/30 w-full text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
            {hasTasksSelected && (
              <div className="flex items-center gap-1.5">
                <svg className="w-2.5 h-2.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Tasks</span>
              </div>
            )}
            {hasEventsSelected && (
              <div className="flex items-center gap-1.5">
                <svg className="w-2.5 h-2.5 text-[#d4a373] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span>Events</span>
              </div>
            )}
            {hasHabitsSelected && (
              <div className="flex items-center gap-1.5">
                <svg className="w-2.5 h-2.5 text-purple-400 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
                <span>Habits</span>
              </div>
            )}
          </div>
        )}
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
          <div className="flex items-center gap-2">
            {selectedDate && onReferDate && (
              <button
                onClick={() => onReferDate(selectedDate)}
                className="p-1.5 rounded-full hover:bg-[#d4a373]/10 text-[#d4a373]/60 hover:text-[#d4a373] transition-colors"
                title="Pin this Date to Chat"
              >
                <MessageSquarePlus className="w-4 h-4" />
              </button>
            )}
            <div className="px-3 py-1 rounded-full bg-[#d4a373]/5 border border-[#d4a373]/10">
              <span className="text-[10px] font-bold text-[#d4a373]">
                {totalAgendaItems} {totalAgendaItems === 1 ? "Item" : "Items"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {/* Events Section */}
          {eventsOnSelectedDate.map((event: PbEvents) => {
            const isCancelled = (event as any).cancelled === true;
            const eventWorkspace = workspaces?.find((w) => w._id === event.workspace);
            return (
              <div
                key={`${event._id}_${event.startTime}`}
                className={`p-4 rounded-2xl border flex flex-col gap-2 group transition-all ${
                  isCancelled
                    ? "bg-[#1f1d19] border-red-500/10 opacity-50"
                    : "bg-[#1f1d19] border-[#d4a373]/20 hover:bg-[#d4a373]/5"
                }`}
              >
                <div className="flex flex-col gap-1">
                  {!activeWorkspaceId && eventWorkspace && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                        style={{ backgroundColor: eventWorkspace.color }}
                      />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#a8a29e]/40">
                        {eventWorkspace.name}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                        style={{
                          backgroundColor: !activeWorkspaceId && eventWorkspace ? eventWorkspace.color : "#d4a373",
                        }}
                      />
                      <span className={`text-xs font-bold tracking-tight ${isCancelled ? "text-[#a8a29e]/40 line-through" : "text-[#f2efeb]"}`}>{event.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isCancelled ? (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/60">Cancelled</span>
                      ) : (
                      <>
                      {onReferEvent && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReferEvent(event as EventDoc);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                          title="Pin this Event to Chat"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditEvent({ id: event._id, event: event as EventDoc, timestamp: event.startTime });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEvent(event as EventDoc);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="flex items-center gap-1">
                        {(event.eventType === "point" || (!event.eventType && !event.endTime)) && (
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                        )}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-widest ${
                            event.eventType === "point" || (!event.eventType && !event.endTime) ? "text-amber-400" : "text-[#d4a373]/60"
                          }`}
                        >
                          {event.eventType === "point" || (!event.eventType && !event.endTime) ? "Release / Drop" : "Event"}
                        </span>
                      </div>
                      </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] text-[#a8a29e]/50 font-medium">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {format(new Date(event.startTime), "HH:mm")}
                      {event.eventType !== "point" && event.endTime
                        ? ` - ${format(new Date(event.endTime), "HH:mm")}`
                        : ""}
                    </span>
                  </div>
                  {event.recurrence && (
                    <div className="flex items-center gap-1 text-[#d4a373]">
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span className="capitalize font-bold">
                        {event.recurrence.frequency === "daily"
                          ? event.recurrence.interval === 1
                            ? "Daily"
                            : `Every ${event.recurrence.interval} days`
                          : event.recurrence.interval === 1
                          ? "Weekly"
                          : `Every ${event.recurrence.interval} weeks`}
                      </span>
                    </div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>

                {event.description && (
                  <p className="text-[10px] text-[#a8a29e]/40 italic leading-relaxed">{event.description}</p>
                )}
              </div>
            );
          })}

          {/* Tasks Section */}
          {tasksOnSelectedDate.map((task: PbTasks) => (
            <div
              key={task._id}
              className={`p-4 rounded-2xl bg-[#1f1d19] border border-[#2a2723] flex items-center gap-4 group hover:border-[#d4a373]/20 transition-all ${
                task.priority === "high" ? "bg-[#d4a373]/5 border-[#d4a373]/10" : ""
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  task.priority === "high"
                    ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]"
                    : task.priority === "medium"
                    ? "bg-orange-400"
                    : "bg-[#a8a29e]/20"
                }`}
              />
              <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs text-[#f2efeb] truncate font-medium tracking-tight">{task.text}</span>
                  <span className="text-[9px] font-bold text-[#a8a29e]/30 uppercase tracking-widest">Task</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  {onReferTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReferTask(task as TaskDoc);
                      }}
                      className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                      title="Pin this Task to Chat"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                    </button>
                  )}
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
              </div>
            </div>
          ))}

          {/* Habits Section */}
          {habitsOnSelectedDate.map((habit: HabitWithLogs) => {
            const todayLog = habit.recentLogs?.find((l) => l.dateString === selectedDateStr);
            return (
              <div
                key={habit._id}
                className="p-4 rounded-2xl bg-[#1f1d19] border border-[#2a2723] flex items-center gap-4 group hover:border-[#d4a373]/20 transition-all"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.4)]" />
                <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-[#f2efeb] truncate font-medium tracking-tight">
                      {habit.name}
                    </span>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#a8a29e]/30 uppercase tracking-widest">
                      <span>Habit</span>
                      {habit.currentStreak > 0 && (
                        <span className="text-[#d4a373] font-bold">
                          • {habit.currentStreak}d Streak
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onReferHabit && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReferHabit(habit);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                        title="Pin this Habit to Chat"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleLogHabit(habit._id, "completed")}
                        disabled={loggingId !== null}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all duration-300 ${
                          todayLog?.status === "completed"
                            ? "bg-purple-500/20 border border-purple-500/30 text-purple-400"
                            : "border border-[#2a2723] text-[#a8a29e]/60 hover:text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/20"
                        }`}
                      >
                        {loggingId === `${habit._id}-completed` ? "..." : "Done"}
                      </button>
                      <button
                        onClick={() => handleLogHabit(habit._id, "skipped")}
                        disabled={loggingId !== null}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all duration-300 ${
                          todayLog?.status === "skipped"
                            ? "bg-[#5c554f] text-[#f2efeb]"
                            : "border border-[#2a2723] text-[#a8a29e]/60 hover:text-[#f2efeb] hover:bg-[#2a2723]"
                        }`}
                      >
                        {loggingId === `${habit._id}-skipped` ? "..." : "Skip"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {totalAgendaItems === 0 && (
            <div className="py-12 text-center space-y-3 bg-[#1f1d19]/30 rounded-3xl border border-dashed border-[#2a2723]">
              <CalendarIcon className="w-6 h-6 text-[#a8a29e]/10 mx-auto" />
              <p className="text-[10px] text-[#a8a29e]/40 uppercase tracking-[0.2em] font-bold">Clear Horizon</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

