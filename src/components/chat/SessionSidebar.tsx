import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus, Settings, ChevronLeft, Edit3, X, Check, Pin, PinOff, MoreVertical, Trash2, LayoutDashboard, ChevronDown } from "lucide-react";
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
  onNewChat: (workspaceId?: Id<"workspaces">) => void;
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
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [selectedWsId, setSelectedWsId] = useState<Id<"workspaces"> | undefined>(undefined);

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

  const handleTogglePin = async (id: Id<"chatSessions">, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await togglePinSession({ id });
    setActionMenuSessionId(null);
  };

  const [actionMenuSessionId, setActionMenuSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [sheetRenameMode, setSheetRenameMode] = useState(false);
  const [sheetRenameTitle, setSheetRenameTitle] = useState("");

  const [dropdownAnchor, setDropdownAnchor] = useState<{ top: number; left: number } | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!actionMenuSessionId || !isLargeViewport) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-session-dropdown]")) {
        setActionMenuSessionId(null);
        setDropdownAnchor(null);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [actionMenuSessionId, isLargeViewport]);

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
      className={`group relative flex items-center justify-between p-2 lg:p-2.5 rounded-xl cursor-pointer transition-all duration-300 ${
        activeSessionId === session._id 
          ? "bg-[#2a2723] text-[#f2efeb]" 
          : "text-[#a8a29e] hover:bg-[#1f1d19] hover:text-[#f2efeb]"
      }`}
    >
      <div className="flex-1 flex items-center gap-2.5 truncate mr-2">
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
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium truncate">{session.title}</span>
              </div>

              {!activeWorkspaceId && session.workspaceId && (
                <div className="flex items-center gap-1.5">
                  <div 
                    className="w-1 h-1 rounded-full" 
                    style={{ backgroundColor: workspaces?.find(w => w._id === session.workspaceId)?.color }} 
                  />
                  <span className="text-[8px] font-bold uppercase tracking-wider text-[#a8a29e]/50 truncate">
                    {workspaces?.find(w => w._id === session.workspaceId)?.name}
                  </span>
                </div>
              )}
            </div>
        )}
      </div>

      {/* Actions: universal ⋯ button with dropdown */}
      {editingSessionId === session._id ? (
        <button 
          onClick={(e) => { e.stopPropagation(); handleRename(session._id); }}
          className="p-1 text-[#d4a373] transition-all shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (actionMenuSessionId === session._id) {
                setActionMenuSessionId(null);
                setDropdownAnchor(null);
              } else {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropdownAnchor({ top: rect.top - 4, left: rect.right + 8 });
                setActionMenuSessionId(session._id);
              }
            }}
            className="p-1 text-[#a8a29e] hover:text-[#d4a373] transition-all"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
    <motion.div
      initial={false}
      animate={{ 
        width: isLargeViewport ? (showHistory ? 260 : 0) : (showHistory ? "min(320px, 88vw)" : 0),
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
              <LayoutDashboard className={`w-5 h-5 ${!activeWorkspaceId ? 'text-[#0f0e0c]' : ''}`} />
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

            <header className="p-3 lg:p-4 shrink-0 space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: activeWorkspaceId
                        ? (workspaces?.find(w => w._id === activeWorkspaceId)?.color || "#d4a373")
                        : "#d4a373"
                    }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2efeb]">
                    {activeWorkspaceId 
                      ? workspaces?.find(w => w._id === activeWorkspaceId)?.name 
                      : "Dashboard"}
                  </span>
                </div>
                <button
                  onClick={onCloseHistory}
                  className="hidden lg:flex p-1 rounded-lg text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
                  title="Hide History"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {!activeWorkspaceId ? (
              <div className="relative flex items-center w-full">
                <button 
                  onClick={() => {
                    if (!selectedWsId && workspaces && workspaces.length > 0) {
                      setWsDropdownOpen(true);
                      return;
                    }
                    onNewChat(selectedWsId);
                  }}
                  className="flex items-center justify-center gap-2 py-2 flex-1 rounded-l-xl bg-[#2a2723] hover:bg-[#3a3733] text-[#a8a29e] hover:text-[#f2efeb] text-[11px] font-bold transition-all duration-300"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Session
                </button>
                <button
                  onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-r-xl bg-[#2a2723] hover:bg-[#3a3733] text-[#a8a29e] hover:text-[#f2efeb] text-[11px] font-bold transition-all duration-300 border-l border-[#1a1814]"
                >
                  {workspaces?.find(w => w._id === selectedWsId)?.name
                    ? workspaces.find(w => w._id === selectedWsId)!.name.substring(0, 2).toUpperCase()
                    : "A"}
                  <ChevronDown className="w-3 h-3" />
                </button>

                {wsDropdownOpen && workspaces && workspaces.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setWsDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-full rounded-xl border border-[#2a2723] bg-[#1a1814] shadow-2xl z-50 overflow-hidden">
                      {workspaces.map((ws) => (
                        <button
                          key={ws._id}
                          onClick={() => {
                            setSelectedWsId(ws._id);
                            setWsDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-bold transition-all hover:bg-[#2a2723] text-left"
                          style={{ color: selectedWsId === ws._id ? "#d4a373" : "#a8a29e" }}
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              ) : (
              <button 
                onClick={() => onNewChat()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#2a2723] hover:bg-[#3a3733] text-[#a8a29e] hover:text-[#f2efeb] text-[11px] font-bold transition-all duration-300"
              >
                <Plus className="w-3.5 h-3.5" />
                New Session
              </button>
              )}

            {/* Workspace Settings Section */}
            {activeWorkspaceId && (() => {
              const ws = workspaces?.find(w => w._id === activeWorkspaceId);
              if (!ws) return null;
              return (
                <Link
                  href={`/workspace/${ws._id}`}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#2a2723] hover:bg-[#3a3733] text-[#a8a29e] hover:text-[#f2efeb] text-[11px] font-bold transition-all duration-300"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Workspace Settings
                </Link>
              );
            })()}
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
                <div className="px-3 sticky top-0 bg-[#1a1814] py-1.5 z-10 flex items-center gap-1">
                  <Pin className="w-2.5 h-2.5 text-[#d4a373]" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#d4a373]">Pinned</span>
                </div>
                <div className="space-y-0.5 lg:space-y-1">
                  {pinnedSessions.map(renderSessionItem)}
                </div>
              </div>
            )}

            {historySessions.length > 0 && (
              <div>
                <div className="px-3 sticky top-0 bg-[#1a1814] py-1.5 z-10">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/50">History</span>
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

    {/* Mobile Action Bottom Sheet */}
    {actionMenuSessionId && (() => {
      const session = sessions?.find(s => s._id === actionMenuSessionId);
      if (!session) return null;
      return (
        <div 
          className="lg:hidden fixed inset-0 z-[200] flex items-end justify-center"
          onClick={() => { setActionMenuSessionId(null); setSheetRenameMode(false); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Sheet */}
          <div 
            className="relative w-full max-w-sm mx-4 mb-6 bg-[#1a1814] border border-[#2a2723] rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-[#2a2723]/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/50">
                {sheetRenameMode ? "Rename Session" : "Session Actions"}
              </p>
              {!sheetRenameMode && (
                <p className="text-sm font-medium text-[#f2efeb] mt-1 truncate">{session.title || "Untitled"}</p>
              )}
            </div>

            {sheetRenameMode ? (
              /* Rename Mode */
              <div className="px-5 py-4 space-y-4">
                <input
                  autoFocus
                  value={sheetRenameTitle}
                  onChange={(e) => setSheetRenameTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sheetRenameTitle.trim()) {
                      renameSession({ id: session._id, title: sheetRenameTitle.trim() });
                      setActionMenuSessionId(null);
                      setSheetRenameMode(false);
                    }
                  }}
                  placeholder="Session title..."
                  className="w-full px-4 py-3 rounded-2xl bg-[#0f0e0c] border border-[#2a2723] text-[#f2efeb] text-sm placeholder:text-[#a8a29e]/40 outline-none focus:border-[#d4a373]/50 transition-all"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setSheetRenameMode(false)}
                    className="flex-1 py-3 rounded-2xl bg-[#2a2723] text-[#a8a29e] text-sm font-bold transition-all active:bg-[#3a3733]"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (sheetRenameTitle.trim()) {
                        renameSession({ id: session._id, title: sheetRenameTitle.trim() });
                      }
                      setActionMenuSessionId(null);
                      setSheetRenameMode(false);
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#d4a373] text-[#0f0e0c] text-sm font-bold transition-all active:bg-[#c39262]"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              /* Actions Mode */
              <>
                <div className="py-2">
                  <button
                    onClick={() => handleTogglePin(session._id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left text-[#f2efeb] active:bg-[#2a2723] transition-all"
                  >
                    {session.pinned 
                      ? <PinOff className="w-5 h-5 text-[#d4a373]" />
                      : <Pin className="w-5 h-5 text-[#a8a29e]" />
                    }
                    <span className="text-sm font-medium">{session.pinned ? "Unpin Session" : "Pin Session"}</span>
                  </button>

                  <button
                    onClick={() => {
                      setSheetRenameTitle(session.title || "");
                      setSheetRenameMode(true);
                    }}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left text-[#f2efeb] active:bg-[#2a2723] transition-all"
                  >
                    <Edit3 className="w-5 h-5 text-[#a8a29e]" />
                    <span className="text-sm font-medium">Rename Session</span>
                  </button>

                  <button
                    onClick={(e) => {
                      setActionMenuSessionId(null);
                      onDeleteChat(session._id, e as unknown as React.MouseEvent);
                    }}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left text-red-400 active:bg-[#2a2723] transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Delete Session</span>
                  </button>
                </div>

                {/* Cancel */}
                <div className="px-4 pb-4 pt-1">
                  <button
                    onClick={() => setActionMenuSessionId(null)}
                    className="w-full py-3 rounded-2xl bg-[#2a2723] text-[#a8a29e] text-sm font-bold transition-all active:bg-[#3a3733]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    })()}

      {/* Portal dropdown — opens rightward from action button */}
      {actionMenuSessionId && dropdownAnchor && (() => {
        const session = sessions?.find(s => s._id === actionMenuSessionId);
        if (!session) return null;
        return createPortal(
          <div
            data-session-dropdown
            className="fixed z-[300] min-w-[160px] rounded-xl bg-[#1a1815] border border-[#2a2723] shadow-xl py-1.5 overflow-hidden"
            style={{ top: dropdownAnchor.top, left: dropdownAnchor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { handleTogglePin(session._id, e); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-[#f2efeb] hover:bg-[#d4a373]/10 hover:text-[#d4a373] transition-colors text-left"
            >
              {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {session.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(session._id, session.title || "", e); setActionMenuSessionId(null); setDropdownAnchor(null); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-[#f2efeb] hover:bg-[#d4a373]/10 hover:text-[#d4a373] transition-colors text-left"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Rename
            </button>
            <div className="border-t border-[#2a2723]/50 my-1" />
            <button
              onClick={(e) => { e.stopPropagation(); setActionMenuSessionId(null); setDropdownAnchor(null); onDeleteChat(session._id, e); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>,
          document.body
        );
      })()}
    </>
  );
}
