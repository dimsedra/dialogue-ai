import { useState } from "react";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  isLargeViewport: boolean;
}

export function CreateWorkspaceModal({ isOpen, onClose, onSubmit, isLargeViewport }: CreateWorkspaceModalProps) {
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    onSubmit(newWorkspaceName.trim());
    setNewWorkspaceName("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={isLargeViewport ? { duration: 0.2 } : { duration: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={isLargeViewport ? { type: "spring", damping: 30, stiffness: 300 } : { duration: 0 }}
            className="relative w-full max-w-100 bg-[#1a1814] border border-[#d4a373]/30 rounded-4xl p-8 lg:p-10 shadow-[0_30px_90px_rgba(0,0,0,0.8)] space-y-8 overflow-hidden"
          >
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#d4a373]/10 blur-[80px] rounded-full" />
            
            <div className="space-y-3 relative">
              <div className="w-12 h-12 rounded-2xl bg-[#d4a373]/10 border border-[#d4a373]/20 flex items-center justify-center mb-2">
                <Plus className="w-6 h-6 text-[#d4a373]" />
              </div>
              <h3 className="text-2xl font-bold text-[#f2efeb] tracking-tight">New Workspace</h3>
              <p className="text-sm text-[#a8a29e] leading-relaxed">Create a focused environment for your projects and ideas.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a8a29e] ml-1">Workspace Name</label>
                <input
                  autoFocus
                  name="chat-new-ws-name"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g. Creative Lab, Work, Studies..."
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-2xl px-6 py-4 text-sm text-[#f2efeb] focus:border-[#d4a373]/50 focus:ring-1 focus:ring-[#d4a373]/30 outline-none transition-all placeholder:text-[#2a2723]"
                />
              </div>
              
              <div className="flex gap-4 pt-2">
                <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 rounded-2xl border border-[#2a2723] text-xs font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#f2efeb] hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newWorkspaceName.trim()}
                  className="flex-1 py-4 rounded-2xl bg-[#d4a373] text-[#0f0e0c] text-xs font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-xl shadow-[#d4a373]/20 disabled:opacity-50 disabled:grayscale"
                >
                  Create
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
