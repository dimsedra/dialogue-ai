import { format } from "date-fns";
import { motion } from "framer-motion";
import { DayPicker } from "react-day-picker";
import { Calendar as CalendarIcon, Clock, Edit3, RefreshCw, Tag, Trash2, Zap } from "lucide-react";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { EventDoc } from "./types";

interface CalendarViewProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  taskDates: Date[];
  eventDates: Date[];
  tasksOnSelectedDate: Doc<"tasks">[];
  eventsOnSelectedDate: Doc<"events">[];
  workspaces: Doc<"workspaces">[] | undefined;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  isLargeViewport: boolean;
  onEditEvent: (data: { id: Id<"events">; event: EventDoc; timestamp: number }) => void;
  onDeleteEvent: (event: EventDoc) => void;
  onDeleteTask: (id: Id<"tasks">) => void;
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
}: CalendarViewProps) {
  return (
    <motion.div
      key="calendar"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={isLargeViewport ? undefined : { duration: 0 }}
      className="space-y-6"
    >
      <div className="relative p-4 bg-[#1f1d19] rounded-3xl border border-[#2a2723] flex justify-center shadow-xl shadow-black/20">
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          modifiers={{
            hasTask: taskDates,
            hasEvent: eventDates,
          }}
          modifiersClassNames={{
            hasTask: "has-task-dot",
            hasEvent: "has-event-dot",
          }}
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
              {tasksOnSelectedDate.length + eventsOnSelectedDate.length}{" "}
              {tasksOnSelectedDate.length + eventsOnSelectedDate.length === 1 ? "Item" : "Items"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {/* Events Section */}
          {eventsOnSelectedDate.map((event: Doc<"events">) => {
            const eventWorkspace = workspaces?.find((w) => w._id === event.workspaceId);
            return (
              <div
                key={`${event._id}_${event.startTime}`}
                className="p-4 rounded-2xl bg-[#1f1d19] border border-[#d4a373]/20 flex flex-col gap-2 group hover:bg-[#d4a373]/5 transition-all"
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
                      <span className="text-xs text-[#f2efeb] font-bold tracking-tight">{event.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
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
                        {(event.eventType === "point" || !event.endTime) && (
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                        )}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-widest ${
                            event.eventType === "point" || !event.endTime ? "text-amber-400" : "text-[#d4a373]/60"
                          }`}
                        >
                          {event.eventType === "point" || !event.endTime ? "Release / Drop" : "Event"}
                        </span>
                      </div>
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
          {tasksOnSelectedDate.map((task: Doc<"tasks">) => (
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTask(task._id);
                  }}
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
  );
}
