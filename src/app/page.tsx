"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Chat } from "@/components/Chat";
import { TaskPanel } from "@/components/TaskPanel";

import { motion, AnimatePresence } from "framer-motion";
import { SignInForm } from "@/components/auth/SignInForm";
import { Scope } from "@/components/chat/types";
import { usePushSync } from "@/hooks/usePushSync";
import { useAuth } from "@/pb-compat/auth";

export default function Home() {
  usePushSync();
  const [activeSessionId, setActiveSessionId] =
    useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<
    string | undefined
  >(undefined);
  const [activeScope, setActiveScope] = useState<Scope | null>(null);

  // Clear session when workspace changes
  const handleWorkspaceChange = useCallback(
    (
      id: string | undefined,
      sessionId?: string | null,
    ) => {
      setActiveWorkspaceId(id);
      setActiveSessionId(sessionId || null);
    },
    [],
  );

  const [showHistory, setShowHistory] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLargeViewport, setIsLargeViewport] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [initialHeight, setInitialHeight] = useState<number | null>(null);
  const [, setChatInputOffset] = useState(0);

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
        setInitialHeight((prev) =>
          currentHeight > (prev || 0) ? currentHeight : prev,
        );
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
        window.visualViewport.removeEventListener(
          "resize",
          handleViewportChange,
        );
        window.visualViewport.removeEventListener(
          "scroll",
          handleViewportChange,
        );
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

    if (savedHistory !== null) setShowHistory(savedHistory === "true");
    if (savedTasks !== null) setShowTasks(savedTasks === "true");

    // 2. Mark as loaded after a short delay so the initial layout settles without transition animations
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 100);
    return () => clearTimeout(timer);
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
  const handleSetShowHistory = useCallback(
    (val: boolean) => {
      setShowHistory(val);
      if (val && !isLargeViewport) setShowTasks(false);
    },
    [isLargeViewport],
  );

  const handleSetShowTasks = useCallback(
    (val: boolean) => {
      setShowTasks(val);
      if (val && !isLargeViewport) setShowHistory(false);
    },
    [isLargeViewport],
  );

  const syncRef = useRef<(() => void) | null>(null);
  const handleSyncFromPanel = useCallback(() => {
    syncRef.current?.();
    if (!isLargeViewport) {
      handleSetShowTasks(false);
    }
  }, [isLargeViewport, handleSetShowTasks]);

  const pbAuth = useAuth();
  
  if (pbAuth.isLoading) {
    return <div className="min-h-screen bg-[#0f0e0c] flex items-center justify-center">Loading...</div>;
  }
  
  if (!pbAuth.user) {
    return <SignInForm />;
  }

  return (
    <>
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
                onClick={() => {
                  setShowHistory(false);
                  setShowTasks(false);
                }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
              />
            )}
          </AnimatePresence>

          {/* Main Content Area */}
          <motion.div
            layout={isLoaded ? "x" : false}
            className="flex-1 flex h-full overflow-hidden relative"
          >
            <Chat
              isLoaded={isLoaded}
              activeSessionId={activeSessionId as any}
              setActiveSessionIdAction={setActiveSessionId as any}
              activeWorkspaceId={activeWorkspaceId as any}
              setActiveWorkspaceIdAction={handleWorkspaceChange as any}
              activeScope={activeScope}
              setActiveScopeAction={setActiveScope}
              showHistory={showHistory}
              setShowHistoryAction={handleSetShowHistory}
              onSyncRef={syncRef}
              isLargeViewport={isLargeViewport}
              keyboardOffset={keyboardOffset}
              onChatInputResizeAction={setChatInputOffset}
              onShowTasksAction={
                showTasks ? undefined : () => handleSetShowTasks(true)
              }
            />
          </motion.div>

          {/* Task Panel (Collapsible / Overlay) */}
          <motion.div
            initial={false}
            animate={{
              width: isLargeViewport
                ? showTasks
                  ? 320
                  : 0
                : showTasks
                  ? "min(320px, 85vw)"
                  : 0,
              opacity: isLargeViewport
                ? showTasks
                  ? 1
                  : 0
                : showTasks
                  ? 1
                  : 0,
              x: isLargeViewport ? 0 : showTasks ? 0 : "100%",
            }}
            transition={
              isLoaded && isLargeViewport
                ? { type: "spring", damping: 30, stiffness: 250 }
                : { duration: 0 }
            }
            className={`h-full border-[#2a2723] bg-[#1a1814] shrink-0 overflow-hidden z-40 ${
              isLargeViewport
                ? "relative border-l"
                : "absolute right-0 shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
            }`}
          >
            <div className="w-full h-full">
              <TaskPanel
                activeWorkspaceId={activeWorkspaceId as any}
                onSync={handleSyncFromPanel}
                onClose={() => handleSetShowTasks(false)}
                onRefer={(scope) => {
                  setActiveScope(scope);
                  if (!isLargeViewport) setShowTasks(false);
                }}
              />
            </div>
          </motion.div>
        </main>
    </>
  );
}
