import { motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { ConfirmDeleteData } from "./types";

interface DeleteConfirmModalProps {
  target: ConfirmDeleteData;
  isLargeViewport: boolean;
  onConfirmDelete: (id: string, type: "task" | "event") => void;
  onConfirmDeleteOccurrence: (id: string, timestamp: number) => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  target,
  isLargeViewport,
  onConfirmDelete,
  onConfirmDeleteOccurrence,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-md p-0 sm:p-6"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: "100%", opacity: 0, scale: 0.95 }}
        transition={isLargeViewport ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#1a1814] border border-[#d4a373]/20 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#2a2723]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">
                Delete {target.type === "task" ? "Task" : "Event"}
              </h3>
              <span className="text-[10px] text-[#a8a29e]">Confirm deletion</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-xl text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-[#a8a29e] leading-relaxed">
          <p>
            {target.type === "event" && target.event?.recurrence
              ? "This is a repeating event. You can delete just this occurrence or the entire series."
              : `This action cannot be undone. All data associated with this ${target.type} will be permanently removed.`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-[#2a2723] justify-end">
          {target.type === "event" && target.event?.recurrence ? (
            <>
              <button
                onClick={onCancel}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all sm:order-1"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirmDelete(target.id, target.type)}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all sm:order-2"
              >
                Entire Series
              </button>
              <button
                onClick={() => {
                  if (target.event) {
                    onConfirmDeleteOccurrence(target.id as string, target.event.startTime);
                  }
                }}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 sm:order-3"
              >
                This Date Only
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onCancel}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all sm:order-1"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirmDelete(target.id, target.type)}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 sm:order-2"
              >
                Delete {target.type === "task" ? "Task" : "Event"}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}




