import { Bot } from "lucide-react";
import { motion } from "framer-motion";

export function TypingIndicator({ agentName }: { agentName?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col space-y-3 py-6 lg:py-8 w-full min-w-0"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 shadow-sm border border-[#d4a373]/20 bg-[#d4a373] text-[#0f0e0c]">
          <Bot className="w-3 h-3 text-[#0f0e0c]" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d4a373]">
          {agentName || "Dialogue"}
        </span>
        <span className="text-[9px] text-[#d4a373]/50 font-bold tracking-widest uppercase animate-pulse">
          Typing
        </span>
      </div>
      <div className="relative w-full ml-2.5 pl-6 min-w-0 border-l border-[#d4a373]/15 flex items-center gap-1.5 h-6">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
          className="w-1.5 h-1.5 rounded-full bg-[#d4a373]" 
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4, delay: 0.2, ease: "easeInOut" }}
          className="w-1.5 h-1.5 rounded-full bg-[#d4a373]" 
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4, delay: 0.4, ease: "easeInOut" }}
          className="w-1.5 h-1.5 rounded-full bg-[#d4a373]" 
        />
      </div>
    </motion.div>
  );
}
