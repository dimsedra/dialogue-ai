import { useState } from "react";
import { motion } from "framer-motion";
import { Edit3, X } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";
import { ConfirmEditRecurringData, EventUpdateData } from "./types";

interface RecurringEditModalProps {
  data: ConfirmEditRecurringData;
  isLargeViewport: boolean;
  onSaveSeries: (id: Id<"events">, updates: EventUpdateData) => Promise<void>;
  onSaveOccurrence: (seriesId: Id<"events">, originalStartTime: number, updates: EventUpdateData) => Promise<void>;
  onCancel: () => void;
}

export function RecurringEditModal({
  data,
  isLargeViewport,
  onSaveSeries,
  onSaveOccurrence,
  onCancel,
}: RecurringEditModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveSeries = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSaveSeries(data.id, data.updates);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveOccurrence = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSaveOccurrence(data.id, data.timestamp, data.updates);
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <div className="w-8 h-8 rounded-xl bg-[#d4a373]/15 flex items-center justify-center text-[#d4a373]">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f2efeb] leading-tight">Save Recurring Event</h3>
              <span className="text-[10px] text-[#a8a29e]">Modifying a repeating event</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-[#a8a29e] leading-relaxed">
          <p>
            You are modifying a repeating event. Do you want to save changes for this specific date only, or for the entire repeating series?
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-[#2a2723] justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all sm:order-1 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveSeries}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-[#2a2723] text-[#f2efeb] rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#3a3630] transition-all sm:order-2 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting && (
              <div className="w-3.5 h-3.5 border-2 border-[#f2efeb]/30 border-t-[#f2efeb] rounded-full animate-spin" />
            )}
            Entire Series
          </button>
          <button
            type="button"
            onClick={handleSaveOccurrence}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-lg sm:order-3 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting && (
              <div className="w-3.5 h-3.5 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
            )}
            This Date Only
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
