import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
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
  Upload, 
  Link as LinkIcon, 
  Plus, 
  FolderKanban,
  FileText 
} from "lucide-react";
import { usePbWorkspacesList } from "@/pb-compat";
interface CreateEventModalProps {
  activeWorkspaceId: string | undefined;
  isLargeViewport: boolean;
  onSave: (updates: {
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
  }) => Promise<void>;
  onClose: () => void;
}

export function CreateEventModal({
  activeWorkspaceId,
  isLargeViewport,
  onSave,
  onClose,
}: CreateEventModalProps) {
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  
  // Default start to next full hour, end to 1 hour after start
  const [eventStartTime, setEventStartTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [eventEndTime, setEventEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  
  const [eventType, setEventType] = useState<"interval" | "point">("interval");
  const [eventFreq, setEventFreq] = useState<"none" | "daily" | "weekly">("none");
  const [eventInterval, setEventInterval] = useState<number>(1);
  const [eventDays, setEventDays] = useState<number[]>([]);
  const [eventUntil, setEventUntil] = useState<string>("");
  const [eventWorkspaceId, setEventWorkspaceId] = useState<string>("");
  const [reminderOffset, setReminderOffset] = useState<string>("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resources state
  const [resources, setResources] = useState<any[]>([]);
  const [resourceTab, setResourceTab] = useState<"url" | "upload">("url");
  const [newUrlTitle, setNewUrlTitle] = useState("");
  const [newUrlValue, setNewUrlValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PocketBase queries
  const workspaces = usePbWorkspacesList();

  const generateUploadUrl = async () => "";

  // Pre-select active workspace
  useEffect(() => {
    if (activeWorkspaceId) {
      setEventWorkspaceId(activeWorkspaceId);
    } else {
      setEventWorkspaceId("");
    }
  }, [activeWorkspaceId]);

  const handleSave = async () => {
    if (isSubmitting || !eventTitle.trim()) return;
    setIsSubmitting(true);
    try {
      let finalStartTime = 0;
      let finalEndTime = 0;

      if (eventStartTime) {
        finalStartTime = new Date(eventStartTime).getTime();
      }

      if (eventType === "interval" && eventEndTime) {
        finalEndTime = new Date(eventEndTime).getTime();
      }

      const recurrenceRule =
        eventFreq !== "none"
          ? {
              frequency: eventFreq as "daily" | "weekly",
              interval: eventInterval,
              daysOfWeek:
                eventFreq === "weekly"
                  ? eventDays.length > 0
                    ? eventDays
                    : [new Date(finalStartTime).getDay()]
                  : undefined,
              until: eventUntil ? new Date(eventUntil).getTime() : undefined,
            }
          : null;

      const finalReminderOffset = reminderOffset === "none" ? null : parseInt(reminderOffset, 10);

      await onSave({
        title: eventTitle,
        description: eventDesc || undefined,
        location: eventLocation || undefined,
        startTime: finalStartTime,
        endTime: eventType === "interval" && finalEndTime ? finalEndTime : undefined,
        eventType,
        recurrence: recurrenceRule,
        workspaceId: eventWorkspaceId || null,
        reminderOffset: finalReminderOffset,
        resources: resources,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
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
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">New Event</h3>
              <span className="text-[10px] text-[#a8a29e]">Create a scheduled event, select intervals, and set reminders</span>
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
              name="panel-create-event-title"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-3 text-sm font-bold text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none transition-all"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Event title..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Description</label>
            <textarea
              name="panel-create-event-desc"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={2}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-3 text-xs text-[#a8a29e] placeholder:text-[#a8a29e]/30 outline-none resize-none transition-all"
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
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
                  value={eventWorkspaceId}
                  onChange={(e) => setEventWorkspaceId(e.target.value)}
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
                  name="panel-create-event-loc"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
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
                  onClick={() => setEventType("interval")}
                  className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1 ${
                    eventType === "interval"
                      ? "bg-[#d4a373]/15 border-[#d4a373] text-[#d4a373]"
                      : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                  }`}
                >
                  Interval
                </button>
                <button
                  type="button"
                  onClick={() => setEventType("point")}
                  className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1 ${
                    eventType === "point"
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
                  value={reminderOffset}
                  onChange={(e) => setReminderOffset(e.target.value)}
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
                {eventType === "point" ? "Moment" : "Start Time"}
              </label>
              <input
                type="datetime-local"
                name="panel-create-event-start"
                autoComplete="off"
                className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl px-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all appearance-none cursor-pointer"
                value={eventStartTime}
                onChange={(e) => setEventStartTime(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              />
            </div>
            {eventType === "interval" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">End Time</label>
                <input
                  type="datetime-local"
                  name="panel-create-event-end"
                  autoComplete="off"
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl px-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all appearance-none cursor-pointer"
                  value={eventEndTime}
                  onChange={(e) => setEventEndTime(e.target.value)}
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
                value={eventFreq}
                onChange={(e) => setEventFreq(e.target.value as "none" | "daily" | "weekly")}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {eventFreq !== "none" && (
                <div className="flex items-center gap-2 bg-[#0f0e0c] border border-[#2a2723] rounded-xl px-3 py-2">
                  <span className="text-xs text-[#a8a29e]">Every</span>
                  <input
                    type="number"
                    name="panel-create-event-interval"
                    autoComplete="off"
                    min={1}
                    max={30}
                    className="w-12 bg-transparent text-xs text-[#f2efeb] font-bold outline-none text-center"
                    value={eventInterval}
                    onChange={(e) => setEventInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <span className="text-xs text-[#a8a29e]">
                    {eventFreq === "daily" ? "days" : "weeks"}
                  </span>
                </div>
              )}
            </div>
            {eventFreq === "weekly" && (
              <div className="flex justify-between gap-1.5 pt-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (eventDays.includes(idx)) {
                        setEventDays(eventDays.filter((d) => d !== idx));
                      } else {
                        setEventDays([...eventDays, idx]);
                      }
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                      eventDays.includes(idx)
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] border border-[#2a2723] hover:border-[#d4a373]/30"
                    }`}
                  >
                    {dayName}
                  </button>
                ))}
              </div>
            )}
            {eventFreq !== "none" && (
              <div className="space-y-1.5 pt-3 border-t border-[#2a2723]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">End Repeat (Optional)</label>
                <div className="relative flex items-center">
                  <CalendarIcon className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                  <input
                    type="date"
                    name="panel-create-event-until"
                    autoComplete="off"
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2 text-xs text-[#f2efeb] outline-none transition-all cursor-pointer appearance-none"
                    value={eventUntil}
                    onChange={(e) => setEventUntil(e.target.value)}
                  />
                </div>
              </div>
            )}
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
                        <LinkIcon className="w-3.5 h-3.5 text-[#d4a373]/60 shrink-0" />
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
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#2a2723] mt-2">
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
            disabled={isSubmitting || !eventTitle.trim()}
            className="px-6 py-2.5 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/20 flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Create Event
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}






