import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";
import { Bot, Sparkles, Plus, Pin, Calendar, CheckCircle2, ArrowRight, Brush, Menu, Grid2x2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { DashboardBgEditor, DashboardBgSettings } from "./DashboardEditor";

function hexToRgb(hex: string): string {
  const c = hex.replace("#", "");
  return `${parseInt(c.substring(0, 2), 16)}, ${parseInt(c.substring(2, 4), 16)}, ${parseInt(c.substring(4, 6), 16)}`;
}

interface DashboardProps {
  workspaces: Doc<"workspaces">[] | undefined;
  sessions: Doc<"chatSessions">[] | undefined;
  profile: { name?: string; bio?: string } | null | undefined;
  isLargeViewport: boolean;
  onNewChat: (workspaceId?: Id<"workspaces">) => void;
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
  const updateProfile = useMutation(api.ai.updateProfile);

  const storedBg = ((profile as any)?.preferences?.dashboardBg || {}) as Partial<DashboardBgSettings>;
  const bgSettings: DashboardBgSettings = {
    opacity: 30,
    blur: 0,
    grain: 0,
    vfxEnabled: true,
    vfxColor: "#d4a373",
    cardBg: "#1a1814",
    cardOpacity: 100,
    cardBlur: 0,
    cardBorder: "#2a2723",
    primaryText: "#f2efeb",
    secondaryText: "#a8a29e",
    accentColor: "#d4a373",
    cardStyle: "glass",
    ...storedBg,
  };

  const resolvedBgUrl = useQuery(
    api.messages.getStorageUrl,
    bgSettings.storageId ? { storageId: bgSettings.storageId as Id<"_storage"> } : "skip"
  );
  const bgUrl = resolvedBgUrl ?? bgSettings.url;

  const cardBgStyle = bgSettings.cardStyle === "solid"
    ? {
        backgroundColor: bgSettings.cardBg,
        borderColor: bgSettings.cardBorder,
        backdropFilter: "none" as const,
      }
    : {
        backgroundColor: `rgba(${hexToRgb(bgSettings.cardBg)}, ${
          bgSettings.cardBlur > 0
            ? Math.min(bgSettings.cardOpacity / 100, 0.7)
            : bgSettings.cardOpacity / 100
        })`,
        borderColor: bgSettings.cardBorder,
        backdropFilter: bgSettings.cardBlur > 0 ? `blur(${bgSettings.cardBlur / 5}px)` : "none",
      };

  const handleSaveBg = (settings: DashboardBgSettings) => {
    updateProfile({ preferences: { dashboardBg: settings } });
  };

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
    .slice(0, 4) || [];

  const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening";
  const userName = profile?.name || "there";

  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex-1 flex flex-col items-center min-h-0 overflow-y-auto relative">
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
      <div className="relative z-10 flex flex-col items-center w-full min-h-0 flex-1">
        {/* Push greeting to vertical center */}
        <div className="hidden lg:flex lg:flex-1 lg:min-h-12" />

        {/* Hero Greeting — centered x and y */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center space-y-1.5 lg:space-y-3 relative px-4 pt-8 lg:pt-0 mb-6 lg:mb-0"
        >
          {bgSettings.vfxEnabled && (
            <div
              className="absolute -top-60 left-1/2 w-[800px] h-[600px] rounded-full pointer-events-none"
              style={{
                marginLeft: "-400px",
                background: `radial-gradient(ellipse at center, ${bgSettings.vfxColor}26 0%, transparent 70%)`,
                animation: "pulse-glow 4s ease-in-out infinite",
              }}
            />
          )}
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight relative"
              style={{ color: bgSettings.primaryText }}>
            Good {timeOfDay}, {userName}.
          </h1>
          <p className="text-sm lg:text-base font-medium relative"
             style={{ color: bgSettings.secondaryText }}>{dayName}, {dateStr}</p>
        </motion.div>

        {/* Push content below */}
        <div className="hidden lg:flex lg:flex-1 lg:min-h-8" />

        {/* Content sections */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="max-w-lg w-full space-y-4 lg:space-y-8 pb-6 lg:pb-16 px-4"
        >

        {/* Today's Snapshot */}
        <div
          className="rounded-xl border p-3 lg:p-5 space-y-2.5 lg:space-y-3"
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

        {/* Quick Actions */}
        <div className="flex justify-center">
          <div className="relative flex items-center">
            <button
              onClick={() => onNewChat(selectedWsId)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-l-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]"
              style={{
                ...cardBgStyle,
                color: bgSettings.accentColor,
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
            <button
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-r-xl text-[10px] font-bold uppercase tracking-widest transition-all border-l border-[#2a2723]/50"
              style={{
                ...cardBgStyle,
                color: bgSettings.accentColor,
              }}
            >
              {workspaces?.find(w => w._id === selectedWsId)?.name
                ? workspaces.find(w => w._id === selectedWsId)!.name.substring(0, 2).toUpperCase()
                : "A"}
              <ChevronDown className="w-3 h-3" />
            </button>

            {wsDropdownOpen && workspaces && workspaces.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setWsDropdownOpen(false)} />
                <div
                  className="absolute right-0 bottom-full mb-2 w-full rounded-xl border shadow-2xl z-50 overflow-hidden"
                  style={{
                    ...cardBgStyle,
                  }}
                >
                  {workspaces.map((ws) => (
                    <button
                      key={ws._id}
                      onClick={() => {
                        setSelectedWsId(ws._id);
                        setWsDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-bold transition-all hover:bg-[#2a2723]/50 text-left"
                      style={{
                        color: selectedWsId === ws._id ? bgSettings.accentColor : bgSettings.secondaryText,
                      }}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                      {ws.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
      <div className="fixed top-6 left-6 z-50 flex items-center gap-2 lg:hidden">
        <button
          onClick={onShowHistory}
          className="w-9 h-9 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg"
          title="Menu"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {onShowTasks && (
        <button
          onClick={onShowTasks}
          className="fixed top-6 right-6 z-50 w-9 h-9 lg:w-11 lg:h-11 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg"
          title="Planner"
        >
          <Grid2x2 className="w-4 h-4 lg:w-5 lg:h-5" />
        </button>
      )}

      {/* Background Edit Button */}
      <button
        onClick={() => setShowBgEditor(true)}
        className="fixed bottom-6 right-6 z-50 w-9 h-9 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg"
        title="Edit background"
      >
        <Brush className="w-4 h-4" />
      </button>

      {/* Background Editor Sidebar */}
      <DashboardBgEditor
        isOpen={showBgEditor}
        onClose={() => setShowBgEditor(false)}
        settings={bgSettings}
        onSave={handleSaveBg}
      />
    </div>
  );
}
