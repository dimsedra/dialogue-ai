"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Chat } from "@/components/Chat";
import { TaskPanel } from "@/components/TaskPanel";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SignInForm } from "@/components/auth/SignInForm";
import { Scope } from "@/components/chat/types";

export default function Home() {
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<Id<"workspaces"> | undefined>(undefined);
  const [activeScope, setActiveScope] = useState<Scope | null>(null);
  
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
  const [chatInputOffset, setChatInputOffset] = useState(0);

  const workspaces = useQuery(api.workspaces.list, {});

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
    let lastWidth = window.innerWidth;

    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      setIsLargeViewport(currentWidth >= 1024);

      // On desktop, or if the width changed (meaning it's a zoom, window resize, or rotation - not just a mobile keyboard popping up), update the locked height.
      // We also update it if the new height is greater (e.g., keyboard closing).
      if (currentWidth >= 1024 || currentWidth !== lastWidth) {
        setInitialHeight(currentHeight);
        lastWidth = currentWidth;
      } else {
        // If height increased while width stayed the same (keyboard hiding or vertical resize on small window)
        setInitialHeight((prev) => currentHeight > (prev || 0) ? currentHeight : prev);
      }
    };
    
    handleResize();
    window.addEventListener("resize", handleResize);

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
      window.removeEventListener("resize", handleResize);
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
  // Sidebar Mutual Exclusivity Logic — only enforced on tablet/mobile
  const handleSetShowHistory = useCallback((val: boolean) => {
    setShowHistory(val);
    if (val && !isLargeViewport) setShowTasks(false);
  }, [isLargeViewport]);

  const handleSetShowTasks = useCallback((val: boolean) => {
    setShowTasks(val);
    if (val && !isLargeViewport) setShowHistory(false);
  }, [isLargeViewport]);

  const syncRef = useRef<(() => void) | null>(null);
  const handleSyncFromPanel = useCallback(() => {
    syncRef.current?.();
    if (!isLargeViewport) {
      handleSetShowTasks(false);
    }
  }, [isLargeViewport, handleSetShowTasks]);


  return (
    <>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
      <Authenticated>
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
                transition={{ duration: 0 }}
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
              activeScope={activeScope}
              setActiveScope={setActiveScope}
              showHistory={showHistory}
              setShowHistory={handleSetShowHistory}
              onSyncRef={syncRef}
              isLargeViewport={isLargeViewport}
              keyboardOffset={keyboardOffset}
              onChatInputResize={setChatInputOffset}
              onShowTasks={showTasks ? undefined : () => handleSetShowTasks(true)}
            />
          </motion.div>

          {/* Task Panel (Collapsible / Overlay) */}
          <motion.div
            initial={false}
            animate={{ 
              width: isLargeViewport ? (showTasks ? 320 : 0) : (showTasks ? "min(320px, 85vw)" : 0),
              opacity: isLargeViewport ? (showTasks ? 1 : 0) : (showTasks ? 1 : 0),
              x: isLargeViewport ? 0 : (showTasks ? 0 : "100%")
            }}
            transition={isLargeViewport ? { type: "spring", damping: 30, stiffness: 250 } : { duration: 0 }}
            className={`h-full border-[#2a2723] bg-[#1a1814] shrink-0 overflow-hidden z-40 ${
              isLargeViewport ? "relative border-l" : "absolute right-0 shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
            }`}
          >
            <div className="w-full h-full">
              <TaskPanel 
                activeWorkspaceId={activeWorkspaceId}
                onSync={handleSyncFromPanel}
                onClose={() => handleSetShowTasks(false)}
                onRefer={(scope) => {
                  setActiveScope(scope);
                  if (!isLargeViewport) setShowTasks(false);
                }}
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
      </Authenticated>
    </>
  );
}
