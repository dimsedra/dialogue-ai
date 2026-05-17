import { motion } from "framer-motion";
import { format } from "date-fns";
import { Clock, Calendar as CalendarIcon, Tag, Zap, Edit3, Trash2, RefreshCw } from "lucide-react";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { EventDoc } from "./types";
import { formatRecurrenceText } from "./utils";

interface EventListProps {
  events: Doc<"events">[] | undefined;
  workspaces: Doc<"workspaces">[] | undefined;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  isLargeViewport: boolean;
  onEditEvent: (data: { id: Id<"events">; event: EventDoc; timestamp: number }) => void;
  onDeleteEvent: (event: EventDoc) => void;
}

export function EventList({
  events,
  workspaces,
  activeWorkspaceId,
  isLargeViewport,
  onEditEvent,
  onDeleteEvent,
}: EventListProps) {
  return (
    <motion.div
      key="events"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={isLargeViewport ? undefined : { duration: 0 }}
      className="space-y-3"
    >
      {events?.map((event) => {
        const eventWorkspace = workspaces?.find((w) => w._id === event.workspaceId);
        return (
          <motion.div
            key={`${event._id}_${event.startTime}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={isLargeViewport ? undefined : { duration: 0 }}
            className="p-4 rounded-2xl bg-[#1f1d19] border border-[#2a2723] hover:border-[#d4a373]/20 transition-all group"
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex flex-col gap-1 flex-1">
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
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                    style={{
                      backgroundColor: !activeWorkspaceId && eventWorkspace ? eventWorkspace.color : "#d4a373",
                    }}
                  />
                  <span className="text-xs text-[#f2efeb] font-bold tracking-tight">{event.title}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditEvent({ id: event._id, event: event as EventDoc, timestamp: event.startTime });
                    }}
                    className="p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEvent(event as EventDoc);
                    }}
                    className="p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {(event.eventType === "point" || !event.endTime) && <Zap className="w-2.5 h-2.5 text-amber-400" />}
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest whitespace-nowrap ${
                      event.eventType === "point" || !event.endTime ? "text-amber-400" : "text-[#d4a373]/60"
                    }`}
                  >
                    {event.eventType === "point" || !event.endTime ? "Release / Drop" : "Event"}
                  </span>
                </div>
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
                  {format(new Date(event.startTime), "HH:mm")}
                  {event.eventType !== "point" && event.endTime ? ` - ${format(new Date(event.endTime), "HH:mm")}` : ""}
                </span>
                <span className="text-[8px] opacity-50 font-bold ml-1 uppercase tracking-tighter">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ")}
                </span>
              </div>
              {event.recurrence && (
                <div className="flex items-center gap-1 text-[#d4a373]">
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span className="capitalize font-bold">{formatRecurrenceText(event.recurrence)}</span>
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
              <p className="mt-2 text-[10px] text-[#a8a29e]/40 italic leading-relaxed">{event.description}</p>
            )}
          </motion.div>
        );
      })}

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
  );
}
