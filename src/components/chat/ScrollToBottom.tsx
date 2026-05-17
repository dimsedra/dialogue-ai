import { ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ScrollToBottomProps {
  visible: boolean;
  onClick: (e?: React.MouseEvent) => void;
  isLargeViewport: boolean;
  keyboardOffset: number;
}

export function ScrollToBottom({ visible, onClick, isLargeViewport, keyboardOffset }: ScrollToBottomProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 10, x: "-50%" }}
          animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, scale: 0.8, y: 10, x: "-50%" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={onClick}
          onPointerDown={(e) => e.preventDefault()}
          style={{ 
            bottom: isLargeViewport ? "8.5rem" : `calc(8.5rem + ${keyboardOffset}px)` 
          }}
          className="absolute left-1/2 z-40 p-2.5 rounded-full bg-[#1a1814]/80 backdrop-blur-md border border-[#2a2723] text-[#d4a373] shadow-xl shadow-black/40 hover:bg-[#2a2723] transition-all"
          title="Scroll to Bottom"
        >
          <ArrowDown className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
