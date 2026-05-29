import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";
import { Bot, Sparkles, Plus, Pin, Calendar, CheckCircle2, ArrowRight, Brush, Menu, ClipboardList, ChevronDown } from "lucide-react";
import { useState } from "react";
import { PageCustomizer } from "./PageCustomizer";
import { usePageSettings } from "../../hooks/usePageSettings";
import { DASHBOARD_DEFAULTS, getCardBgStyle } from "../../utils/color";
import { NotificationBell } from "../notifications-bell";

interface DashboardProps {
  workspaces: Doc<"workspaces">[] | undefined;
  sessions: Doc<"chatSessions">[] | undefined;
  profile: { name?: string; bio?: string } | null | undefined;
  isLargeViewport: boolean;
  onNewChat: (workspaceId?: Id<"workspaces"> | null, agentPersonaId?: Id<"agentPersonas">, initialMessage?: string) => void;
  onSelectSession: (id: Id<"chatSessions">) => void;
  onShowHistory: () => void;
  onShowTasks?: () => void;
}

export function Dashboard({
  workspaces,
  sessions,
  profile,
  isLargeViewport,
  onNewChat,
  onSelectSession,
  onShowHistory,
  onShowTasks,
}: DashboardProps) {
  const [showBgEditor, setShowBgEditor] = useState(false);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [selectedWsId, setSelectedWsId] = useState<Id<"workspaces"> | undefined>(undefined);
  const [wsWarning, setWsWarning] = useState(false);
  const [bgSettings, updateBgSettings] = usePageSettings("dashboard", DASHBOARD_DEFAULTS);

  const [selectedPersonaId, setSelectedPersonaId] = useState<Id<"agentPersonas"> | undefined>(undefined);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [inputText, setInputText] = useState("");

  const personas = useQuery(api.personas.list);
  const activePersona = personas?.find(p => p._id === selectedPersonaId) || personas?.find(p => p.isDefault);
  const activePersonaName = activePersona?.name || "Dialogue";

  const resolvedBgUrl = useQuery(
    api.messages.getStorageUrl,
    bgSettings.storageId ? { storageId: bgSettings.storageId as Id<"_storage"> } : "skip"
  );
  const bgUrl = resolvedBgUrl ?? bgSettings.url;

  const cardBgStyle = getCardBgStyle(bgSettings);

  const allTasks = useQuery(api.tasks.list, {});
  const allEvents = useQuery(api.events.list, {});

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 86400000;

  const todayTasks = allTasks?.filter(t =>
    !t.completed && t.dueDate && t.dueDate >= startOfDay && t.dueDate < endOfDay
  ) || [];

  const todayEvents = allEvents?.filter(e =>
    e.startTime >= startOfDay && e.startTime < endOfDay
  ) || [];

  const pinnedSessions = sessions?.filter(s => s.pinned) || [];
  const recentSessions = sessions
    ?.filter(s => !s.pinned)
    .sort((a, b) => (b.lastActivity || b.createdAt) - (a.lastActivity || a.createdAt))
    .slice(0, 1) || [];

  const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening";
  const userName = profile?.name || "there";

  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex-1 flex flex-col items-center min-h-0 relative overflow-hidden w-full">
      {/* Background Image Overlay */}
      {bgUrl && (
        <>
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${bgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: (bgSettings.opacity ?? 30) / 100,
              filter: bgSettings.blur > 0 ? `blur(${bgSettings.blur / 5}px)` : "none",
            }}
          />
          {bgSettings.grain > 0 && (
            <div
              className="fixed inset-0 pointer-events-none mix-blend-overlay"
              style={{
                opacity: (bgSettings.grain / 100) * 0.07,
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' octaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                backgroundSize: "256px 256px",
              }}
            />
          )}
        </>
      )}
      <div className="relative z-10 flex flex-col items-center w-full min-h-0 flex-1 overflow-y-auto">
        {/* Push greeting to vertical center */}
        <div className="flex-1 min-h-12" />

        {/* Hero Greeting — centered x and y */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center space-y-3 relative px-4"
        >
          {bgSettings.vfxEnabled && (
            <div
              className="absolute -top-60 left-1/2 w-200 h-150 rounded-full pointer-events-none"
              style={{
                marginLeft: "-400px",
                background: `radial-gradient(ellipse at center, ${bgSettings.vfxColor}26 0%, transparent 70%)`,
                animation: "pulse-glow 4s ease-in-out infinite",
              }}
            />
          )}
          <h1 className="text-4xl font-bold tracking-tight relative"
              style={{ color: bgSettings.primaryText }}>
            Good {timeOfDay}, {userName}.
          </h1>
          <p className="text-base font-medium relative"
             style={{ color: bgSettings.secondaryText }}>{dayName}, {dateStr}</p>
        </motion.div>

        {/* Push content below */}
        <div className="flex-1 min-h-8" />

        {/* Content sections */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="max-w-lg w-full space-y-8 pb-16 px-4"
        >

        {/* Today's Snapshot */}
        <div
          className="rounded-xl border p-5 space-y-3"
          style={cardBgStyle}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: bgSettings.accentColor }} />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: bgSettings.secondaryText }}>Today</span>
          </div>

          {todayTasks.length === 0 && todayEvents.length === 0 ? (
            <p className="text-sm" style={{ color: bgSettings.secondaryText }}>Nothing due today. Take a breather.</p>
          ) : (
            <div className="flex gap-6">
              {todayTasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: bgSettings.accentColor }} />
                  <span className="text-sm font-medium" style={{ color: bgSettings.primaryText }}>{todayTasks.length} task{todayTasks.length > 1 ? "s" : ""} due</span>
                </div>
              )}
              {todayEvents.length > 0 && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" style={{ color: bgSettings.accentColor }} />
                  <span className="text-sm font-medium" style={{ color: bgSettings.primaryText }}>{todayEvents.length} event{todayEvents.length > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Centered Chat Input Bar */}
        <div className="w-full max-w-lg px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputText.trim()) {
                onNewChat(null, activePersona?._id, inputText.trim());
                setInputText("");
              }
            }}
            className="relative flex items-center w-full rounded-full border border-[#2a2723]/60 p-1.5 transition-all duration-300 focus-within:border-[#d4a373]/60 focus-within:shadow-[0_0_20px_rgba(212,163,115,0.08)]"
            style={cardBgStyle}
          >
            {/* Agent Persona Switcher */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                className="w-8 h-8 rounded-full bg-[#2a2723] hover:bg-[#3a3733] text-[#d4a373] flex items-center justify-center text-[10px] font-black uppercase transition-all duration-300 cursor-pointer"
                title="Change Agent Persona"
              >
                {activePersona ? activePersona.name.substring(0, 2) : "DI"}
              </button>

              {agentDropdownOpen && personas && personas.length > 0 && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAgentDropdownOpen(false)} />
                  <div 
                    className="absolute left-0 bottom-full mb-3.5 w-60 rounded-2xl border border-[#2a2723] shadow-2xl z-50 overflow-hidden"
                    style={cardBgStyle}
                  >
                    <div className="px-3 py-2 border-b border-[#2a2723]/50">
                      <span className="text-[9px] font-black uppercase tracking-wider text-[#a8a29e]/50">Switch Persona</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                      {personas.map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => {
                            setSelectedPersonaId(p._id);
                            setAgentDropdownOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold transition-all hover:bg-[#2a2723]/50 text-left"
                          style={{ color: (selectedPersonaId === p._id || (!selectedPersonaId && p.isDefault)) ? "#d4a373" : "#a8a29e" }}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-5 h-5 rounded-md bg-[#2a2723] text-[#d4a373] flex items-center justify-center text-[9px] uppercase font-bold shrink-0">
                              {p.name.substring(0, 2)}
                            </div>
                            <span className="truncate">{p.name}</span>
                          </div>
                          {p.isDefault && (
                            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded-sm bg-[#2a2723] text-[#a8a29e]/50 shrink-0">
                              Default
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Input field */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Ask ${activePersonaName}...`}
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-[#a8a29e]/40 text-[#f2efeb] px-3 py-2"
              autoFocus
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-8 h-8 rounded-full bg-[#d4a373] text-[#0f0e0c] flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-all shrink-0 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: bgSettings.secondaryText }}>Continue where you left off</span>
            </div>
            <div className="space-y-1">
              {recentSessions.map((session) => {
                const ws = workspaces?.find(w => w._id === session.workspaceId);
                return (
                  <button
                    key={session._id}
                    onClick={() => onSelectSession(session._id)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left group"
                    style={cardBgStyle}
                  >
                    <span className="text-sm truncate font-medium flex-1" style={{ color: bgSettings.primaryText }}>
                      {session.title || "Untitled"}
                    </span>
                    {ws && (
                      <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-16 shrink-0" style={{ color: bgSettings.secondaryText }}>
                        {ws.name}
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 shrink-0 transition-all" style={{ color: bgSettings.secondaryText }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pinned Sessions */}
        {pinnedSessions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Pin className="w-3 h-3" style={{ color: bgSettings.accentColor }} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: bgSettings.secondaryText }}>Your shortcuts</span>
            </div>
            <div className="space-y-1">
              {pinnedSessions.slice(0, 5).map((session) => {
                const ws = workspaces?.find(w => w._id === session.workspaceId);
                return (
                  <button
                    key={session._id}
                    onClick={() => onSelectSession(session._id)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left group"
                    style={cardBgStyle}
                  >
                    <Pin className="w-3 h-3 shrink-0" style={{ color: bgSettings.accentColor }} />
                    <span className="text-sm truncate font-medium flex-1" style={{ color: bgSettings.primaryText }}>
                      {session.title || "Untitled"}
                    </span>
                    {ws && (
                      <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-16 shrink-0" style={{ color: bgSettings.secondaryText }}>
                        {ws.name}
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 shrink-0 transition-all" style={{ color: bgSettings.secondaryText }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
      </div>

      {/* Mobile Top Navigation */}
      <div className="absolute top-6 left-6 z-30 flex items-center gap-2 lg:hidden">
        <button
          onClick={onShowHistory}
          className="w-9 h-9 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg"
          title="Menu"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Notifications & Planner */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
        <NotificationBell />
        {onShowTasks && (
          <button
            onClick={onShowTasks}
            className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg"
            title="Planner"
          >
            <ClipboardList className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
        )}
      </div>

      {/* Background Edit Button */}
      <button
        onClick={() => setShowBgEditor(true)}
        className="absolute bottom-6 right-6 z-30 w-9 h-9 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg"
        title="Edit background"
      >
        <Brush className="w-4 h-4" />
      </button>

      {/* Background Editor Sidebar */}
      <PageCustomizer
        isOpen={showBgEditor}
        onClose={() => setShowBgEditor(false)}
        settings={bgSettings}
        onUpdate={updateBgSettings}
        pageName="Dashboard"
      />
    </div>
  );
}
