import { Menu, ClipboardList, GitBranch } from "lucide-react";
import { PbWorkspaces } from "@/pb-compat";
import { NotificationBell } from "../notifications-bell";

interface ChatHeaderProps {
  activeSessionTitle: string | undefined;
  currentWorkspace: PbWorkspaces | undefined;
  activeWorkspaceId: string | undefined;
  workspaces: PbWorkspaces[] | undefined;
  messageCount: number;
  provider: string;
  activeModelName: string;
  isLargeViewport?: boolean;
  onProviderChange: (p: string) => void;
  onSignOut: () => void;
  onShowHistory: () => void;
  onShowTasks?: () => void;
  isBranch?: boolean;
  isArchived?: boolean;
  onMerge?: () => void;
  isMerging?: boolean;
}

export function ChatHeader(props: ChatHeaderProps) {
  const {
    activeSessionTitle,
    activeWorkspaceId,
    workspaces,
    onShowHistory,
    onShowTasks,
    isBranch,
    isArchived,
    onMerge,
    isMerging,
  } = props;

  return (
    <>
      <header className="absolute top-0 left-0 right-0 px-4 lg:px-8 py-3 lg:py-0 lg:h-24 flex flex-col justify-center bg-[#0f0e0c]/80 backdrop-blur-xl z-30 border-b border-[#2a2723]/50">
        <div className="grid grid-cols-3 items-center w-full">
          {/* Column 1: Left (Mobile Toggles / Desktop Spacer) */}
          <div className="flex items-center justify-start">
            {/* Mobile Navigation Toggles */}
            <div className="lg:hidden flex items-center gap-1.5">
              <button
                onClick={onShowHistory}
                className="p-2 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] active:scale-90 transition-all"
                title="Menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Mobile Active Workspace Indicator */}
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
          </div>

          {/* Column 2: Center (Session Title) */}
          <div className="flex justify-center text-center items-center gap-1.5">
            {isBranch && <GitBranch className="w-4.5 h-4.5 text-[#d4a373] shrink-0" />}
            <h1 className="hidden lg:block text-xl font-bold text-[#f2efeb] tracking-tight truncate max-w-50 lg:max-w-md">
              {activeSessionTitle || "New Session"}
            </h1>
          </div>

          {/* Column 3: Right (Planner Action Toggle, Merge Branch, & Notification Bell) */}
          <div className="flex items-center justify-end gap-2">
            {isBranch && !isArchived && onMerge && (
              <button
                onClick={onMerge}
                disabled={isMerging}
                className="py-1.5 px-3 rounded-lg bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] disabled:opacity-50 text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center shadow-md shrink-0"
                title="Summarize & Close Discussion"
              >
                {isMerging ? "Merging..." : "Close & Summarize"}
              </button>
            )}
            {isBranch && isArchived && (
              <span className="py-1.5 px-2.5 rounded-lg bg-[#2a2723] text-[#a8a29e] text-[9px] font-bold tracking-wider uppercase border border-[#2a2723]/80 select-none">
                Past
              </span>
            )}
            <NotificationBell />
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
        </div>
      </header>

      {/* Mobile Session Title */}
      <div className="lg:hidden px-6 py-1.5 border-b border-[#2a2723]/30 bg-[#12110e] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate">
          {isBranch && <GitBranch className="w-3.5 h-3.5 text-[#d4a373] shrink-0" />}
          <h1 className="text-xs font-bold text-[#a8a29e] uppercase tracking-[0.2em] truncate">
            {activeSessionTitle || "New Session"}
          </h1>
        </div>
        {isBranch && !isArchived && onMerge && (
          <button
            onClick={onMerge}
            disabled={isMerging}
            className="py-1 px-2.5 rounded-md bg-[#d4a373] text-[#0f0e0c] text-[9px] font-bold uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95 shrink-0"
          >
            {isMerging ? "Merging..." : "Close"}
          </button>
        )}
        {isBranch && isArchived && (
          <span className="py-0.5 px-2 rounded-md bg-[#2a2723] text-[#a8a29e] text-[9px] font-bold uppercase tracking-wider border border-[#2a2723]/80 select-none shrink-0">
            Past
          </span>
        )}
      </div>
    </>
  );
}

