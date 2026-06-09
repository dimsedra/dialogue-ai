"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Check, CircleSlash, MessageSquarePlus, PencilLine, Plus } from "lucide-react";
import { format } from "date-fns";
import { CreateHabitModal } from "./CreateHabitModal";
import { EditHabitModal } from "./EditHabitModal";
import { usePbHabitsList, usePbHabitLog } from "@/pb-compat";
export interface HabitLog {
  dateString: string;
  status: "completed" | "skipped";
  notes?: string;
}

export interface HabitWithLogs {
  _id: string;
  userId?: string;
  user?: string;
  workspace?: string;
  name: string;
  description?: string;
  frequency: "daily" | "custom";
  frequencyConfig: { daysOfWeek?: number[] };
  currentStreak: number;
  longestStreak: number;
  lastLoggedAt?: number;
  lastLoggedDate?: string;
  archived: boolean;
  recentLogs: HabitLog[];
  weeklyRate?: number;
  weeklyStats?: { completed: number; scheduled: number };
}

interface HabitListProps {
  activeWorkspaceId: string | undefined;
  isLargeViewport: boolean;
  onReferHabit?: (habit: HabitWithLogs) => void;
}

export function HabitList({
  activeWorkspaceId,
  isLargeViewport,
  onReferHabit,
}: HabitListProps) {
  // Timezone-safe client-side "today" dateString calculation
  const [todayDateString, setTodayDateString] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const rawHabits = usePbHabitsList({ workspaceId: activeWorkspaceId });
  const habits = rawHabits as HabitWithLogs[] | undefined;
  
  const logHabit = usePbHabitLog();

  // Modal control states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedHabitForEdit, setSelectedHabitForEdit] = useState<HabitWithLogs | null>(null);

  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
  const [noteSavedToast, setNoteSavedToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTodayDateString(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Generate 30 days of dates ending on today
  const last30Days = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d;
    });
  }, [todayDateString]); // Recalculate if today changes

  // Auto-scroll the contribution grids to the right on mount
  const gridRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (habits) {
      Object.values(gridRefs.current).forEach((el) => {
        if (el) {
          el.scrollLeft = el.scrollWidth;
        }
      });
    }
  }, [habits]);

  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const userTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const handleLog = async (habitId: string, status: "completed" | "skipped") => {
    const opId = `${habitId}-${status}`;
    setLoggingId(opId);
    try {
      await logHabit({
        habitId,
        dateString: todayDateString,
        status,
        timezone: userTimezone,
      });
    } catch (error) {
      console.error("Failed to log habit:", error);
    } finally {
      setLoggingId(null);
    }
  };

  const handleSaveNotes = async (habitId: string, status: "completed" | "skipped") => {
    const notes = notesInput[habitId]?.trim();
    if (!notes) return;
    setSavingNotesId(habitId);
    try {
      await logHabit({
        habitId,
        dateString: todayDateString,
        status,
        notes,
        timezone: userTimezone,
      });
      setNotesInput((prev) => ({ ...prev, [habitId]: "" }));
      setNoteSavedToast(habitId);
      setTimeout(() => setNoteSavedToast((prev) => prev === habitId ? null : prev), 2000);
    } catch (error) {
      console.error("Failed to save notes:", error);
    } finally {
      setSavingNotesId(null);
    }
  };

  const overallStats = useMemo(() => {
    if (!habits || habits.length === 0) return { rate: 0, completed: 0, scheduled: 0 };
    let totalCompleted = 0;
    let totalScheduled = 0;
    habits.forEach((h) => {
      if (h.weeklyStats) {
        totalCompleted += h.weeklyStats.completed;
        totalScheduled += h.weeklyStats.scheduled;
      }
    });
    const rate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
    return { rate, completed: totalCompleted, scheduled: totalScheduled };
  }, [habits]);

  if (!habits) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#d4a373] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[#a8a29e]">Loading habits...</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header Actions */}
        <div className="flex items-center justify-between pb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Active Routines</span>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d4a373] hover:bg-[#c39262] text-[#0f0e0c] rounded-xl text-xs font-bold transition-all shadow-md shadow-[#d4a373]/10 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Routine
          </button>
        </div>

        {habits.length === 0 ? (
          <motion.div
            key="habits-empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center py-24 text-center space-y-5 border border-dashed border-[#2a2723] rounded-3xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#1f1d19] border border-[#2a2723] flex items-center justify-center">
              <Flame className="w-5 h-5 text-[#a8a29e]/30" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#a8a29e]/50 uppercase tracking-widest">No Active Habits</p>
              <p className="text-[11px] text-[#a8a29e]/30">Establish a habit routine to begin tracking progress.</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="habits-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={isLargeViewport ? undefined : { duration: 0 }}
            className="space-y-4"
          >
            {/* Overall Consistency Summary Card */}
            <div className="rounded-3xl border border-[#2a2723] bg-[#1f1d19] p-4 flex items-center justify-between gap-4 hover:border-[#d4a373]/10 transition-all duration-300">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-[#a8a29e] uppercase tracking-widest">
                  Weekly Consistency
                </h4>
                <p className="text-lg font-black text-[#f2efeb]">
                  {overallStats.rate}% Complete
                </p>
                <p className="text-[10px] text-[#a8a29e]/60">
                  {overallStats.completed} of {overallStats.scheduled} scheduled entries completed this rolling week.
                </p>
              </div>
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-14 h-14" viewBox="0 0 36 36">
                  <path
                    className="text-[#2a2723]"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#d4a373] transition-all duration-500 ease-out"
                    strokeDasharray={`${overallStats.rate}, 100`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <text
                    x="18"
                    y="20.35"
                    className="text-[9px] font-black fill-[#f2efeb]"
                    textAnchor="middle"
                  >
                    {overallStats.rate}%
                  </text>
                </svg>
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              {habits.map((habit: HabitWithLogs) => {
                const todayLog = habit.recentLogs?.find((l: HabitLog) => l.dateString === todayDateString);

                return (
                  <motion.div
                    key={habit._id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="rounded-3xl border border-[#2a2723] bg-[#1f1d19] p-5 space-y-4 hover:border-[#d4a373]/20 transition-all duration-300 group"
                  >
                    {/* Header section with Flame icon and title */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[#f2efeb] text-sm truncate">{habit.name}</h3>
                        {habit.description && (
                          <p className="text-xs text-[#a8a29e] mt-1 line-clamp-2 leading-relaxed">
                            {habit.description}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2 items-center">
                          <span className="text-[9px] bg-[#2a2723] text-[#a8a29e] px-2 py-0.5 rounded-full font-medium tracking-wide uppercase">
                            {habit.frequency === "daily" ? "Daily" : "Custom"}
                          </span>
                          {habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek && (
                            <span className="text-[10px] text-[#a8a29e]/60 font-medium">
                              {habit.frequencyConfig.daysOfWeek
                                .map((d: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
                                .join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1">
                          {/* Pin to Chat button */}
                          {onReferHabit && (
                            <button
                              type="button"
                              onClick={() => onReferHabit(habit)}
                              className="p-1.5 rounded-xl text-[#a8a29e]/40 hover:text-[#d4a373] hover:bg-[#d4a373]/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
                              title="Pin to chat"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit Routine button */}
                          <button
                            type="button"
                            onClick={() => setSelectedHabitForEdit(habit)}
                            className="p-1.5 rounded-xl text-[#a8a29e]/40 hover:text-[#d4a373] hover:bg-[#d4a373]/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
                            title="Edit routine"
                          >
                            <PencilLine className="w-3.5 h-3.5" />
                          </button>

                          {/* Streak Counter */}
                          <div className="flex items-center gap-1 bg-[#d4a373]/10 text-[#d4a373] px-2.5 py-1 rounded-2xl border border-[#d4a373]/10">
                            <Flame className="w-3.5 h-3.5 fill-current" />
                            <span className="text-xs font-black leading-none">{habit.currentStreak}</span>
                            <span className="text-[9px] text-[#d4a373]/50 font-bold ml-0.5 leading-none">
                              /{habit.longestStreak}
                            </span>
                          </div>
                        </div>

                        {/* Rolling Weekly Completion Rate Badge */}
                        {habit.weeklyStats && (
                          <div
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-xl border text-[10px] font-bold transition-all duration-300 ${
                              (habit.weeklyRate ?? 0) >= 80
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : (habit.weeklyRate ?? 0) >= 50
                                ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                                : "text-red-400 bg-red-500/10 border-red-500/20"
                            }`}
                          >
                            <svg className="w-2.5 h-2.5" viewBox="0 0 36 36">
                              <path
                                className="opacity-25"
                                strokeWidth="4"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                strokeLinecap="round"
                                strokeDasharray={`${habit.weeklyRate ?? 0}, 100`}
                                strokeWidth="4"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <span>{habit.weeklyStats.completed}/{habit.weeklyStats.scheduled} this week</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 30-Day Contribution Grid */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] font-bold text-[#a8a29e]/40 uppercase tracking-widest px-0.5">
                        <span>30 days ago</span>
                        <span>Today</span>
                      </div>
                      <div
                        ref={(el) => {
                          gridRefs.current[habit._id] = el;
                        }}
                        className="overflow-x-auto scrollbar-hide flex gap-1 p-1 rounded-xl bg-[#0f0e0c]/50 border border-[#2a2723]/30 w-full"
                      >
                        {last30Days.map((day: Date, idx: number) => {
                          const dateStr = formatDateString(day);
                          const log = habit.recentLogs?.find((l: HabitLog) => l.dateString === dateStr);
                          const isToday = dateStr === todayDateString;
                          const dayOfWeek = day.getDay();
                          const isScheduled =
                            habit.frequency === "daily" ||
                            (habit.frequency === "custom" &&
                              habit.frequencyConfig?.daysOfWeek?.includes(dayOfWeek));

                          // Tooltip text build
                          const formattedDate = format(day, "EEE, MMM d");
                          let tooltipText = `${formattedDate}`;
                          if (log) {
                            tooltipText += ` - ${log.status === "completed" ? "Completed" : "Skipped (Freeze)"}`;
                          } else if (isToday) {
                            tooltipText += ` - ${isScheduled ? "Pending today" : "Unscheduled today"}`;
                          } else if (isScheduled) {
                            tooltipText += ` - Missed`;
                          } else {
                            tooltipText += ` - Unscheduled`;
                          }

                          // Cell styles definition
                          let cellClass = "w-3 h-3 rounded-[3px] flex-shrink-0 transition-all duration-300 ";
                          if (log) {
                            if (log.status === "completed") {
                              cellClass += "bg-[#d4a373] shadow-[0_0_8px_rgba(212,163,115,0.3)]";
                            } else {
                              cellClass += "bg-[#5c554f] border border-[#5c554f]/50";
                            }
                          } else if (isToday) {
                            if (isScheduled) {
                              cellClass += "border border-[#d4a373] animate-pulse bg-transparent";
                            } else {
                              cellClass += "border border-dashed border-[#2a2723] bg-transparent";
                            }
                          } else if (isScheduled) {
                            cellClass += "bg-[#2a2723] hover:bg-[#3d3832]";
                          } else {
                            cellClass += "bg-transparent border border-dashed border-[#2a2723]/40";
                          }

                          return (
                            <div
                              key={idx}
                              className={`${cellClass} relative group/cell`}
                              title={tooltipText}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Log actions section */}
                    <div className="flex flex-col gap-2 pt-2.5 border-t border-[#2a2723]/30">
                      <div className="flex items-center justify-between text-[10px] text-[#a8a29e]/60 font-medium">
                        <span>Today's status</span>
                        {todayLog ? (
                          <span
                            className={`font-black uppercase tracking-wider ${
                              todayLog.status === "completed" ? "text-[#d4a373]" : "text-[#a8a29e]"
                            }`}
                          >
                            {todayLog.status}
                          </span>
                        ) : (
                          <span className="text-[#a8a29e]/40 italic">Pending</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={() => handleLog(habit._id, "completed")}
                          disabled={loggingId !== null}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-1.5 ${
                            todayLog?.status === "completed"
                              ? "bg-[#d4a373] text-[#1a1814] shadow-lg shadow-[#d4a373]/10"
                              : "border border-[#d4a373]/20 text-[#d4a373] hover:bg-[#d4a373]/10 hover:border-[#d4a373]/40"
                          } disabled:opacity-50`}
                        >
                          {loggingId === `${habit._id}-completed` ? (
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Complete
                        </button>

                        <button
                          onClick={() => handleLog(habit._id, "skipped")}
                          disabled={loggingId !== null}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-1.5 ${
                            todayLog?.status === "skipped"
                              ? "bg-[#5c554f] text-[#f2efeb]"
                              : "border border-[#2a2723] text-[#a8a29e] hover:bg-[#2a2723] hover:text-[#f2efeb]"
                          } disabled:opacity-50`}
                        >
                          {loggingId === `${habit._id}-skipped` ? (
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <CircleSlash className="w-3.5 h-3.5" />
                          )}
                          Skip
                        </button>
                      </div>

                      {/* Notes input — shown only when today has a log */}
                      <AnimatePresence>
                        {todayLog && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden relative"
                          >
                            {todayLog.notes ? (
                              <div className="flex items-start gap-2 mt-1">
                                <PencilLine className="w-3 h-3 text-[#a8a29e]/40 mt-0.5 shrink-0" />
                                <p className="text-[11px] text-[#a8a29e]/70 italic leading-relaxed flex-1">
                                  {todayLog.notes}
                                </p>
                              </div>
                            ) : null}
                            <textarea
                              rows={1}
                              placeholder="Add a note for today..."
                              value={notesInput[habit._id] ?? (todayLog.notes || "")}
                              onChange={(e) =>
                                setNotesInput((prev) => ({ ...prev, [habit._id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveNotes(habit._id, todayLog.status);
                                }
                              }}
                              onBlur={() => {
                                const draft = notesInput[habit._id]?.trim();
                                if (draft && draft !== todayLog.notes) {
                                  handleSaveNotes(habit._id, todayLog.status);
                                }
                              }}
                              className="w-full mt-1.5 bg-[#0f0e0c]/50 border border-[#2a2723]/50 rounded-xl px-3 py-2 text-[11px] text-[#a8a29e] placeholder:text-[#a8a29e]/30 resize-none focus:outline-none focus:border-[#d4a373]/30 focus:text-[#f2efeb] transition-all duration-200"
                              disabled={savingNotesId === habit._id}
                            />
                            <AnimatePresence>
                              {noteSavedToast === habit._id && (
                                <motion.div
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="absolute -top-2 right-2 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-wider"
                                >
                                  Note Updated!
                                </motion.div>
                              )}
                            </AnimatePresence>
                            {savingNotesId === habit._id && (
                              <p className="text-[10px] text-[#a8a29e]/40 mt-1">Saving...</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Overlay Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateHabitModal
            activeWorkspaceId={activeWorkspaceId}
            isLargeViewport={isLargeViewport}
            onClose={() => setIsCreateModalOpen(false)}
          />
        )}
        {selectedHabitForEdit && (
          <EditHabitModal
            habit={selectedHabitForEdit}
            isLargeViewport={isLargeViewport}
            onClose={() => setSelectedHabitForEdit(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}




