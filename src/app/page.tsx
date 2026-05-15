"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Chat } from "@/components/Chat";
import { TaskPanel } from "@/components/TaskPanel";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Grid2x2, Bot } from "lucide-react";
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
  const [initialHeight, setInitialHeight] = useState<number | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  const workspaces = useQuery(api.workspaces.list);

  // Minimum Loading Time for the Global Premium Splash Screen
  useEffect(() => {
    if (workspaces !== undefined) {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 1500); // 1.5s minimum splash time to "savor" the animation
      return () => clearTimeout(timer);
    }
  }, [workspaces]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialHeight(window.innerHeight);
    const check = () => setIsLargeViewport(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);

    // Keyboard handling via Visual Viewport API
    const handleViewportChange = () => {
      if (window.visualViewport) {
        // Force absolute top to prevent double scrollbar triggers
        window.scrollTo(0, 0);
        
        const viewportHeight = window.visualViewport.height;
        const viewportOffsetTop = window.visualViewport.offsetTop;
        
        // Use initialHeight as the baseline to avoid "stretching" math
        const baseline = initialHeight || window.innerHeight;
        
        // Precise math for Android/Samsung viewport shifts
        const offset = baseline - (viewportHeight + viewportOffsetTop);
        
        setKeyboardOffset(Math.max(0, offset));
      }
    };

    const preventNativeScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }
    window.addEventListener("scroll", preventNativeScroll, { passive: false });

    return () => {
      window.removeEventListener("resize", check);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }
      window.removeEventListener("scroll", preventNativeScroll);
    };
  }, [initialHeight]);

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
    <main 
      style={{ height: initialHeight ? `${initialHeight}px` : "100svh" }}
      className="fixed inset-0 flex overflow-hidden bg-[#0f0e0c]"
    >
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
        className="flex-1 flex h-full overflow-hidden relative"
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
      <AnimatePresence>
        {!showTasks && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => handleSetShowTasks(true)}
            style={{ 
              top: isLargeViewport ? "50%" : "auto",
              bottom: isLargeViewport ? "auto" : `calc(6.5rem + ${keyboardOffset}px)`,
              transform: isLargeViewport ? "translateY(-50%)" : "none"
            }}
            className="absolute right-6 z-40 p-4 lg:p-3 rounded-full lg:rounded-2xl bg-[#d4a373] lg:bg-[#1a1814] border border-[#d4a373]/20 lg:border-[#2a2723] text-[#0f0e0c] lg:text-[#a8a29e] hover:text-[#0f0e0c] lg:hover:text-[#d4a373] transition-all shadow-2xl lg:shadow-black/50 group flex items-center justify-center"
            title="Show Planner"
          >
            <Grid2x2 className="w-6 h-6 lg:w-5 lg:h-5 transition-transform group-hover:rotate-12" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Task Panel (Collapsible / Overlay) */}
      <motion.div
        initial={false}
        animate={{ 
          width: isLargeViewport ? (showTasks ? 320 : 0) : "85%",
          opacity: isLargeViewport ? (showTasks ? 1 : 0) : (showTasks ? 1 : 0),
          x: isLargeViewport ? 0 : (showTasks ? 0 : "100%")
        }}
        transition={{ type: "spring", damping: 30, stiffness: 250 }}
        className={`h-full border-[#2a2723] bg-[#1a1814] shrink-0 overflow-hidden z-40 ${
          isLargeViewport ? "relative border-l" : "absolute right-0 shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
        }`}
      >
        <div className="w-[320px] sm:w-[320px] h-full">
          <TaskPanel 
            activeWorkspaceId={activeWorkspaceId}
            onSync={handleSyncFromPanel}
            onClose={() => handleSetShowTasks(false)}
          />
        </div>
      </motion.div>
      {/* Global Loading Splash Screen */}
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            key="global-splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed inset-0 z-[10000] bg-[#0f0e0c] flex flex-col items-center justify-center space-y-6"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-[#d4a373]/20 blur-3xl rounded-full animate-pulse" />
              <Bot className="w-12 h-12 text-[#d4a373] animate-bounce relative z-10" />
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-1 w-32 bg-[#1a1814] rounded-full overflow-hidden">
                <div className="h-full bg-[#d4a373] w-1/2 animate-[loading_1.5s_infinite_ease-in-out]" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#d4a373]/40">Initialising</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
