import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Flame, X, Save, Trash2, FolderKanban, Archive } from "lucide-react";
import { HabitWithLogs } from "./HabitList";
import { usePbHabitUpdate, usePbHabitDelete, usePbWorkspacesList } from "@/pb-compat";
interface EditHabitModalProps {
  habit: HabitWithLogs;
  isLargeViewport: boolean;
  onClose: () => void;
}

export function EditHabitModal({
  habit,
  isLargeViewport,
  onClose,
}: EditHabitModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "custom">("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [archived, setArchived] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const workspaces = usePbWorkspacesList();

  const updateHabitMutation = usePbHabitUpdate();
  const deleteHabitMutation = usePbHabitDelete();

  useEffect(() => {
    if (habit) {
      setName(habit.name);
      setDescription(habit.description || "");
      setFrequency(habit.frequency);
      setDaysOfWeek(habit.frequencyConfig?.daysOfWeek || []);
      setWorkspaceId(habit.workspace || "");
      setArchived(habit.archived);
    }
  }, [habit]);

  const handleSave = async () => {
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const freqConfig = {
        daysOfWeek: frequency === "custom" ? daysOfWeek : undefined,
      };

      await updateHabitMutation({
        id: habit._id,
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        frequencyConfig: freqConfig,
        workspaceId: workspaceId || null,
        archived,
      });
      onClose();
    } catch (err) {
      console.error("Failed to update habit:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteHabitMutation({ id: habit._id });
      onClose();
    } catch (err) {
      console.error("Failed to delete habit:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleDay = (day: number) => {
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
        className="w-full max-w-md bg-[#1a1814] border border-[#d4a373]/20 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto scrollbar-hide"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#2a2723]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#d4a373]/15 flex items-center justify-center text-[#d4a373]">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">Edit Routine</h3>
              <span className="text-[10px] text-[#a8a29e]">Modify habits, archive, or delete them</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isDeleting}
            className="p-2 rounded-xl text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Habit Name</label>
            <input
              autoFocus
              name="panel-habit-name-edit"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-3 text-xs font-bold text-[#f2efeb] placeholder:text-[#a8a29e]/30 outline-none transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Read, Exercise, Meditate..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Description</label>
            <textarea
              name="panel-habit-desc-edit"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={2}
              className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 rounded-xl p-3 text-xs text-[#a8a29e] placeholder:text-[#a8a29e]/30 outline-none resize-none transition-all"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Habit notes or details..."
            />
          </div>

          {/* Workspace */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Workspace</label>
            <div className="relative flex items-center">
              <FolderKanban className="absolute left-3 w-3.5 h-3.5 text-[#a8a29e]/50" />
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
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

          {/* Frequency Toggle */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Frequency</label>
            <div className="flex bg-[#0f0e0c] p-1 rounded-xl border border-[#2a2723]">
              <button
                type="button"
                onClick={() => setFrequency("daily")}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wide ${
                  frequency === "daily"
                    ? "bg-[#2a2723] text-[#d4a373]"
                    : "text-[#a8a29e] hover:text-[#f2efeb]"
                }`}
              >
                Every Day
              </button>
              <button
                type="button"
                onClick={() => setFrequency("custom")}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wide ${
                  frequency === "custom"
                    ? "bg-[#2a2723] text-[#d4a373]"
                    : "text-[#a8a29e] hover:text-[#f2efeb]"
                }`}
              >
                Specific Days
              </button>
            </div>
          </div>

          {/* Specific Days Selector */}
          {frequency === "custom" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1.5"
            >
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/60">Select Days</label>
              <div className="flex gap-1">
                {days.map((day, idx) => {
                  const isSelected = daysOfWeek.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${
                        isSelected
                          ? "bg-[#d4a373] text-[#0f0e0c]"
                          : "bg-[#0f0e0c] text-[#a8a29e] border border-[#2a2723] hover:border-[#d4a373]/30"
                      }`}
                    >
                      {day[0]}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Archive Status Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0f0e0c]/50 border border-[#2a2723]">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-[#a8a29e]" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#f2efeb]">Archive Routine</span>
                <span className="text-[9px] text-[#a8a29e]/50">Stops tracking, but preserves logs</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setArchived(!archived)}
              className={`w-9 h-5 rounded-full transition-all relative ${
                archived ? "bg-[#d4a373]" : "bg-[#2a2723]"
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-[#0f0e0c] absolute top-0.5 transition-all ${
                archived ? "left-5" : "left-0.5"
              }`} />
            </button>
          </div>
        </div>

        {/* Delete Confirmation Alert */}
        {showConfirmDelete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 border border-red-500/20 bg-red-500/5 rounded-2xl space-y-3"
          >
            <p className="text-xs text-red-400 font-bold leading-relaxed">
              Are you sure? Deleting this habit will permanently destroy all linked routine logs and statistics. This action is irreversible.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete Everything"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2 bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#2a2723]">
          {!showConfirmDelete && (
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              disabled={isSubmitting}
              className="p-2.5 rounded-xl text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
            >
              <Trash2 className="w-4 h-4" /> Delete Habit
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
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
              disabled={isSubmitting || !name.trim() || (frequency === "custom" && daysOfWeek.length === 0)}
              className="px-6 py-2.5 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/20 flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Details
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}






