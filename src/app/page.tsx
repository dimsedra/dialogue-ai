"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Chat } from "@/components/Chat";
import { TaskPanel } from "@/components/TaskPanel";
import { Id } from "../../convex/_generated/dataModel";
import { ChevronRight, Grid2x2 } from "lucide-react";
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

  return (
    <main className="h-screen flex overflow-hidden bg-[#0f0e0c] relative">
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
          setShowHistory={setShowHistory}
          onSyncRef={syncRef}
        />
      </motion.div>

      {/* Right Sidebar Toggle (Floating / FAB on Mobile) */}
      {!showTasks && (
        <div className="fixed lg:absolute right-4 bottom-28 lg:right-6 lg:top-1/2 lg:-translate-y-1/2 z-50 h-fit w-fit">
          <button
            onClick={() => setShowTasks(true)}
            className="p-4 lg:p-3 rounded-full lg:rounded-2xl bg-[#d4a373] lg:bg-[#1a1814] border border-[#d4a373]/20 lg:border-[#2a2723] text-[#0f0e0c] lg:text-[#a8a29e] hover:text-[#0f0e0c] lg:hover:text-[#d4a373] transition-all shadow-2xl lg:shadow-black/50 group flex items-center justify-center"
            title="Show Planner"
          >
            <Grid2x2 className="w-6 h-6 lg:w-5 lg:h-5 transition-transform group-hover:rotate-12" />
          </button>
        </div>
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
            <button
              onClick={() => setShowTasks(false)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-r-xl bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all shadow-lg border-r border-[#3a3733]"
              title="Hide Planner"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <TaskPanel 
              activeWorkspaceId={activeWorkspaceId}
              onSync={handleSyncFromPanel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
