import { AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface WarningModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  isLargeViewport: boolean;
}

export function WarningModal({ isOpen, title, message, onClose, isLargeViewport }: WarningModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
          className="fixed inset-0 z-1000 flex items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-sm p-6"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={isLargeViewport ? { type: "spring", damping: 30, stiffness: 300 } : { duration: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-[#1a1814] border border-amber-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
          >
            {/* Elegant glassmorphic highlight background */}
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-amber-500/5 blur-2xl pointer-events-none" />

            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>

            <h3 className="text-lg font-bold text-[#f2efeb] mb-2 leading-tight">
              {title}
            </h3>

            <p className="text-sm text-[#a8a29e] mb-6 leading-relaxed">
              {message}
            </p>

            <button 
              onClick={onClose}
              className="w-full py-3 bg-amber-500 text-[#0f0e0c] rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-lg shadow-amber-500/10"
            >
              Got It
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
