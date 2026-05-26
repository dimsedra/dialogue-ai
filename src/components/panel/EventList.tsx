import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Clock, Calendar as CalendarIcon, Tag, Zap, Edit3, Trash2, RefreshCw, ChevronDown, ChevronUp, MessageSquarePlus, Paperclip, MoreVertical } from "lucide-react";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { EventDoc } from "./types";
import { formatRecurrenceText } from "./utils";
import { ResourceTray } from "./ResourceTray";

interface EventListProps {
  events: Doc<"events">[] | undefined;
  workspaces: Doc<"workspaces">[] | undefined;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  isLargeViewport: boolean;
  onEditEvent: (data: { id: Id<"events">; event: EventDoc; timestamp: number }) => void;
  onDeleteEvent: (event: EventDoc) => void;
  onReferEvent?: (event: EventDoc) => void;
}

export function EventList({
  events,
  workspaces,
  activeWorkspaceId,
  isLargeViewport,
  onEditEvent,
  onDeleteEvent,
  onReferEvent,
}: EventListProps) {
  const [showPast, setShowPast] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [dropdownEventId, setDropdownEventId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!dropdownEventId) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-dropdown]")) {
        setDropdownEventId(null);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [dropdownEventId]);
  const sevenDaysAgo = useMemo(() => now - 7 * 24 * 60 * 60 * 1000, [now]);

  const { upcoming, past } = useMemo(() => {
    if (!events) return { upcoming: [], past: [] };

    const upcomingList: Doc<"events">[] = [];
    const pastList: Doc<"events">[] = [];

    for (const event of events) {
      const timeMarker = event.endTime ?? event.startTime;
      if (timeMarker >= now) {
        upcomingList.push(event);
      } else if (timeMarker >= sevenDaysAgo) {
        pastList.push(event);
      }
    }

    // Sort upcoming ascending (soonest first)
    upcomingList.sort((a, b) => a.startTime - b.startTime);
    // Sort past descending (most recent first)
    pastList.sort((a, b) => b.startTime - a.startTime);

    return { upcoming: upcomingList, past: pastList };
  }, [events, now, sevenDaysAgo]);

  const renderEventCard = (event: Doc<"events">) => {
    const isCancelled = (event as any).cancelled === true;
    const eventWorkspace = workspaces?.find((w) => w._id === event.workspaceId);
    return (
      <motion.div
        key={`${event._id}_${event.startTime}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={isLargeViewport ? undefined : { duration: 0 }}
        className={`p-4 rounded-2xl border transition-all group cursor-pointer overflow-hidden ${
          isCancelled
            ? "bg-[#1f1d19] border-red-500/10 opacity-50 hover:opacity-80"
            : "bg-[#1f1d19] border-[#2a2723] hover:border-[#d4a373]/20"
        } ${expandedEventId === event._id ? "ring-1 ring-[#d4a373]/30" : ""}`}
        onClick={() => setExpandedEventId(expandedEventId === event._id ? null : event._id)}
      >
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex flex-col gap-1 flex-1 min-w-0 overflow-hidden">
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
              <span className={`text-xs font-bold tracking-tight truncate ${isCancelled ? "text-[#a8a29e]/40 line-through" : "text-[#f2efeb]"}`}>{event.title}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
              {onReferEvent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReferEvent(event as EventDoc);
                  }}
                  className="p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                  title="Pin this Event to Chat"
                >
                  <MessageSquarePlus className="w-3 h-3" />
                </button>
              )}
            </div>
            <div
              className="relative transition-all"
              style={dropdownEventId === event._id ? { opacity: 1 } : undefined}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownEventId(dropdownEventId === event._id ? null : event._id);
                }}
                className={`p-1 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all ${dropdownEventId !== event._id ? "opacity-100 lg:opacity-0 lg:group-hover:opacity-100" : ""}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {dropdownEventId === event._id && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-xl bg-[#1a1815] border border-[#2a2723] shadow-xl py-1 overflow-hidden"
                  data-dropdown
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownEventId(null);
                      onEditEvent({ id: event._id, event: event as EventDoc, timestamp: event.startTime });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#f2efeb] hover:bg-[#d4a373]/10 hover:text-[#d4a373] transition-colors text-left"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownEventId(null);
                      onDeleteEvent(event as EventDoc);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#f2efeb] hover:bg-red-500/10 hover:text-red-400 transition-colors text-left"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isCancelled ? (
                <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/60">Cancelled</span>
              ) : (
                <>
                  {(event.eventType === "point" || (!event.eventType && !event.endTime)) && <Zap className="w-2.5 h-2.5 text-amber-400" />}
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest whitespace-nowrap ${
                      event.eventType === "point" || (!event.eventType && !event.endTime) ? "text-amber-400" : "text-[#d4a373]/60"
                    }`}
                  >
                    {event.eventType === "point" || (!event.eventType && !event.endTime) ? "Release / Drop" : "Event"}
                  </span>
                </>
              )}
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
          {event.resources && event.resources.length > 0 && (
            <div className="flex items-center gap-1 text-[#a8a29e]/50">
              <Paperclip className="w-3 h-3" />
              <span className="text-[9px] font-bold">{event.resources.length}</span>
            </div>
          )}
        </div>

        {event.description && (
          <p className="mt-2 text-[10px] text-[#a8a29e]/40 italic leading-relaxed">{event.description}</p>
        )}

        {expandedEventId === event._id && event.resources && event.resources.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#2a2723]">
            <ResourceTray resources={event.resources} />
          </div>
        )}
      </motion.div>
    );
  };

  const isEmpty = upcoming.length === 0 && past.length === 0;

  return (
    <motion.div
      key="events"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={isLargeViewport ? undefined : { duration: 0 }}
      className="space-y-6"
    >
      {/* Upcoming Section */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8a29e]/40 px-1">
            Upcoming ({upcoming.length})
          </div>
          <div className="space-y-3">
            {upcoming.map(renderEventCard)}
          </div>
        </div>
      )}

      {/* Past Section */}
      {past.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#a8a29e]/40 hover:text-[#d4a373] transition-all px-1 py-1"
          >
            <span>Past - Last 7 Days ({past.length})</span>
            {showPast ? (
              <ChevronUp className="w-3 h-3 opacity-60" />
            ) : (
              <ChevronDown className="w-3 h-3 opacity-60" />
            )}
          </button>
          
          <AnimatePresence initial={false}>
            {showPast && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-3 overflow-hidden"
              >
                {past.map(renderEventCard)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {isEmpty && (
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
