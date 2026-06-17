"use client";

import { usePbWorkspace, usePbPersonasList, usePbWorkspaceUpdate, usePbWorkspaceDelete } from "@/pb-compat";
import type { PbId } from "@/pb-compat/_generated/dataModel";
import { ArrowLeft, Save, Bot, Palette, Sparkles, ChevronDown, Check, Archive, ArchiveRestore, Trash2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const workspace = usePbWorkspace(workspaceId);
  const personas = usePbPersonasList();
  const updateSettings = usePbWorkspaceUpdate();
  const deleteWorkspace = usePbWorkspaceDelete();

  const [defaultAgentPersonaId, setDefaultAgentPersonaId] = useState<string | "default_dialogue">("default_dialogue");
  const [workspaceColor, setWorkspaceColor] = useState("#d4a373");
  const [isArchived, setIsArchived] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const views = ["calendar", "tasks", "events", "habits"];
    if (views.includes(workspaceId)) {
      router.replace(`/?view=${workspaceId}`);
      return;
    }

    if (workspace === null) {
      router.replace("/");
    }
  }, [workspaceId, workspace, router]);

  useEffect(() => {
    document.documentElement.classList.add("allow-scroll");
    document.body.classList.add("allow-scroll");
    return () => {
      document.documentElement.classList.remove("allow-scroll");
      document.body.classList.remove("allow-scroll");
    };
  }, []);

  if (workspace && workspace.id !== prevId) {
    setPrevId(workspace.id);
    setDefaultAgentPersonaId(workspace.defaultAgentPersona || "default_dialogue");
    setWorkspaceColor(workspace.color || "#d4a373");
    setIsArchived(!!workspace.archived);
  }

  const isSpecialView = typeof workspaceId === "string" && ["calendar", "tasks", "events", "habits"].includes(workspaceId);

  if (isSpecialView || workspace === null) {
    return null;
  }

  const currentPersona = personas?.find(p => p.id === defaultAgentPersonaId) || personas?.find(p => p.isDefault);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        id: workspaceId,
        color: workspaceColor,
        defaultAgentPersonaId: defaultAgentPersonaId === "default_dialogue" ? null : defaultAgentPersonaId,
        archived: isArchived,
      });
      if (isArchived) {
        router.push("/");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteWorkspace(workspaceId);
      router.push("/");
    } catch (err) {
      console.error(err);
      alert("Failed to delete workspace: " + (err as Error).message);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="bg-[#0f0e0c] text-[#f2efeb] selection:bg-[#d4a373]/30 custom-scrollbar min-h-screen">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-32 md:pb-12">
            {/* Header */}
            <div className="flex flex-col items-start gap-1 mb-8">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="p-2 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all shadow-xl"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Link>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {workspace?.name || "Workspace"}
                  </h1>
                  {workspace && (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: workspace.color }}
                    />
                  )}
                </div>
              </div>
              <p className="text-[#a8a29e] text-[10px] ml-12">
                Configure your AI partner for this workspace.
              </p>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Default Agent Persona */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg relative"
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#d4a373]" />
                    <h2 className="text-base font-bold text-[#f2efeb]">Default Agent Persona</h2>
                  </div>
                  <p className="text-[#a8a29e] text-[10px] mt-1">
                    Select the default agent persona to automatically load when creating a new session in this workspace.
                  </p>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-[#d4a373]/40 transition-all text-left"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-5 h-5 rounded bg-[#2a2723] text-[#d4a373] flex items-center justify-center text-[10px] font-black uppercase shrink-0">
                        {currentPersona ? currentPersona.name.substring(0, 2) : "DI"}
                      </div>
                      <span className="text-[#f2efeb] font-medium text-xs">
                        {currentPersona ? currentPersona.name : "Dialogue"}
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-[#a8a29e]" />
                  </button>

                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                      <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-[#2a2723] bg-[#1a1814] shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                        {personas === undefined ? (
                          <div className="p-4 text-center text-xs text-[#a8a29e]">Loading personas...</div>
                        ) : personas.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setDefaultAgentPersonaId(p.id);
                              setDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold transition-all hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] text-left border-b border-[#2a2723]/30 last:border-none"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <div className="w-5 h-5 rounded bg-[#2a2723] text-[#d4a373] flex items-center justify-center text-[9px] uppercase font-bold shrink-0">
                                {p.name.substring(0, 2)}
                              </div>
                              <span className="truncate">{p.name}</span>
                            </div>
                            {defaultAgentPersonaId === p.id && (
                              <Check className="w-3.5 h-3.5 text-[#d4a373]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </motion.section>

              {/* Workspace Color */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.025 }}
                className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg"
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#d4a373]" />
                    <h2 className="text-base font-bold text-[#f2efeb]">Workspace Color</h2>
                  </div>
                  <p className="text-[#a8a29e] text-[10px] mt-1">
                    Pick a color to identify this workspace across the UI.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={workspaceColor}
                  onChange={(e) => setWorkspaceColor(e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                />
                </div>
              </motion.section>

              {/* Archive Workspace */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-[#d4a373]" />
                      <h2 className="text-base font-bold text-[#f2efeb]">Archive Workspace</h2>
                    </div>
                    <p className="text-[#a8a29e] text-[10px] mt-1 pr-6">
                      Archiving hides the workspace from the sidebar list but keeps all tasks, events, and notes intact.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsArchived(!isArchived)}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                      isArchived
                        ? "bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262]"
                        : "bg-[#2a2723] text-[#a8a29e] hover:bg-[#322f2b] hover:text-[#f2efeb]"
                    }`}
                  >
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Archived
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </>
                    )}
                  </button>
                </div>
              </motion.section>

              {/* Danger Zone (Workspace Deletion) */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.075 }}
                className="bg-[#140b08]/80 p-5 rounded-xl border border-red-500/20 shadow-lg"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <h2 className="text-base font-bold text-red-400">Danger Zone</h2>
                    </div>
                    <p className="text-[#a8a29e] text-[10px] mt-1 pr-6">
                      Deleting this workspace is a permanent action. Its directory on disk will be moved to the trash folder, and all related tasks, events, habits, and chat sessions in PocketBase will be deleted.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-red-500/20 hover:border-transparent active:scale-[0.98]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Workspace
                  </button>
                </div>
              </motion.section>

              {/* Save Button / Actions */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <Link
                  href="/"
                  className="px-5 py-2.5 text-[10px] font-bold text-[#a8a29e] hover:text-[#f2efeb] uppercase tracking-widest transition-all"
                >
                  Cancel
                </Link>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/10 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isSaving ? (
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f0e0c]/85 backdrop-blur-xs p-6"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] bg-[#1a1814] border border-red-500/20 rounded-2xl p-6 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-[#f2efeb] mb-2 leading-tight">
                Delete Workspace?
              </h3>
              <p className="text-xs text-[#a8a29e] mb-6 leading-relaxed">
                Are you sure you want to delete <span className="text-[#f2efeb] font-semibold italic">&quot;{workspace?.name}&quot;</span>? This will move its files on disk to the trash folder and permanently delete all associated tasks, events, habits, and chat sessions. This action cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full py-3 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete Workspace
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-3 bg-transparent text-[#a8a29e] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
