import { Bot } from "lucide-react";
import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 lg:gap-5"
    >
      <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl lg:rounded-2xl bg-[#d4a373] flex-shrink-0 flex items-center justify-center shadow-lg shadow-[#d4a373]/10">
        <Bot className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#0f0e0c]" />
      </div>
      <div className="flex flex-col space-y-2">
        <div className="px-4 py-3 rounded-2xl lg:rounded-3xl bg-[#1a1814] border border-[#2a2723] rounded-tl-none shadow-xl flex items-center gap-1.5 h-[44px]">
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
      </div>
    </motion.div>
  );
}
