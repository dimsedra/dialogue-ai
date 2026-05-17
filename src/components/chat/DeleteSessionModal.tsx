import { Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../../convex/_generated/dataModel";

interface DeleteSessionModalProps {
  session: { id: Id<"chatSessions">; title: string } | null;
  onConfirm: (id: Id<"chatSessions">) => void;
  onCancel: () => void;
  isLargeViewport: boolean;
}

export function DeleteSessionModal({ session, onConfirm, onCancel, isLargeViewport }: DeleteSessionModalProps) {
  return (
    <AnimatePresence>
      {session && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-sm p-6"
          onClick={onCancel}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={isLargeViewport ? { type: "spring", damping: 30, stiffness: 300 } : { duration: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] bg-[#1a1814] border border-[#d4a373]/20 rounded-2xl p-6 shadow-2xl"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-[#f2efeb] mb-2 leading-tight">
              Delete Session?
            </h3>
            <p className="text-sm text-[#a8a29e] mb-6 leading-relaxed">
              Are you sure you want to delete <span className="text-[#f2efeb] font-semibold italic">&quot;{session.title}&quot;</span>? All messages and context from this session will be lost.
            </p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => onConfirm(session.id)}
                className="w-full py-3 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
              >
                Delete Session
              </button>
              <button 
                onClick={onCancel}
                className="w-full py-3 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
