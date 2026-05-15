"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Chat } from "@/components/Chat";
import { TaskPanel } from "@/components/TaskPanel";
import { Id } from "../../convex/_generated/dataModel";
import { Grid2x2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<Id<"workspaces"> | undefined>(undefined);
  
  // Clear session when workspace changes
  const handleWorkspaceChange = useCallback((id: Id<"workspaces"> | undefined, sessionId?: Id<"chatSessions"> | null) => {
    setActiveWorkspaceId(id);
    setActiveSessionId(sessionId || null);
  }, []);

  const [showHistory, setShowHistory] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLargeViewport, setIsLargeViewport] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const check = () => setIsLargeViewport(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);

    // Keyboard handling via Visual Viewport API
    const handleViewportChange = () => {
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        setKeyboardOffset(Math.max(0, offset));
        document.documentElement.style.setProperty('--keyboard-offset', `${Math.max(0, offset)}px`);
        
        // Prevent browser from scrolling the body up
        if (offset > 0) {
          window.scrollTo(0, 0);
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }

    return () => {
      window.removeEventListener("resize", check);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }
    };
  }, []);

  useEffect(() => {
    // Force top scroll on mount to ensure header is visible
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    // 1. Load preferences from storage
    const savedHistory = localStorage.getItem("dialogue_show_history");
    const savedTasks = localStorage.getItem("dialogue_show_tasks");
    
    queueMicrotask(() => {
      if (savedHistory !== null) setShowHistory(savedHistory === "true");
      if (savedTasks !== null) setShowTasks(savedTasks === "true");
      // 2. Mark as loaded so we don't immediately overwrite with defaults
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("dialogue_show_history", showHistory.toString());
    }
  }, [showHistory, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("dialogue_show_tasks", showTasks.toString());
    }
  }, [showTasks, isLoaded]);
  const syncRef = useRef<(() => void) | null>(null);
  const handleSyncFromPanel = useCallback(() => {
    syncRef.current?.();
  }, []);

  // Sidebar Mutual Exclusivity Logic — only enforced on tablet/mobile
  const handleSetShowHistory = useCallback((val: boolean) => {
    setShowHistory(val);
    if (val && !isLargeViewport) setShowTasks(false);
  }, [isLargeViewport]);

  const handleSetShowTasks = useCallback((val: boolean) => {
    setShowTasks(val);
    if (val && !isLargeViewport) setShowHistory(false);
  }, [isLargeViewport]);

  return (
    <main className="fixed inset-0 flex overflow-hidden bg-[#0f0e0c]">
      {/* Backdrops for Mobile Overlay */}
      <AnimatePresence>
        {(showHistory || showTasks) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowHistory(false); setShowTasks(false); }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <motion.div 
        layout
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="flex-1 flex overflow-hidden relative"
      >
        <Chat 
          activeSessionId={activeSessionId} 
          setActiveSessionId={setActiveSessionId}
          activeWorkspaceId={activeWorkspaceId}
          setActiveWorkspaceId={handleWorkspaceChange}
          showHistory={showHistory}
          setShowHistory={handleSetShowHistory}
          onSyncRef={syncRef}
          isLargeViewport={isLargeViewport}
          keyboardOffset={keyboardOffset}
        />
      </motion.div>

      {/* Right Sidebar Toggle (Floating / FAB on Mobile) */}
      {!showTasks && (
        <motion.div 
          animate={{ 
            bottom: isLargeViewport ? "auto" : 112 + keyboardOffset
          }}
          transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.5 }}
          className="fixed lg:absolute right-4 lg:right-6 lg:top-1/2 lg:-translate-y-1/2 z-50 h-fit w-fit"
        >
          <button
            onClick={() => handleSetShowTasks(true)}
            className="p-4 lg:p-3 rounded-full lg:rounded-2xl bg-[#d4a373] lg:bg-[#1a1814] border border-[#d4a373]/20 lg:border-[#2a2723] text-[#0f0e0c] lg:text-[#a8a29e] hover:text-[#0f0e0c] lg:hover:text-[#d4a373] transition-all shadow-2xl lg:shadow-black/50 group flex items-center justify-center"
            title="Show Planner"
          >
            <Grid2x2 className="w-6 h-6 lg:w-5 lg:h-5 transition-transform group-hover:rotate-12" />
          </button>
        </motion.div>
      )}

      {/* Task Panel (Collapsible / Overlay) */}
      <AnimatePresence>
        {showTasks && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "320px", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="h-full border-l border-[#2a2723] bg-[#1a1814] shrink-0 overflow-hidden z-40 lg:relative lg:translate-x-0 absolute right-0 w-full sm:w-[320px] shadow-[-20px_0_40px_rgba(0,0,0,0.5)] lg:shadow-none"
          >
            <TaskPanel 
              activeWorkspaceId={activeWorkspaceId}
              onSync={handleSyncFromPanel}
              onClose={() => handleSetShowTasks(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
