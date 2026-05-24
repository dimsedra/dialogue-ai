import { useState } from "react";
import { Sparkles, X, Check, Zap, Cpu, Menu, LogOut, Brain, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Id, Doc } from "../../../convex/_generated/dataModel";

interface ChatHeaderProps {
  activeSessionTitle: string | undefined;
  currentWorkspace: Doc<"workspaces"> | undefined;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  workspaces: Doc<"workspaces">[] | undefined;
  messageCount: number;
  provider: "gemini" | "lmstudio" | "openai" | "anthropic";
  activeModelName: string;
  isLargeViewport?: boolean;
  onProviderChange: (p: "gemini" | "lmstudio" | "openai" | "anthropic") => void;
  onSignOut: () => void;
  onShowHistory: () => void;
  onShowTasks?: () => void;
}

export function ChatHeader({
  activeSessionTitle,
  currentWorkspace,
  activeWorkspaceId,
  workspaces,
  messageCount,
  provider,
  activeModelName,
  onProviderChange,
  onSignOut,
  onShowHistory,
  onShowTasks,
}: ChatHeaderProps) {
  // Own state — isolated from Chat.tsx
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className="absolute top-0 left-0 right-0 px-4 lg:px-8 py-3 lg:py-4 flex flex-col gap-4 bg-[#0f0e0c]/80 backdrop-blur-xl z-30 border-b border-[#2a2723]/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            {/* Mobile Navigation Toggles */}
            <div className="lg:hidden flex items-center gap-1.5">
              <button
                onClick={onShowHistory}
                className="p-2 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] active:scale-90 transition-all"
                title="Menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Mobile Active Workspace Indicator (Non-interactive indicator in header) */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#1a1814]/50 border border-[#2a2723]/50">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: activeWorkspaceId
                      ? workspaces?.find((w) => w._id === activeWorkspaceId)?.color
                      : "#d4a373",
                  }}
                />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e] max-w-15 truncate">
                  {activeWorkspaceId ? workspaces?.find((w) => w._id === activeWorkspaceId)?.name : "Universal"}
                </span>
              </div>
            </div>

            <div className="hidden lg:block space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-[#f2efeb] tracking-tight truncate max-w-50 lg:max-w-md">
                  {activeSessionTitle || "New Session"}
                </h1>

                {/* Settings / Provider Toggle */}
                <div className="relative ml-2">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#d4a373] hover:border-[#d4a373]/40 transition-all shadow-lg shadow-black/20 group"
                    title="Change AI Provider"
                  >
                    {provider === "gemini" && <Zap className="w-3.5 h-3.5" />}
                    {provider === "openai" && <Sparkles className="w-3.5 h-3.5" />}
                    {provider === "anthropic" && <Brain className="w-3.5 h-3.5" />}
                    {provider === "lmstudio" && <Cpu className="w-3.5 h-3.5" />}
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e] group-hover:text-[#d4a373] transition-colors">
                      {activeModelName}
                    </span>
                  </button>

                  <AnimatePresence>
                    {showSettings && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowSettings(false)}
                          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-60"
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full left-0 mt-3 w-62.5 bg-[#1a1814] border border-[#2a2723] rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-70 space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <h3 className="text-xs font-bold uppercase tracking-widest text-[#f2efeb]">
                                AI Provider
                              </h3>
                              <p className="text-[10px] text-[#a8a29e]">Select your model engine.</p>
                            </div>
                            <button
                              onClick={() => setShowSettings(false)}
                              className="p-1.5 hover:bg-[#2a2723] rounded-lg text-[#a8a29e] transition-all"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                             {( [
                               { id: "gemini", name: "Google Gemini" },
                               { id: "openai", name: "OpenAI" },
                               { id: "anthropic", name: "Anthropic" },
                               { id: "lmstudio", name: "Local LLM (LM Studio)" }
                             ] as const).map((p) => (
                               <button
                                 key={p.id}
                                 onClick={() => onProviderChange(p.id)}
                                 className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${
                                   provider === p.id
                                     ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]"
                                     : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:border-[#3a3733]"
                                 }`}
                               >
                                 <span className="text-xs font-bold">{p.name}</span>
                                 {provider === p.id && <Check className="w-3.5 h-3.5" />}
                               </button>
                             ))}
                           </div>

                          <div className="pt-2 border-t border-[#2a2723]">
                            <button
                              onClick={onSignOut}
                              className="w-full flex items-center gap-3 p-3 rounded-xl text-[#f87171] hover:bg-red-500/10 transition-all group"
                            >
                              <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                              <span className="text-xs font-bold uppercase tracking-widest">Sign Out</span>
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {currentWorkspace && (
                  <Link href={`/workspace/${currentWorkspace._id}`}>
                    <div
                      className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter border cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: `${currentWorkspace.color}15`,
                        borderColor: `${currentWorkspace.color}40`,
                        color: currentWorkspace.color,
                      }}
                    >
                      {currentWorkspace.name}
                    </div>
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 text-[#a8a29e] text-[11px] font-medium">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#d4a373]" /> {currentWorkspace?.agentName || "Dialogue"}
                </span>
                <span>•</span>
                <span>{messageCount} messages</span>
              </div>
            </div>
          </div>
          {onShowTasks && (
            <button
              onClick={onShowTasks}
              className="p-2 lg:p-2.5 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg shrink-0"
              title="Planner"
            >
              <ClipboardList className="w-4 h-4 lg:w-5 lg:h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Session Title */}
      <div className="lg:hidden px-6 py-1.5 border-b border-[#2a2723]/30 bg-[#12110e]">
        <h1 className="text-xs font-bold text-[#a8a29e] uppercase tracking-[0.2em] truncate">
          {activeSessionTitle || "New Session"}
        </h1>
      </div>
    </>
  );
}
