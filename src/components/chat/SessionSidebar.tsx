import { useState, useMemo } from "react";
import Link from "next/link";
import { Bot, Plus, Settings, ChevronLeft, Edit3, X, Check, Pin, PinOff } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Doc } from "../../../convex/_generated/dataModel";

interface SessionSidebarProps {
  sessions: Doc<"chatSessions">[] | undefined;
  workspaces: Doc<"workspaces">[] | undefined;
  activeSessionId: Id<"chatSessions"> | null;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  showHistory: boolean;
  isLargeViewport: boolean;
  onSelectSession: (id: Id<"chatSessions">) => void;
  onSelectWorkspaceSession: (workspaceId: Id<"workspaces">, sessionId: Id<"chatSessions">) => void;
  onNewChat: () => void;
  onDeleteChat: (id: Id<"chatSessions">, e: React.MouseEvent) => void;
  onSelectWorkspace: (id: Id<"workspaces"> | undefined) => void;
  onOpenCreateWorkspace: () => void;
  onCloseHistory: () => void;
}

export function SessionSidebar({
  sessions,
  workspaces,
  activeSessionId,
  activeWorkspaceId,
  showHistory,
  isLargeViewport,
  onSelectSession,
  onSelectWorkspaceSession,
  onNewChat,
  onDeleteChat,
  onSelectWorkspace,
  onOpenCreateWorkspace,
  onCloseHistory,
}: SessionSidebarProps) {
  // Own state — isolated from Chat.tsx to prevent cross-component re-renders
  const [editingSessionId, setEditingSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const renameSession = useMutation(api.messages.renameSession);
  const togglePinSession = useMutation(api.messages.togglePinSession);

  const startEditing = (id: Id<"chatSessions">, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setEditTitle(title);
  };

  const handleRename = async (id: Id<"chatSessions">) => {
    if (editTitle.trim()) {
      await renameSession({ id, title: editTitle.trim() });
    }
    setEditingSessionId(null);
  };

  const handleTogglePin = async (id: Id<"chatSessions">, e: React.MouseEvent) => {
    e.stopPropagation();
    await togglePinSession({ id });
  };

  const pinnedSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .filter((s) => s.pinned)
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }, [sessions]);

  const historySessions = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .filter((s) => !s.pinned)
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }, [sessions]);

  const renderSessionItem = (session: Doc<"chatSessions">) => (
    <div
      key={session._id}
      onClick={() => {
        if (!activeWorkspaceId && session.workspaceId) {
          onSelectWorkspaceSession(session.workspaceId, session._id);
        } else {
          onSelectSession(session._id);
        }
        if (!isLargeViewport) {
          onCloseHistory();
        }
      }}
      className={`group flex items-center justify-between p-2.5 lg:p-3.5 rounded-2xl cursor-pointer transition-all duration-300 ${
        activeSessionId === session._id 
          ? "bg-[#2a2723] text-[#f2efeb]" 
          : "text-[#a8a29e] hover:bg-[#1f1d19] hover:text-[#f2efeb]"
      }`}
    >
      <div className="flex-1 flex items-center gap-3 truncate mr-2">
        <div className={`w-1.5 h-1.5 rounded-full transition-all shrink-0 ${activeSessionId === session._id ? "bg-[#d4a373] scale-100" : "bg-transparent scale-0"}`} />
        {editingSessionId === session._id ? (
          <input
            autoFocus
            name="chat-session-rename"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename(session._id)}
            onBlur={() => handleRename(session._id)}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent border-none outline-none text-sm font-medium w-full text-[#f2efeb]"
          />
        ) : (
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              {session.pinned && <span className="text-[10px] shrink-0">📌</span>}
              <span className="text-sm font-medium truncate">{session.title}</span>
            </div>

            {!activeWorkspaceId && session.workspaceId && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div 
                  className="w-1 h-1 rounded-full" 
                  style={{ backgroundColor: workspaces?.find(w => w._id === session.workspaceId)?.color }} 
                />
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]/60 truncate">
                  {workspaces?.find(w => w._id === session.workspaceId)?.name}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={`flex items-center shrink-0 transition-all ${session.pinned ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"}`}>
        {editingSessionId !== session._id && (
          <>
            <button 
              onClick={(e) => handleTogglePin(session._id, e)}
              className={`p-1 transition-all mr-1 ${session.pinned ? "text-[#d4a373]" : "hover:text-[#d4a373]"}`}
              title={session.pinned ? "Unpin session" : "Pin session"}
            >
              {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button 
              onClick={(e) => startEditing(session._id, session.title || "", e)}
              className="p-1 hover:text-[#d4a373] transition-all mr-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={(e) => onDeleteChat(session._id, e)}
              className="p-1 hover:text-red-400 transition-all shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {editingSessionId === session._id && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleRename(session._id); }}
            className="p-1 text-[#d4a373] transition-all"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={false}
      animate={{ 
        width: isLargeViewport ? (showHistory ? 288 : 0) : (showHistory ? "min(288px, 85vw)" : 0),
        opacity: isLargeViewport ? (showHistory ? 1 : 0) : (showHistory ? 1 : 0),
        x: isLargeViewport ? 0 : (showHistory ? 0 : "-100%")
      }}
      transition={isLargeViewport ? { type: "spring", damping: 30, stiffness: 250 } : { duration: 0 }}
      className={`h-full border-[#2a2723] bg-[#1a1814] shrink-0 z-[100] overflow-hidden ${
        isLargeViewport ? "relative border-r" : "fixed left-0 shadow-[20px_0_40px_rgba(0,0,0,0.5)]"
      }`}
    >
      <div className="w-full h-full flex overflow-hidden">
          {/* Mobile Workspace Rail (Inside the Drawer) */}
          <div className="lg:hidden w-[72px] h-full bg-[#141210] border-r border-[#2a2723] flex flex-col items-center pt-10 pb-6 gap-6 shrink-0">
            <button 
              onClick={() => onSelectWorkspace(undefined)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${!activeWorkspaceId ? 'bg-[#d4a373] shadow-lg shadow-[#d4a373]/20' : 'bg-[#0f0e0c] border border-[#2a2723] text-[#a8a29e]'}`}
            >
              <Bot className={`w-5 h-5 ${!activeWorkspaceId ? 'text-[#0f0e0c]' : ''}`} />
            </button>
            
            <div className="w-8 h-[1px] bg-[#2a2723]" />
            
            <div className="flex-1 flex flex-col items-center gap-4 overflow-y-auto scrollbar-hide w-full px-2 pt-4">
              {workspaces === undefined ? (
                // Workspace Skeletons
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-xl bg-[#1a1814] animate-pulse border border-[#2a2723]" />
                ))
              ) : workspaces?.map((ws) => (
                <button
                  key={ws._id}
                  onClick={() => onSelectWorkspace(ws._id)}
                  className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-all ${activeWorkspaceId === ws._id ? 'ring-2 ring-[#d4a373] ring-offset-2 ring-offset-[#141210]' : 'bg-[#0f0e0c] border border-[#2a2723]'}`}
                >
                  <span className="text-lg">{ws.icon && ws.icon.length < 3 ? ws.icon : ws.name[0]}</span>
                </button>
              ))}
              
              {/* Add Workspace Button for Mobile */}
              <button
                onClick={onOpenCreateWorkspace}
                className="w-10 h-10 rounded-xl bg-[#1a1814]/40 border border-dashed border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:border-[#d4a373]/40 hover:text-[#d4a373] transition-all shrink-0"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Settings Access */}
            <Link
              href="/settings"
              className="w-10 h-10 rounded-xl bg-[#0f0e0c] border border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:text-[#d4a373] transition-all"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>

          {/* History List */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#1a1814] relative">
            <button
              onClick={onCloseHistory}
              className="absolute left-full top-1/2 -translate-y-1/2 z-[110] w-7 h-16 rounded-r-2xl bg-[#d4a373] text-[#0f0e0c] flex items-center justify-center transition-all shadow-[10px_0_30px_rgba(0,0,0,0.4)] lg:hidden active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <header className="p-4 lg:p-6 shrink-0 space-y-4 lg:space-y-6">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#d4a373]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2efeb]">
                    {activeWorkspaceId 
                      ? workspaces?.find(w => w._id === activeWorkspaceId)?.name 
                      : "Universal Chat"}
                  </span>
                </div>
                <button
                  onClick={onCloseHistory}
                  className="hidden lg:flex p-1.5 rounded-lg text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
                  title="Hide History"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <button 
                onClick={onNewChat}
                className="w-full flex items-center justify-center gap-2.5 py-3 lg:py-3.5 rounded-2xl bg-[#d4a373] hover:bg-[#c39262] text-[#0f0e0c] text-sm font-bold transition-all duration-300 shadow-lg shadow-[#d4a373]/10"
              >
                <Plus className="w-4 h-4" />
                New Session
              </button>
            </header>

          
          <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #1a1814; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2723; border-radius: 2px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4a373; }
          `}</style>
          <div className="flex-1 overflow-y-auto px-3 py-2 lg:py-4 space-y-0.5 lg:space-y-1 custom-scrollbar">
            {pinnedSessions.length > 0 && (
              <div className="mb-4">
                <div className="px-3 mb-2 sticky top-0 bg-[#1a1814] py-2 z-10 flex items-center gap-1.5">
                  <Pin className="w-3 h-3 text-[#d4a373]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a373]">Pinned</span>
                </div>
                <div className="space-y-0.5 lg:space-y-1">
                  {pinnedSessions.map(renderSessionItem)}
                </div>
              </div>
            )}

            {historySessions.length > 0 && (
              <div>
                <div className="px-3 mb-2 sticky top-0 bg-[#1a1814] py-2 z-10">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/50">History</span>
                </div>
                <div className="space-y-0.5 lg:space-y-1">
                  {historySessions.map(renderSessionItem)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
