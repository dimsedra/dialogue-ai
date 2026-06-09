import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Save, 
  Tag, 
  Trash2, 
  X, 
  Zap, 
  Bell, 
  Paperclip, 
  Upload, 
  Link, 
  Plus, 
  Check, 
  FolderKanban,
  FileText 
} from "lucide-react";
import { ConfirmEditRecurringData, EventDoc, EventUpdateData } from "./types";
import { usePbEventUpdate, usePbWorkspacesList } from "@/pb-compat";
interface EditEventModalProps {
  editingData: { id: string; event: EventDoc; timestamp: number };
  isLargeViewport: boolean;
  onSave: (id: string, updates: EventUpdateData) => Promise<void>;
  onSaveRecurring: (data: ConfirmEditRecurringData) => void;
  onDelete: (event: EventDoc) => void;
  onClose: () => void;
}

export function EditEventModal({
  editingData,
  isLargeViewport,
  onSave,
  onSaveRecurring,
  onDelete,
  onClose,
}: EditEventModalProps) {
  const { id, event, timestamp } = editingData;

  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDesc, setEditEventDesc] = useState("");
  const [editEventLocation, setEditEventLocation] = useState("");
  const [editEventStartTime, setEditEventStartTime] = useState("");
  const [editEventEndTime, setEditEventEndTime] = useState("");
  const [editEventType, setEditEventType] = useState<"interval" | "point">("interval");
  const [editEventFreq, setEditEventFreq] = useState<"none" | "daily" | "weekly">("none");
  const [editEventInterval, setEditEventInterval] = useState<number>(1);
  const [editEventDays, setEditEventDays] = useState<number[]>([]);
  const [editEventUntil, setEditEventUntil] = useState<string>("");
  const [editEventWorkspaceId, setEditEventWorkspaceId] = useState<string>("");
  const [editReminderOffset, setEditReminderOffset] = useState<string>("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Notes state
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteAddedToast, setNoteAddedToast] = useState(false);

  // Resources state
  const [resources, setResources] = useState<any[]>([]);
  const [resourceTab, setResourceTab] = useState<"url" | "upload">("url");
  const [newUrlTitle, setNewUrlTitle] = useState("");
  const [newUrlValue, setNewUrlValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const workspaces = usePbWorkspacesList();

  const updateEventMutation = usePbEventUpdate();

  const generateUploadUrl = async () => "";

  useEffect(() => {
    if (event) {
      const timer = setTimeout(() => {
        setEditEventTitle(event.title);
        setEditEventDesc(event.description || "");
        setEditEventLocation(event.location || "");
        setEditEventStartTime(format(new Date(event.startTime), "yyyy-MM-dd'T'HH:mm"));
        setEditEventEndTime(
          event.endTime
            ? format(new Date(event.endTime), "yyyy-MM-dd'T'HH:mm")
            : format(new Date(event.startTime + 3600000), "yyyy-MM-dd'T'HH:mm")
        );
        setEditEventType(event.eventType || (event.endTime ? "interval" : "point"));
        setEditEventWorkspaceId(event.workspace || "");
        setResources(event.resources || []);
        
        if (event.reminderOffset === undefined || event.reminderOffset === null) {
          setEditReminderOffset("none");
        } else {
          setEditReminderOffset(String(event.reminderOffset));
        }

        if (event.recurrence) {
          setEditEventFreq(event.recurrence.frequency);
          setEditEventInterval(event.recurrence.interval || 1);
          setEditEventDays(event.recurrence.daysOfWeek || []);
          setEditEventUntil(
            event.recurrence.until ? format(new Date(event.recurrence.until), "yyyy-MM-dd") : ""
          );
        } else {
          setEditEventFreq("none");
          setEditEventInterval(1);
          setEditEventDays([]);
          setEditEventUntil("");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [event]);

  const handleSave = async () => {
    if (isSubmitting || !editEventTitle.trim()) return;
    setIsSubmitting(true);
    try {
      let finalStartTime = 0;
      let finalEndTime = 0;

      if (editEventStartTime) {
        finalStartTime = new Date(editEventStartTime).getTime();
      }

      if (editEventType === "interval" && editEventEndTime) {
        finalEndTime = new Date(editEventEndTime).getTime();
      }

      const recurrenceRule =
        editEventFreq !== "none"
          ? {
              frequency: editEventFreq as "daily" | "weekly",
              interval: editEventInterval,
              daysOfWeek:
                editEventFreq === "weekly"
                  ? editEventDays.length > 0
                    ? editEventDays
                    : [new Date(finalStartTime).getDay()]
                  : undefined,
              until: editEventUntil ? new Date(editEventUntil).getTime() : undefined,
            }
          : null;

      const finalReminderOffset = editReminderOffset === "none" ? null : parseInt(editReminderOffset, 10);

      const updates: EventUpdateData = {
        title: editEventTitle,
        description: editEventDesc,
        location: editEventLocation,
        startTime: finalStartTime || undefined,
        endTime: editEventType === "interval" && finalEndTime ? finalEndTime : undefined,
        eventType: editEventType,
        recurrence: recurrenceRule,
        workspaceId: editEventWorkspaceId || null,
        reminderOffset: finalReminderOffset,
        resources: resources,
        overwriteResources: true,
      };

      if (event && event.recurrence && timestamp) {
        onSaveRecurring({ id, event, updates, timestamp });
        onClose();
        return;
      }

      await onSave(id, updates);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || isAddingNote) return;
    setIsAddingNote(true);
    try {
      await updateEventMutation({
        eventId: id,
        notes: newNote.trim(),
      });
      setNewNote("");
      setNoteAddedToast(true);
      setTimeout(() => setNoteAddedToast(false), 2000);
    } catch (err) {
      console.error("Failed to append note:", err);
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleLinkUrl = () => {
    if (!newUrlValue.trim()) return;
    const title = newUrlTitle.trim() || newUrlValue.trim().replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const newRes = {
      type: "url" as const,
      title,
      url: newUrlValue.trim().startsWith("http") ? newUrlValue.trim() : `https://${newUrlValue.trim()}`,
      linkedAt: Date.now(),
    };
    setResources((prev) => [...prev, newRes]);
    setNewUrlTitle("");
    setNewUrlValue("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();

      const convexSite = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");
      const fileUrl = `${convexSite}/api/storage?id=${storageId}`;

      const newRes = {
        type: "document" as const,
        title: file.name,
        url: fileUrl,
        storageId,
        linkedAt: Date.now(),
      };
      setResources((prev) => [...prev, newRes]);
    } catch (err) {
      console.error("File upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const parseNoteLine = (line: string) => {
    const match = line.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      return { timestamp: match[1], content: match[2] };
    }
    return { timestamp: null, content: line };
  };

  const noteLines = event.notes ? event.notes.split("\n").filter(Boolean) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-md p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: "100%", opacity: 0, scale: 0.95 }}
        transition={isLargeViewport ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#1a1814] border border-[#d4a373]/20 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto scrollbar-hide"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#2a2723]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#d4a373]/15 flex items-center justify-center text-[#d4a373]">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">Edit Event</h3>
              <span className="text-[10px] text-[#a8a29e]">Modify timing, settings, notes, and attachments</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Event Title</label>
            <input
              autoFocus
              name="panel-event-title"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-3 text-sm font-bold text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none transition-all"
              value={editEventTitle}
              onChange={(e) => setEditEventTitle(e.target.value)}
              placeholder="Event title..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Description</label>
            <textarea
              name="panel-event-desc"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={2}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-3 text-xs text-[#a8a29e] placeholder:text-[#a8a29e]/30 outline-none resize-none transition-all"
              value={editEventDesc}
              onChange={(e) => setEditEventDesc(e.target.value)}
              placeholder="Event notes or details..."
            />
          </div>

          {/* Workspace and Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Workspace</label>
              <div className="relative flex items-center">
                <FolderKanban className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <select
                  value={editEventWorkspaceId}
                  onChange={(e) => setEditEventWorkspaceId(e.target.value)}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all cursor-pointer appearance-none"
                >
                  <option value="">No Workspace</option>
                  {workspaces?.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Location</label>
              <div className="relative flex items-center">
                <Tag className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <input
                  name="panel-event-loc"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all"
                  value={editEventLocation}
                  onChange={(e) => setEditEventLocation(e.target.value)}
                  placeholder="Add location or link..."
                />
              </div>
            </div>
          </div>

          {/* Event Type & Notifications */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Event Type</label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditEventType("interval")}
                  className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1 ${
                    editEventType === "interval"
                      ? "bg-[#d4a373]/15 border-[#d4a373] text-[#d4a373]"
                      : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                  }`}
                >
                  Interval
                </button>
                <button
                  type="button"
                  onClick={() => setEditEventType("point")}
                  className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1 ${
                    editEventType === "point"
                      ? "bg-amber-500/15 border-amber-500 text-amber-400"
                      : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                  }`}
                >
                  Drop / Release
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Reminder Alert</label>
              <div className="relative flex items-center">
                <Bell className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <select
                  value={editReminderOffset}
                  onChange={(e) => setEditReminderOffset(e.target.value)}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all cursor-pointer appearance-none"
                >
                  <option value="none">No Reminder</option>
                  <option value="0">At time of event</option>
                  <option value="5">5 minutes before</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="120">2 hours before</option>
                  <option value="1440">1 day before</option>
                </select>
              </div>
            </div>
          </div>

          {/* Start and End Times */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">
                {editEventType === "point" ? "Moment" : "Start Time"}
              </label>
              <input
                type="datetime-local"
                name="panel-event-start"
                autoComplete="off"
                className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl px-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all appearance-none cursor-pointer"
                value={editEventStartTime}
                onChange={(e) => setEditEventStartTime(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              />
            </div>
            {editEventType === "interval" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">End Time</label>
                <input
                  type="datetime-local"
                  name="panel-event-end"
                  autoComplete="off"
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl px-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all appearance-none cursor-pointer"
                  value={editEventEndTime}
                  onChange={(e) => setEditEventEndTime(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                />
              </div>
            )}
          </div>

          {/* Recurrence Options */}
          <div className="space-y-2 pt-2 border-t border-[#2a2723]">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Recurrence</label>
            <div className="flex items-center gap-3">
              <select
                className="bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl px-3 py-2 text-xs text-[#f2efeb] outline-none cursor-pointer flex-1"
                value={editEventFreq}
                onChange={(e) => setEditEventFreq(e.target.value as "none" | "daily" | "weekly")}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {editEventFreq !== "none" && (
                <div className="flex items-center gap-2 bg-[#0f0e0c] border border-[#2a2723] rounded-xl px-3 py-2">
                  <span className="text-xs text-[#a8a29e]">Every</span>
                  <input
                    type="number"
                    name="panel-event-interval"
                    autoComplete="off"
                    min={1}
                    max={30}
                    className="w-12 bg-transparent text-xs text-[#f2efeb] font-bold outline-none text-center"
                    value={editEventInterval}
                    onChange={(e) => setEditEventInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <span className="text-xs text-[#a8a29e]">
                    {editEventFreq === "daily" ? "days" : "weeks"}
                  </span>
                </div>
              )}
            </div>
            {editEventFreq === "weekly" && (
              <div className="flex justify-between gap-1.5 pt-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (editEventDays.includes(idx)) {
                        setEditEventDays(editEventDays.filter((d) => d !== idx));
                      } else {
                        setEditEventDays([...editEventDays, idx]);
                      }
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                      editEventDays.includes(idx)
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] border border-[#2a2723] hover:border-[#d4a373]/30"
                    }`}
                  >
                    {dayName}
                  </button>
                ))}
              </div>
            )}
            {editEventFreq !== "none" && (
              <div className="space-y-1.5 pt-3 border-t border-[#2a2723]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">End Repeat (Optional)</label>
                <div className="relative flex items-center">
                  <CalendarIcon className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                  <input
                    type="date"
                    name="panel-event-until"
                    autoComplete="off"
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2 text-xs text-[#f2efeb] outline-none transition-all cursor-pointer appearance-none"
                    value={editEventUntil}
                    onChange={(e) => setEditEventUntil(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes Logs History */}
          <div className="space-y-2 pt-3 border-t border-[#2a2723] relative">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Notes & Logs History</label>
              <AnimatePresence>
                {noteAddedToast && (
                  <motion.span
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                  >
                    Note added!
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            
            {noteLines.length > 0 ? (
              <div className="space-y-3 max-h-36 overflow-y-auto pr-1 scrollbar-thin bg-[#0f0e0c]/40 border border-[#2a2723]/30 rounded-2xl p-3">
                {noteLines.map((line, idx) => {
                  const { timestamp, content } = parseNoteLine(line);
                  return (
                    <div key={idx} className="flex gap-2 text-xs">
                      <div className="flex flex-col items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373] mt-1 shrink-0" />
                        {idx < noteLines.length - 1 && <div className="w-0.5 flex-1 bg-[#2a2723] my-1" />}
                      </div>
                      <div className="flex-1 space-y-0.5">
                        {timestamp && (
                          <span className="text-[8px] font-mono text-[#a8a29e]/40 font-bold">{timestamp}</span>
                        )}
                        <p className="text-[#a8a29e] leading-relaxed break-words text-[11px]">{content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-[#a8a29e]/40 italic pl-1">No logs or notes recorded yet.</p>
            )}

            {/* Note Appender */}
            <div className="flex gap-2 items-end mt-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log progress or write a note..."
                rows={1}
                className="flex-1 bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-2 text-xs text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none resize-none min-h-[36px] max-h-[100px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={isAddingNote || !newNote.trim()}
                className="px-3 py-2 bg-[#d4a373]/10 hover:bg-[#d4a373]/20 border border-[#d4a373]/30 text-[#d4a373] hover:text-[#f2efeb] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          {/* Resources & Attachments Manager */}
          <div className="space-y-2.5 pt-3 border-t border-[#2a2723]">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Linked Resources ({resources.length})</label>
            
            {/* Existing Resources list */}
            {resources.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                {resources.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-[#0f0e0c]/50 border border-[#2a2723] group/res">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.type === "url" ? (
                        <Link className="w-3.5 h-3.5 text-[#d4a373]/60 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-[#d4a373]/60 shrink-0" />
                      )}
                      <span className="text-[11px] text-[#f2efeb] truncate font-medium" title={r.title}>{r.title}</span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#2a2723] text-[#a8a29e] uppercase font-bold shrink-0">
                        {r.type}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setResources(resources.filter((_, idx) => idx !== i))}
                      className="p-1 rounded-lg text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/res:opacity-100 shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Resource Adder UI */}
            <div className="bg-[#0f0e0c]/30 border border-[#2a2723]/50 rounded-2xl p-3 space-y-3">
              <div className="flex gap-2 border-b border-[#2a2723] pb-2">
                <button
                  type="button"
                  onClick={() => setResourceTab("url")}
                  className={`pb-1 px-1 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all ${
                    resourceTab === "url"
                      ? "border-[#d4a373] text-[#d4a373]"
                      : "border-transparent text-[#a8a29e]/60 hover:text-[#f2efeb]"
                  }`}
                >
                  Link URL
                </button>
                <button
                  type="button"
                  onClick={() => setResourceTab("upload")}
                  className={`pb-1 px-1 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all ${
                    resourceTab === "upload"
                      ? "border-[#d4a373] text-[#d4a373]"
                      : "border-transparent text-[#a8a29e]/60 hover:text-[#f2efeb]"
                  }`}
                >
                  Upload File
                </button>
              </div>

              {resourceTab === "url" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      name="url-title"
                      placeholder="Title (Optional)..."
                      autoComplete="off"
                      className="bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/40 rounded-xl px-3 py-1.5 text-xs text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none"
                      value={newUrlTitle}
                      onChange={(e) => setNewUrlTitle(e.target.value)}
                    />
                    <input
                      name="url-value"
                      placeholder="https://example.com..."
                      autoComplete="off"
                      className="bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/40 rounded-xl px-3 py-1.5 text-xs text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none"
                      value={newUrlValue}
                      onChange={(e) => setNewUrlValue(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleLinkUrl}
                    disabled={!newUrlValue.trim()}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[#d4a373]/15 hover:bg-[#d4a373]/25 border border-[#d4a373]/30 text-[#d4a373] rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> Link Address
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[#2a2723] hover:border-[#d4a373]/40 bg-[#0f0e0c]/50 text-[#a8a29e] hover:text-[#f2efeb] rounded-xl text-xs font-bold transition-all"
                  >
                    {isUploading ? (
                      <div className="w-4 h-4 border-2 border-[#d4a373] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Select & Upload Document
                      </>
                    )}
                  </button>
                  {isUploading && (
                    <p className="text-[10px] text-[#d4a373] text-center animate-pulse">Uploading file to storage...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#2a2723] mt-2">
          <button
            type="button"
            onClick={() => onDelete(event)}
            disabled={isSubmitting}
            className="p-2.5 rounded-xl text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            <Trash2 className="w-4 h-4" /> Delete Event
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#a8a29e] hover:text-[#f2efeb] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/20 flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Event
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}




