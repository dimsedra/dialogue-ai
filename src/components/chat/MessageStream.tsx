import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Sparkles, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../../convex/_generated/dataModel";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ScrollToBottom } from "./ScrollToBottom";

interface MessageStreamProps {
  messages: Array<{
    _id: string;
    author: string;
    text: string;
    reasoning?: string;
    timestamp: number;
    toolCall?: unknown;
    toolCalls?: unknown[];
    attachments?: Array<{
      storageId: string;
      fileName?: string;
      fileType?: string;
    }>;
    storageId?: string;
    fileName?: string;
    fileType?: string;
    sessionId?: unknown;
    scope?: {
      type: "date" | "task" | "event" | "habit";
      id: string;
      title: string;
    };
  }> | undefined;
  activeSessionId: Id<"chatSessions"> | null;
  isTyping: boolean;
  isSyncing: boolean;
  isLargeViewport: boolean;
  keyboardOffset: number;
  onTypingDone: () => void;
  agentName?: string;
  onLoadOlder?: () => void;
  canLoadOlder?: boolean;
  isLoadingOlder?: boolean;
  children?: React.ReactNode;
}

export const MessageStream = React.memo(function MessageStream({
  messages,
  activeSessionId,
  isTyping,
  isSyncing,
  isLargeViewport,
  keyboardOffset,
  onTypingDone,
  agentName,
  onLoadOlder,
  canLoadOlder,
  isLoadingOlder,
  children,
}: MessageStreamProps) {
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadOlderSentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollSessionIdRef = useRef<Id<"chatSessions"> | null>(null);
  const lastAnchoredSessionIdRef = useRef<Id<"chatSessions"> | null>(null);
  const prevMessageCountRef = useRef(0);
  const prevScrollHeightRef = useRef<number>(0);
  const expectedLengthOnLoadRef = useRef<number | null>(null);

  // Auto-load older messages when the top sentinel enters the viewport.
  useEffect(() => {
    const sentinel = loadOlderSentinelRef.current;
    const scroller = mainScrollRef.current;
    if (!sentinel || !scroller || !onLoadOlder || !canLoadOlder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && canLoadOlder && !isLoadingOlder) {
          prevScrollHeightRef.current = scroller.scrollHeight;
          expectedLengthOnLoadRef.current = messages?.length ?? 0;
          onLoadOlder();
        }
      },
      { root: scroller, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadOlder, canLoadOlder, isLoadingOlder, messages?.length]);

  const anchorToMessage = useCallback((targetId?: string, block: ScrollLogicalPosition = "center") => {
    if (targetId) {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "instant", block });
        return;
      }
    }
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = mainScrollRef.current.scrollHeight;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, []);

  const scrollToBottom = useCallback((forceInstant?: boolean | React.MouseEvent) => {
    const isInstant = forceInstant === true || activeSessionId !== prevScrollSessionIdRef.current;
    if (activeSessionId) {
      prevScrollSessionIdRef.current = activeSessionId;
    }
    if (isInstant) {
      const targetMsg = messages && messages.length > 0 ? ([...messages].reverse().find(m => m.author === "User") || messages[messages.length - 1]) : undefined;
      anchorToMessage(targetMsg?._id, "center");
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSessionId, messages, anchorToMessage]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollBottom(!isAtBottom);
  };

  // Auto-scroll during streaming if user is already at the bottom
  useLayoutEffect(() => {
    if (!showScrollBottom && mainScrollRef.current) {
      mainScrollRef.current.scrollTop = mainScrollRef.current.scrollHeight;
    }
  }, [messages, showScrollBottom]);

  // Instant session anchoring: useLayoutEffect fires synchronously after DOM commit,
  // BEFORE browser paint, so the first visible frame is already at the correct position.
  useLayoutEffect(() => {
    if (!messages) return;
    const scroller = mainScrollRef.current;

    // Preserve scroll position after loading older messages: the new batch is
    // prepended to the visible list, so we offset scrollTop by the height delta
    // so the user's view stays anchored to the same messages.
    if (
      expectedLengthOnLoadRef.current !== null &&
      scroller &&
      messages.length > expectedLengthOnLoadRef.current
    ) {
      const oldHeight = prevScrollHeightRef.current;
      const newHeight = scroller.scrollHeight;
      scroller.scrollTop = scroller.scrollTop + (newHeight - oldHeight);
      expectedLengthOnLoadRef.current = null;
      return;
    }

    if (activeSessionId && messages.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isCorrectSessionData = (messages[0] && (messages[0] as any).sessionId === activeSessionId);
      if (isCorrectSessionData && activeSessionId !== lastAnchoredSessionIdRef.current) {
        lastAnchoredSessionIdRef.current = activeSessionId;
        setShowScrollBottom(false);

        const targetMsg = [...messages].reverse().find(m => m.author === "User") || messages[messages.length - 1];
        const targetId = targetMsg?._id;

        const executeAnchor = () => anchorToMessage(targetId, "start");
        executeAnchor();
        requestAnimationFrame(executeAnchor);
        setTimeout(executeAnchor, 50);
        setTimeout(executeAnchor, 200);
      }
    }
  }, [activeSessionId, messages, anchorToMessage]);

  useEffect(() => {
    if (!messages || messages.length === 0) {
      prevMessageCountRef.current = 0;
      return;
    }

    const prevCount = prevMessageCountRef.current;
    const newCount = messages.length;
    prevMessageCountRef.current = newCount;

    // New message(s) appeared (not initial load or session switch — those are handled by useLayoutEffect)
    if (newCount > prevCount && prevCount > 0) {
      const newestMsg = messages[newCount - 1];

      // User's own message just appeared → anchor it to the top of the viewport
      if (newestMsg.author === "User") {
        anchorToMessage(newestMsg._id, "start");
      }
      // AI response arrived → re-anchor to user's last message at "start"
      // so the user sees their prompt at top with AI response flowing below
      else if (newestMsg.author === "AI") {
        const lastUserMsg = [...messages].reverse().find(m => m.author === "User");
        if (lastUserMsg) {
          anchorToMessage(lastUserMsg._id, "start");
        }
      }
    }

    // Clear typing indicator when last message is from AI
    if (isTyping && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.author === "AI") {
        setTimeout(() => onTypingDone(), 0);
      }
    }
  }, [messages, isTyping, anchorToMessage, onTypingDone]);

  return (
    <>
      <main 
        ref={mainScrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 lg:px-8 pt-24 lg:pt-32 space-y-6 lg:space-y-12 custom-scrollbar lg:scrollbar-default scrollbar-hide [overflow-anchor:none]"
      >

        <div className="max-w-4xl mx-auto flex flex-col">
          <AnimatePresence>
          {(isSyncing || (messages === undefined && activeSessionId)) ? (
            <motion.div 
              key="synchronizing"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0 }}
              className="flex-1 flex flex-col items-center justify-center min-h-[75svh] space-y-6"
            >
              <Sparkles className="w-10 h-10 text-[#d4a373] animate-spin-slow" />
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#d4a373]/50">Synchronizing</p>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-[#d4a373]/30 animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1 h-1 rounded-full bg-[#d4a373]/30 animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1 h-1 rounded-full bg-[#d4a373]/30 animate-bounce" />
                </div>
              </div>
            </motion.div>
          ) : messages === undefined || !activeSessionId ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center min-h-[75svh] space-y-8"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-[#d4a373]/20 blur-3xl rounded-full group-hover:bg-[#d4a373]/30 transition-all duration-500" />
                <div className="relative w-24 h-24 rounded-4xl bg-[#1a1814] border border-[#d4a373]/20 flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] group-hover:border-[#d4a373]/40 transition-all duration-500">
                  <Bot className="w-10 h-10 text-[#d4a373]" />
                </div>
              </div>
              
              <div className="text-center space-y-3">
                <h3 className="text-2xl font-bold text-[#f2efeb] tracking-tight">Dialogue Initialized</h3>
                <p className="text-sm text-[#a8a29e] max-w-70 leading-relaxed mx-auto">
                  Select a session from the history or start a fresh conversation to begin.
                </p>
              </div>
            </motion.div>
            ) : messages.length === 0 ? (
              <motion.div 
                key="no-messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-sm mx-auto"
              >
                <div className="w-16 h-16 rounded-3xl bg-[#1a1814] border border-[#2a2723] flex items-center justify-center shadow-2xl">
                  <Bot className="w-8 h-8 text-[#d4a373]/40" />
                </div>
                <div className="space-y-2">
                  <p className="text-[#f2efeb] font-medium italic">&quot;The best way to predict the future is to create it.&quot;</p>
                  <p className="text-[#a8a29e] text-xs leading-relaxed">Dialogue is ready to help you manage your tasks and thoughts with clarity.</p>
                </div>
              </motion.div>
            ) : (
              <div 
                key={`chat-messages-${activeSessionId || "default"}`}
                className="space-y-6 lg:space-y-12"
              >
                {/* Sentinel + Load Older button at the top of the message list */}
                {canLoadOlder && (
                  <div className="flex flex-col items-center gap-2 pb-2">
                    <div ref={loadOlderSentinelRef} className="h-px w-full" />
                    {onLoadOlder && (
                      <button
                        type="button"
                        onClick={() => {
                          const scroller = mainScrollRef.current;
                          if (scroller) {
                            prevScrollHeightRef.current = scroller.scrollHeight;
                            expectedLengthOnLoadRef.current = messages.length;
                          }
                          onLoadOlder();
                        }}
                        disabled={isLoadingOlder}
                        className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-[#2a2723]/60 text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/40 disabled:opacity-40 transition-all"
                      >
                        {isLoadingOlder ? "Loading…" : "Load older"}
                      </button>
                    )}
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {[...messages].map((msg, index) => (
                    <MessageBubble
                      key={msg._id}
                      msg={msg}
                      isLargeViewport={isLargeViewport}
                      agentName={agentName}
                      isStreaming={isTyping && index === messages.length - 1 && msg.author === "AI"}
                    />
                  ))}

                  {/* Typing Indicator \u2014 only show before the first streaming bubble appears */}
                  {isTyping && !(messages[messages.length - 1]?.author === "AI") && <TypingIndicator agentName={agentName} />}
                </AnimatePresence>

              {/* Tool approval cards — inline in scroll */}
              {children}

              {/* Ganjalan: Ensures last message is always pushed above the tray */}
              <div
                style={{ height: isLargeViewport ? "180px" : `calc(120px + ${keyboardOffset}px)` }}
                className="w-full shrink-0"
              />
              <div ref={messagesEndRef} className="h-px w-full" />
            </div>
          )}
        </AnimatePresence>
      </div>
    </main>

      {/* Premium Centered Scroll Down Button (Gemini Style) */}
      <ScrollToBottom
        visible={showScrollBottom}
        onClick={scrollToBottom}
        isLargeViewport={isLargeViewport}
        keyboardOffset={keyboardOffset}
      />
    </>
  );
});
