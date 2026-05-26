import { Calendar as CalendarIcon, Clock, Grid, ListTodo, Sparkles, ChevronRight, Flame } from "lucide-react";

interface PanelHeaderProps {
  view: "tasks" | "events" | "calendar" | "habits";
  setView: (view: "tasks" | "events" | "calendar" | "habits") => void;
  onClose?: () => void;
  onSync?: () => void;
}

export function PanelHeader({ view, setView, onClose, onSync }: PanelHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#d4a373]/10 flex items-center justify-center">
            {view === "tasks" ? (
              <ListTodo className="w-5 h-5 text-[#d4a373]" />
            ) : view === "events" ? (
              <Clock className="w-5 h-5 text-[#d4a373]" />
            ) : view === "calendar" ? (
              <CalendarIcon className="w-5 h-5 text-[#d4a373]" />
            ) : (
              <Flame className="w-5 h-5 text-[#d4a373]" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#f2efeb]">
              {view === "tasks" ? "Tasks" : view === "events" ? "Events" : view === "calendar" ? "Calendar" : "Habits"}
            </h2>
            <p className="text-[9px] text-[#a8a29e] uppercase tracking-widest font-bold">
              {view === "tasks" ? "Focus List" : view === "events" ? "Schedule" : view === "calendar" ? "Timeline" : "Routines"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-[#0f0e0c] p-1 rounded-xl border border-[#2a2723]">
            <button
              onClick={() => setView("tasks")}
              className={`p-1.5 rounded-lg transition-all ${
                view === "tasks" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"
              }`}
              title="Task List"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("events")}
              className={`p-1.5 rounded-lg transition-all ${
                view === "events" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"
              }`}
              title="Event List"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`p-1.5 rounded-lg transition-all ${
                view === "calendar" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"
              }`}
              title="Calendar View"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("habits")}
              className={`p-1.5 rounded-lg transition-all ${
                view === "habits" ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"
              }`}
              title="Habits Tracker"
            >
              <Flame className="w-3.5 h-3.5" />
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
        <button
          onClick={() => onSync?.()}
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
      )}
    </>
  );
}
