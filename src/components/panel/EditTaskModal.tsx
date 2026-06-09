import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { 
  AlertCircle, 
  Circle, 
  Clock, 
  ListTodo, 
  Save, 
  Tag, 
  Trash2, 
  X, 
  Paperclip, 
  Upload, 
  Link, 
  Plus, 
  Check, 
  FolderKanban,
  FileText,
  Bell
} from "lucide-react";
import { TaskDoc } from "./types";
import { usePbTaskUpdate, usePbWorkspacesList } from "@/pb-compat";
interface EditTaskModalProps {
  task: TaskDoc;
  isLargeViewport: boolean;
  onSave: (
    id: string,
    updates: {
      text: string;
      priority: "low" | "medium" | "high";
      category: string;
      dueDate?: number;
      workspace?: string | null;
      resources?: unknown[];
      overwriteResources?: boolean;
      reminderOffset: number | null;
    }
  ) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function EditTaskModal({
  task,
  isLargeViewport,
  onSave,
  onDelete,
  onClose,
}: EditTaskModalProps) {
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [editTaskCategory, setEditTaskCategory] = useState("");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  const [editTaskWorkspaceId, setEditTaskWorkspaceId] = useState<string>("");
  const [editTaskReminderOffset, setEditTaskReminderOffset] = useState<string>("none");
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

  const updateTaskMutation = usePbTaskUpdate();

  const generateUploadUrl = async () => "";

  useEffect(() => {
    if (task) {
      const timer = setTimeout(() => {
        setEditTaskText(task.text);
        setEditTaskPriority((task.priority as "low" | "medium" | "high") || "medium");
        setEditTaskCategory(task.category || "");
        setEditTaskWorkspaceId(task.workspace || "");
        setResources(task.resources || []);
        setEditTaskReminderOffset(task.reminderOffset !== undefined && task.reminderOffset !== null ? String(task.reminderOffset) : "none");
        if (task.dueDate) {
          try {
            const date = new Date(task.dueDate);
            setEditTaskDueDate(format(date, "yyyy-MM-dd'T'HH:mm"));
          } catch {
            setEditTaskDueDate("");
          }
        } else {
          setEditTaskDueDate("");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [task]);

  const handleSave = async () => {
    if (isSubmitting || !editTaskText.trim()) return;
    setIsSubmitting(true);
    try {
      const finalDueDate = editTaskDueDate ? new Date(editTaskDueDate).getTime() : undefined;
      const finalReminderOffset = editTaskReminderOffset === "none" ? null : parseInt(editTaskReminderOffset, 10);
      await onSave(task._id, {
        text: editTaskText,
        priority: editTaskPriority,
        category: editTaskCategory,
        dueDate: finalDueDate,
        workspace: editTaskWorkspaceId || null,
        resources: resources,
        overwriteResources: true,
        reminderOffset: finalReminderOffset,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || isAddingNote) return;
    setIsAddingNote(true);
    try {
      await updateTaskMutation({
        taskId: task._id,
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

  const noteLines = task.notes ? task.notes.split("\n").filter(Boolean) : [];

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
              <ListTodo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">Edit Task</h3>
              <span className="text-[10px] text-[#a8a29e]">Modify details, log progress, and link resources</span>
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
          {/* Task Text */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Task Description</label>
            <textarea
              autoFocus
              name="panel-task-desc"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={2}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-2xl p-3 text-sm text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none resize-none transition-all"
              value={editTaskText}
              onChange={(e) => setEditTaskText(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          {/* Core Properties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Workspace</label>
              <div className="relative flex items-center">
                <FolderKanban className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <select
                  value={editTaskWorkspaceId}
                  onChange={(e) => setEditTaskWorkspaceId(e.target.value)}
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
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Category</label>
              <div className="relative flex items-center">
                <Tag className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <input
                  name="panel-task-category"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all"
                  value={editTaskCategory}
                  onChange={(e) => setEditTaskCategory(e.target.value)}
                  placeholder="Work, Personal..."
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Due Date</label>
              <div className="relative flex items-center">
                <Clock className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <input
                  type="datetime-local"
                  name="panel-task-due"
                  autoComplete="off"
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all appearance-none cursor-pointer"
                  value={editTaskDueDate}
                  onChange={(e) => setEditTaskDueDate(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Reminder Alert</label>
              <div className="relative flex items-center">
                <Bell className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
                <select
                  value={editTaskReminderOffset}
                  onChange={(e) => setEditTaskReminderOffset(e.target.value)}
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#f2efeb] outline-none transition-all cursor-pointer appearance-none"
                >
                  <option value="none">No Reminder</option>
                  <option value="0">At due time</option>
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

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Priority Level</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["low", "medium", "high"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEditTaskPriority(p)}
                  className={`py-2 rounded-xl text-[10px] font-bold capitalize transition-all border flex items-center justify-center gap-1 ${
                    editTaskPriority === p
                      ? p === "low"
                        ? "bg-blue-500/15 border-blue-500/50 text-blue-400"
                        : p === "medium"
                        ? "bg-amber-500/15 border-amber-500/50 text-amber-400"
                        : "bg-red-500/15 border-red-500/50 text-red-400"
                      : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
                  }`}
                >
                  <Circle className={`w-2 h-2 ${
                    p === "low" ? "text-blue-400 fill-blue-400" : p === "medium" ? "text-amber-400 fill-amber-400" : "text-red-400 fill-red-400"
                  }`} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Notes Timeline / History */}
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
                className="px-3 py-2 bg-[#d4a373]/10 hover:bg-[#d4a373]/20 border border-[#d4a373]/30 text-[#d4a373] hover:text-[#f2efeb] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <span className="text-[8px] px-1 py-0.5 rounded bg-[#2a2723] text-[#a8a29e] uppercase font-bold shrink-0">
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
            onClick={() => onDelete(task._id)}
            disabled={isSubmitting}
            className="p-2.5 rounded-xl text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            <Trash2 className="w-4 h-4" /> Delete Task
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
              Save Task
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}


