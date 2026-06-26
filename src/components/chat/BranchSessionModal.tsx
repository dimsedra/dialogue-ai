import { useState, useEffect } from "react";
import { Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BranchSessionModalProps {
  isOpen: boolean;
  onConfirm: (title: string) => void;
  onCancel: () => void;
  isLargeViewport: boolean;
}

export function BranchSessionModal({ isOpen, onConfirm, onCancel, isLargeViewport }: BranchSessionModalProps) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle(`Deep Dive - ${new Date().toLocaleDateString()}`);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onConfirm(title.trim());
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
          className="fixed inset-0 z-1000 flex items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-sm p-6"
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
            <div className="w-12 h-12 rounded-full bg-[#d4a373]/10 flex items-center justify-center mb-4">
              <Layers className="w-6 h-6 text-[#d4a373]" />
            </div>
            <h3 className="text-lg font-bold text-[#f2efeb] mb-2 leading-tight">
              Start Deep Dive
            </h3>
            <p className="text-sm text-[#a8a29e] mb-4 leading-relaxed">
              Start a separate, focused conversation thread from this message.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  autoFocus
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Discussion title..."
                  className="w-full px-4 py-3 rounded-xl bg-[#0f0e0c] border border-[#2a2723] text-[#f2efeb] text-sm placeholder:text-[#a8a29e]/40 outline-none focus:border-[#d4a373]/50 transition-all"
                />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  type="submit"
                  className="w-full py-3 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/10"
                >
                  Start Deep Dive
                </button>
                <button 
                  type="button"
                  onClick={onCancel}
                  className="w-full py-3 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
