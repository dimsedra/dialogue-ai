import { CheckCircle2, Tag, Clock, Edit3, Check, Trash2, Zap, CalendarDays, MapPin, Search, Sparkles, RefreshCw, Flame, Award, List, FileText, Layers } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { ToolCall, TaskToolArgs, EventToolArgs } from "./types";
import { DiffView } from "./DiffView";

import { formatRecurrenceText } from "../panel/utils";

export function ToolCard({ toolCall }: { toolCall: ToolCall }) {
  if (!toolCall) return null;

  // --- Task Tools ---
  if (toolCall.name === "addTask") {
    const { text, dueDate, priority, category } = toolCall.args as { 
      text: string; 
      dueDate?: string; 
      priority?: string; 
      category?: string; 
    };
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-[#d4a373]/5 border border-[#d4a373]/10 space-y-2.5 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#d4a373]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Task Created</span>
          </div>
          {priority && (
            <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border ${
              priority === "high" ? "bg-red-500/10 border-red-500/20 text-red-400" :
              priority === "medium" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
              "bg-blue-500/10 border-blue-500/20 text-blue-400"
            }`}>
              {priority}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm text-[#f2efeb] font-semibold leading-snug">{text}</p>
          <div className="flex flex-wrap gap-3">
            {category && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#a8a29e] font-medium">
                <Tag className="w-3 h-3 text-[#d4a373]/60" />
                {category}
              </div>
            )}
            {dueDate && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#d4a373] font-bold">
                <Clock className="w-3 h-3" />
                {format(parseISO(dueDate), "MMM d, HH:mm")}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "updateTask") {
    const { titleHint, oldValues, text, priority, category, dueDate } = toolCall.args as unknown as TaskToolArgs;
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-orange-500/5 border border-orange-500/10 space-y-2.5 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-orange-400">
            <Edit3 className="w-3.5 h-3.5" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Task Updated</span>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] text-[#f2efeb] font-semibold truncate opacity-90">{titleHint || text}</p>
          <div className="bg-black/20 rounded-xl p-2.5 border border-white/5 space-y-0.5">
            <DiffView label="Title" oldVal={oldValues?.text} newVal={text} />
            <DiffView label="Priority" oldVal={oldValues?.priority} newVal={priority} type="priority" />
            <DiffView label="Category" oldVal={oldValues?.category} newVal={category} />
            <DiffView label="Due Date" oldVal={oldValues?.dueDate} newVal={dueDate ? parseISO(dueDate).getTime() : undefined} type="date" />
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "completeTask") {
    const { titleHint } = toolCall.args as { titleHint?: string };
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-3 p-2.5 pr-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-3 shadow-md shadow-black/10 w-fit max-w-full"
      >
        <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
          <Check className="w-4 h-4 stroke-3" />
        </div>
        <div className="min-w-0">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-500/60 block">Done</span>
          <p className="text-[13px] text-[#f2efeb] font-bold truncate">{titleHint || "Task Finished"}</p>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "deleteTask") {
    const { titleHint } = toolCall.args as { titleHint?: string };
    return (
      <motion.div 
        initial={{ opacity: 0, x: -5 }}
        animate={{ opacity: 1, x: 0 }}
        className="mt-3 p-2.5 pr-4 rounded-2xl bg-slate-500/5 border border-slate-500/10 flex items-center gap-3 opacity-80 w-fit max-w-full"
      >
        <div className="p-1.5 rounded-lg bg-slate-500/10 text-slate-400 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500/60 block">Removed</span>
          <p className="text-[12px] text-[#a8a29e] font-medium truncate line-through">{titleHint || "Deleted Task"}</p>
        </div>
      </motion.div>
    );
  }

  // --- Event Tools ---
  if (toolCall.name === "addEvent") {
    const { title, startTime, endTime, eventType, location, recurrence } = toolCall.args as { 
      title: string; 
      startTime: string; 
      endTime?: string;
      eventType?: "interval" | "point";
      location?: string;
      recurrence?: { frequency: string; interval: number; daysOfWeek?: number[]; until?: string | number };
    };
    const isPoint = eventType === "point" || (!eventType && !endTime);
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mt-3 p-3.5 rounded-2xl ${isPoint ? 'bg-amber-500/5 border-amber-500/10' : 'bg-[#8b5cf6]/5 border-[#8b5cf6]/10'} border space-y-2.5 shadow-lg shadow-black/10 max-w-100`}
      >
        <div className={`flex items-center gap-2 ${isPoint ? 'text-amber-400' : 'text-[#8b5cf6]'}`}>
          {isPoint ? <Zap className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">{isPoint ? "Momentary Event Scheduled" : "Event Scheduled"}</span>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-[#f2efeb] font-semibold leading-snug">{title}</p>
          <div className="flex flex-wrap gap-3 items-center">
            <div className={`flex items-center gap-1.5 text-[10px] ${isPoint ? 'text-amber-400' : 'text-[#8b5cf6]'} font-bold`}>
              <Clock className="w-3 h-3" />
              {(() => {
                const s = startTime;
                const match = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
                if (match) {
                  const [, y, m, d, h, min] = match;
                  return format(new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)), "MMM d, HH:mm");
                }
                return format(parseISO(s), "MMM d, HH:mm");
              })()}
              {!isPoint && endTime && (
                <>
                  <span className="text-[#a8a29e] font-normal">→</span>
                  <span>{(() => {
                    const match = endTime.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
                    if (match) {
                      const [, y, m, d, h, min] = match;
                      return format(new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)), "HH:mm");
                    }
                    return format(parseISO(endTime), "HH:mm");
                  })()}</span>
                </>
              )}
            </div>
            {recurrence && (
              <div className="flex items-center gap-1 text-[10px] text-[#8b5cf6] font-semibold bg-[#8b5cf6]/15 px-2 py-0.5 rounded-full border border-[#8b5cf6]/20">
                <RefreshCw className="w-2.5 h-2.5" />
                <span>{formatRecurrenceText(recurrence)}</span>
              </div>
            )}
            {location && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#a8a29e] font-medium">
                <MapPin className="w-3 h-3 text-[#8b5cf6]/60" />
                {location}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "updateEvent") {
    const { titleHint, oldValues, title, startTime, endTime, location } = toolCall.args as unknown as EventToolArgs;
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-2.5 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center gap-2 text-indigo-400">
          <CalendarDays className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Event Updated</span>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] text-[#f2efeb] font-semibold truncate opacity-90">{titleHint || title}</p>
          <div className="bg-black/20 rounded-xl p-2.5 border border-white/5 space-y-0.5">
            <DiffView label="Title" oldVal={oldValues?.title} newVal={title} />
            <DiffView label="Start" oldVal={oldValues?.startTime} newVal={startTime ? parseISO(startTime).getTime() : undefined} type="date" />
            <DiffView label="End" oldVal={oldValues?.endTime} newVal={endTime ? parseISO(endTime).getTime() : undefined} type="date" />
            <DiffView label="Location" oldVal={oldValues?.location} newVal={location} />
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "updateEventOccurrence") {
    const { titleHint, originalStartTime, startTime, title, location } = toolCall.args as {
      titleHint?: string;
      originalStartTime: string;
      startTime?: string;
      title?: string;
      location?: string;
    };
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2.5 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center gap-2 text-amber-400">
          <CalendarDays className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Occurrence Rescheduled</span>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] text-[#f2efeb] font-semibold truncate opacity-90">{titleHint || title || "Event Schedule Modified"}</p>
          <div className="bg-black/20 rounded-xl p-2.5 border border-white/5 space-y-1">
            <div className="text-[11px] text-[#a8a29e] flex items-center gap-1.5">
              <span className="text-amber-400/80 font-semibold">Original:</span>
              <span>{format(parseISO(originalStartTime), "MMM d, yyyy (HH:mm)")}</span>
            </div>
            {startTime && (
              <div className="text-[11px] text-[#a8a29e] flex items-center gap-1.5 font-bold">
                <span className="text-emerald-400">Rescheduled To:</span>
                <span className="text-[#f2efeb]">{format(parseISO(startTime), "MMM d, yyyy (HH:mm)")}</span>
              </div>
            )}
            {location && (
              <div className="text-[11px] text-[#a8a29e] flex items-center gap-1.5 font-medium">
                <MapPin className="w-3 h-3 text-amber-400/60" />
                <span>{location}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "deleteEvent") {
    const { titleHint } = toolCall.args as { titleHint?: string };
    return (
      <motion.div 
        initial={{ opacity: 0, x: 5 }}
        animate={{ opacity: 1, x: 0 }}
        className="mt-3 p-2.5 pr-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex items-center gap-3 opacity-80 w-fit max-w-full"
      >
        <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
          <CalendarDays className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-rose-500/60 block">Cancelled</span>
          <p className="text-[12px] text-[#a8a29e] font-medium truncate line-through">{titleHint || "Deleted Event"}</p>
        </div>
      </motion.div>
    );
  }

  // --- Other Tools ---
  if (toolCall.name === "searchWeb" || toolCall.name === "multiSearch") {
    const isMulti = toolCall.name === "multiSearch";
    const query = !isMulti ? (toolCall.args as { query: string }).query : undefined;
    const count = isMulti ? (toolCall.args as { count: number }).count : 1;
    
    return (
      <div className="mt-2 flex items-center gap-2.5 py-1.5 px-3 rounded-full bg-[#3b82f6]/3 border border-[#3b82f6]/10 w-fit">
        <Search className="w-3 h-3 text-[#3b82f6]/60" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#3b82f6]/80 whitespace-nowrap">
          {isMulti ? `${count} Research Queries` : "Researching"}
        </span>
        {query && (
          <>
            <div className="w-px h-2 bg-[#3b82f6]/20" />
            <span className="text-[9px] text-[#a8a29e]/60 truncate max-w-37.5 font-medium">&quot;{query}&quot;</span>
          </>
        )}
      </div>
    );
  }

  if (toolCall.name === "updateUserBio") {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-3 flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/3 border border-emerald-500/10 shadow-sm"
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/10">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <span className="text-[11px] text-[#a8a29e] font-medium">
          Profile bio updated.
        </span>
      </motion.div>
    );
  }

  if (toolCall.name === "saveSemanticMemory") {
    const { text } = toolCall.args as { text: string };
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-3 flex flex-col gap-1.5 p-3 rounded-2xl bg-emerald-500/3 border border-emerald-500/10 shadow-sm max-w-100"
      >
        <div className="flex items-center gap-2 text-emerald-500">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Memory Retained</span>
        </div>
        <p className="text-[12px] text-[#a8a29e] italic leading-relaxed">
          &quot;{text}&quot;
        </p>
      </motion.div>
    );
  }

  if (toolCall.name === "searchHistoricalEntities") {
    const result = toolCall.result as { count?: number; results?: Array<{ type: string; text?: string; title?: string }> } | undefined;
    const count = result?.count ?? 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-[#3b82f6]/5 border border-[#3b82f6]/10 space-y-2 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center gap-2 text-[#3b82f6]">
          <Search className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Historical Search</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/10 text-[#3b82f6]/80 font-bold">{count} found</span>
        </div>
        {result?.results && result.results.length > 0 && (
          <div className="space-y-1 max-h-30 overflow-y-auto">
            {result.results.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-[#a8a29e]">
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${item.type === "task" ? "bg-emerald-500/10 text-emerald-400" : "bg-[#8b5cf6]/10 text-[#8b5cf6]"}`}>
                  {item.type}
                </span>
                <span className="truncate">{item.text || item.title}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  if (toolCall.name === "batchAddTasks") {
    const result = toolCall.result as { count?: number; ids?: string[] } | undefined;
    const args = toolCall.args as { tasks?: Array<{ text: string }> } | undefined;
    const count = result?.count ?? args?.tasks?.length ?? 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-[#d4a373]/5 border border-[#d4a373]/10 space-y-2 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center gap-2 text-[#d4a373]">
          <List className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Tasks Added</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#d4a373]/10 text-[#d4a373]/80 font-bold">{count}</span>
        </div>
        {args?.tasks && args.tasks.length > 0 && (
          <ul className="space-y-0.5">
            {args.tasks.map((t, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px] text-[#a8a29e]">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                <span className="truncate">{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    );
  }

  if (toolCall.name === "getTaskNotes") {
    const result = toolCall.result as { titleHint?: string; hasNotes?: boolean; notes?: string | null } | undefined;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 space-y-2 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center gap-2 text-cyan-400">
          <FileText className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Task Notes</span>
        </div>
        <p className="text-[12px] text-[#f2efeb] font-semibold truncate">{result?.titleHint || "Task"}</p>
        {result?.hasNotes ? (
          <p className="text-[11px] text-[#a8a29e] italic leading-relaxed line-clamp-4 whitespace-pre-wrap">{result.notes}</p>
        ) : (
          <p className="text-[11px] text-[#a8a29e]/60 italic">No notes recorded yet.</p>
        )}
      </motion.div>
    );
  }

  if (toolCall.name === "listWorkspaces") {
    const result = toolCall.result as { workspaces?: Array<{ name: string; color?: string; _id: string }> } | undefined;
    const workspaces = result?.workspaces ?? [];
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-2 shadow-lg shadow-black/10 max-w-100"
      >
        <div className="flex items-center gap-2 text-indigo-400">
          <Layers className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Workspaces</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400/80 font-bold">{workspaces.length}</span>
        </div>
        {workspaces.length > 0 && (
          <div className="space-y-1">
            {workspaces.map((w) => (
              <div key={w._id} className="flex items-center gap-2 text-[11px] text-[#a8a29e]">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color || "#d4a373" }} />
                <span>{w.name}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  if (toolCall.name === "create_habit") {
    const { name, frequency, description } = toolCall.args as {
      name: string;
      frequency: string;
      description?: string;
    };
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 p-3.5 rounded-2xl bg-[#d4a373]/5 border border-[#d4a373]/10 space-y-2 max-w-100 shadow-lg shadow-black/10"
      >
        <div className="flex items-center gap-2 text-[#d4a373]">
          <Flame className="w-3.5 h-3.5" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Habit Created</span>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-[#f2efeb] font-semibold leading-snug capitalize">{name}</p>
          <span className="text-[9px] font-bold uppercase tracking-wider bg-[#d4a373]/10 px-2 py-0.5 rounded-full border border-[#d4a373]/20 text-[#d4a373] inline-block">
            {frequency}
          </span>
          {description && (
            <p className="text-[11px] text-[#a8a29e] leading-relaxed italic">{description}</p>
          )}
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "log_habit") {
    const { status, dateString, notes } = toolCall.args as {
      status: "completed" | "skipped";
      dateString: string;
      notes?: string;
    };
    const titleHint = (toolCall.args as any).titleHint ?? "Habit";
    const result = toolCall.result as { newStreak?: number } | undefined;
    const streak = result?.newStreak ?? 0;
    const isCompleted = status === "completed";

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`mt-3 p-3 rounded-2xl border flex items-center gap-3 shadow-md shadow-black/10 max-w-100 ${
          isCompleted ? "bg-emerald-500/5 border-emerald-500/10" : "bg-slate-500/5 border-slate-500/10"
        }`}
      >
        <div className={`p-1.5 rounded-xl shrink-0 ${
          isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"
        }`}>
          <Flame className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className={`text-[8px] font-black uppercase tracking-[0.2em] block ${
            isCompleted ? "text-emerald-500" : "text-slate-400"
          }`}>
            Habit {status} ({dateString})
          </span>
          <p className="text-[13px] text-[#f2efeb] font-bold truncate capitalize">{titleHint}</p>
          {notes && (
            <p className="text-[10px] text-[#a8a29e] italic truncate">{notes}</p>
          )}
        </div>
        {isCompleted && streak > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-orange-400 font-bold shrink-0 bg-orange-400/10 px-2 py-0.5 rounded-full border border-orange-400/20">
            <Flame className="w-3 h-3 fill-orange-400 animate-pulse" />
            <span>{streak}d</span>
          </div>
        )}
      </motion.div>
    );
  }

  return null;
}
