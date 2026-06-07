"use client";

import { useQuery as useConvexQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { isPbBackend, usePbWorkspace, usePbPersonasList, usePbWorkspaceUpdate } from "@/pb-compat";
import { Id } from "../../../../convex/_generated/dataModel";
import { ArrowLeft, Save, Bot, Palette, Sparkles, ChevronDown, Check } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "@/components/auth/SignInForm";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const pbWorkspace = usePbWorkspace(workspaceId);
  const convexWorkspace = useConvexQuery(api.workspaces.get, { id: workspaceId });
  const workspace = isPbBackend() ? pbWorkspace : convexWorkspace;

  const pbPersonas = usePbPersonasList();
  const convexPersonas = useConvexQuery(api.personas.list);
  const personas = isPbBackend() ? pbPersonas : convexPersonas;
  const convexUpdateSettings = useMutation(api.workspaces.updateSettings);
  const pbUpdateSettings = usePbWorkspaceUpdate();
  const updateSettings = isPbBackend() ? pbUpdateSettings : (args: any) => convexUpdateSettings(args);

  const [defaultAgentPersonaId, setDefaultAgentPersonaId] = useState<Id<"agentPersonas"> | "default_dialogue">("default_dialogue");
  const [workspaceColor, setWorkspaceColor] = useState("#d4a373");
  const [isSaving, setIsSaving] = useState(false);
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

  if (workspace && workspace._id !== prevId) {
    setPrevId(workspace._id);
    setDefaultAgentPersonaId(workspace.defaultAgentPersonaId || "default_dialogue");
    setWorkspaceColor(workspace.color || "#d4a373");
  }

  const isSpecialView = typeof workspaceId === "string" && ["calendar", "tasks", "events", "habits"].includes(workspaceId);

  if (isSpecialView || workspace === null) {
    return null;
  }

  const currentPersona = personas?.find(p => p._id === defaultAgentPersonaId) || personas?.find(p => p.isDefault);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        id: workspaceId as Id<"workspaces">,
        color: workspaceColor,
        defaultAgentPersonaId: defaultAgentPersonaId === "default_dialogue" ? null : defaultAgentPersonaId,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
      <Authenticated>
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
                            key={p._id}
                            type="button"
                            onClick={() => {
                              setDefaultAgentPersonaId(p._id);
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
                            {defaultAgentPersonaId === p._id && (
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
      </Authenticated>
    </>
  );
}
