"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { ArrowLeft, Save, Bot, BookOpen, Palette, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "@/components/auth/SignInForm";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId = params.id as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { id: workspaceId });
  const updateSettings = useMutation(api.workspaces.updateSettings);

  const [behaviorGuide, setBehaviorGuide] = useState("");
  const [agentName, setAgentName] = useState("");
  const [workspaceColor, setWorkspaceColor] = useState("#d4a373");
  const [isSaving, setIsSaving] = useState(false);
  const [prevId, setPrevId] = useState<Id<"workspaces"> | null>(null);

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
    setBehaviorGuide(workspace.context || "");
    setAgentName(workspace.agentName || "");
    setWorkspaceColor(workspace.color || "#d4a373");
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        id: workspaceId,
        context: behaviorGuide,
        agentName: agentName || undefined,
        color: workspaceColor,
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
              {/* AI Partner Name */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg"
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#d4a373]" />
                    <h2 className="text-base font-bold text-[#f2efeb]">AI Partner Name</h2>
                  </div>
                  <p className="text-[#a8a29e] text-[10px] mt-1">
                    Give your AI partner a name for this workspace. It will appear on message bubbles.
                  </p>
                </div>
                <input
                  name="ws-agent-name"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Dialogue, Athena, Aria..."
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-[#d4a373]/40 transition-all"
                />
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

              {/* Behavior Guide */}
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg"
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#d4a373]" />
                    <h2 className="text-base font-bold text-[#f2efeb]">Behavior Guide</h2>
                  </div>
                  <p className="text-[#a8a29e] text-[10px] mt-1">
                    Define how your AI partner should behave, respond, and prioritize in this workspace.
                    This takes precedence over the default persona.
                  </p>
                </div>
                <textarea
                  name="ws-behavior-guide"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={behaviorGuide}
                  onChange={(e) => setBehaviorGuide(e.target.value)}
                  placeholder="e.g. Keep responses short and direct. Prioritize deep work blocks. Avoid casual chatter."
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-xl p-4 text-xs text-[#f2efeb] placeholder:text-[#a8a29e]/20 min-h-40 resize-none outline-none focus:border-[#d4a373]/40 transition-all scrollbar-hide"
                />
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
