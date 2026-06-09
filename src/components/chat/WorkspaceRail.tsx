import Link from "next/link";
import { LayoutDashboard, Plus, Settings, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PbWorkspaces } from "@/pb-compat";

interface WorkspaceRailProps {
  workspaces: PbWorkspaces[] | undefined;
  activeWorkspaceId: string | undefined;
  showHistory: boolean;
  onSelectWorkspace: (id: string | undefined) => void;
  onOpenCreateModal: () => void;
  onShowHistory: () => void;
}

export function WorkspaceRail({ 
  workspaces, 
  activeWorkspaceId, 
  showHistory, 
  onSelectWorkspace, 
  onOpenCreateModal,
  onShowHistory
}: WorkspaceRailProps) {
  return (
    <nav className="hidden lg:flex w-21 h-full shrink-0 border-r border-[#2a2723] bg-linear-to-b from-[#141210] to-[#0f0e0c] flex-col items-center pb-8 z-50 relative">
      {/* Floating Toggle for History (when collapsed) - Anchored to Rail */}
      <AnimatePresence>
        {!showHistory && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="hidden lg:block absolute left-full top-1/2 -translate-y-1/2 z-50 h-fit w-fit"
          >
            <button
              onClick={onShowHistory}
              className="p-2 rounded-r-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all shadow-black/50 shadow-lg group flex items-center justify-center border-l-0"
              title="Show History"
            >
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Dashboard - replaces the old Dialogue branding icon */}
      <div className="w-full h-24 flex items-center justify-center shrink-0">
        <button
          onClick={() => onSelectWorkspace(undefined)}
          className={`w-12 h-12 rounded-[20px] flex items-center justify-center transition-all duration-300 border shrink-0 group relative ${
            !activeWorkspaceId 
              ? "bg-[#d4a373] border-[#d4a373] shadow-[0_0_20px_rgba(212,163,115,0.3)] scale-110" 
              : "bg-[#1a1814] border-[#2a2723] text-[#a8a29e] hover:border-[#d4a373]/30 hover:text-[#f2efeb] hover:scale-110 active:scale-95"
          }`}
        >
          <LayoutDashboard className={`w-6 h-6 transition-transform duration-300 ${!activeWorkspaceId ? "text-[#0f0e0c] scale-110" : "group-hover:rotate-12"}`} />
          {!activeWorkspaceId && (
            <motion.div 
              layoutId="active-ws"
              className="absolute -left-3 w-1.5 h-8 bg-[#d4a373] rounded-r-full shadow-[2px_0_10px_rgba(212,163,115,0.5)] z-20"
            />
          )}
          <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none transition-all -translate-x-2.5 group-hover:translate-x-0 z-100 whitespace-nowrap shadow-2xl">
            Dashboard
          </div>
        </button>
      </div>
      
      <div className="w-10 h-px bg-[#2a2723]/50 shrink-0" />
      
      <div className="flex-1 w-full flex flex-col items-center gap-5 overflow-y-auto overflow-x-hidden custom-scrollbar py-6">
        {workspaces?.map((ws) => (
          <div key={ws._id} className="w-full relative group flex items-center justify-center">
            <button
              onClick={() => onSelectWorkspace(ws._id)}
              className={`w-12 h-12 rounded-[20px] flex items-center justify-center transition-all duration-300 border text-xs font-bold uppercase relative group/btn ${
                activeWorkspaceId === ws._id 
                  ? "bg-[#d4a373]/10 border-[#d4a373] text-[#d4a373] shadow-[0_0_15px_rgba(212,163,115,0.15)] scale-110" 
                  : "bg-[#1a1814] border-[#2a2723] text-[#a8a29e] hover:border-[#d4a373]/30 hover:text-[#f2efeb] hover:scale-105"
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <span className={`transition-all duration-300 ${activeWorkspaceId === ws._id ? "text-[#f2efeb] scale-110" : "text-[#a8a29e]"}`}>
                  {ws.name.substring(0, 2)}
                </span>
                <div 
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${activeWorkspaceId === ws._id ? "scale-125 shadow-[0_0_8px_rgba(0,0,0,0.5)]" : "opacity-40"}`} 
                  style={{ backgroundColor: ws.color }} 
                />
              </div>
            </button>
            {activeWorkspaceId === ws._id && (
              <motion.div 
                layoutId="active-ws"
                className="absolute left-0 w-1.5 h-8 bg-[#d4a373] rounded-r-full shadow-[2px_0_10px_rgba(212,163,115,0.4)] z-20"
              />
            )}
            <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none transition-all -translate-x-2.5 group-hover:translate-x-0 z-100 whitespace-nowrap shadow-2xl">
              {ws.name}
            </div>
          </div>
        ))}

        <div className="relative group mt-2">
          <button
            onClick={onOpenCreateModal}
            className="w-12 h-12 rounded-[20px] bg-[#1a1814]/40 border border-dashed border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:border-[#d4a373]/40 hover:text-[#d4a373] hover:bg-[#d4a373]/5 transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none transition-all -translate-x-2.5 group-hover:translate-x-0 z-100 whitespace-nowrap shadow-2xl">
            New Workspace
          </div>
        </div>
      </div>


      <div className="shrink-0 pb-8 flex flex-col gap-4">
        <Link 
          href="/settings"
          className="w-12 h-12 rounded-[20px] bg-[#1a1814] border border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all shadow-lg group relative"
        >
          <Settings className="w-5 h-5" />
          <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 invisible group-hover:opacity-100 group-hover:visible pointer-events-none transition-all -translate-x-2.5 group-hover:translate-x-0 z-100 whitespace-nowrap shadow-2xl">
            Settings
          </div>
        </Link>
      </div>
    </nav>
  );
}
