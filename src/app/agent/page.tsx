"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { 
  ArrowLeft, 
  Trash2, 
  Plus, 
  Edit3, 
  X, 
  Sparkles, 
  Save,
  Bot,
  Check,
  ChevronDown
} from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function AgentPage() {
  const personas = useQuery(api.personas.list);
  const createPersona = useMutation(api.personas.create);
  const updatePersona = useMutation(api.personas.update);
  const removePersona = useMutation(api.personas.remove);

  useEffect(() => {
    document.documentElement.classList.add("allow-scroll");
    document.body.classList.add("allow-scroll");
    return () => {
      document.documentElement.classList.remove("allow-scroll");
      document.body.classList.remove("allow-scroll");
    };
  }, []);

  // Modal State Control
  const [activeModal, setActiveModal] = useState<"view" | "create" | "edit" | "delete" | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Doc<"agentPersonas"> | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenCreate = () => {
    setName("");
    setDescription("");
    setPrompt("");
    setError(null);
    setActiveModal("create");
  };

  const handleOpenView = (p: Doc<"agentPersonas">) => {
    setSelectedPersona(p);
    setActiveModal("view");
  };

  const handleOpenEdit = (p: Doc<"agentPersonas">) => {
    setSelectedPersona(p);
    setName(p.name);
    setDescription(p.description || "");
    setPrompt(p.prompt);
    setError(null);
    setActiveModal("edit");
  };

  const handleOpenDelete = (p: Doc<"agentPersonas">) => {
    setSelectedPersona(p);
    setActiveModal("delete");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const cleanPrompt = prompt.trim();

    if (cleanName.length < 2 || cleanName.length > 20) {
      setError("Persona name must be between 2 and 20 characters.");
      return;
    }
    if (cleanDescription.length < 2 || cleanDescription.length > 100) {
      setError("Description must be between 2 and 100 characters.");
      return;
    }
    if (cleanPrompt.length < 10 || cleanPrompt.length > 1000) {
      setError("System prompt must be between 10 and 1000 characters.");
      return;
    }

    setIsSaving(true);
    try {
      if (activeModal === "edit" && selectedPersona) {
        await updatePersona({ 
          id: selectedPersona._id, 
          name: cleanName, 
          prompt: cleanPrompt, 
          description: cleanDescription 
        });
      } else {
        await createPersona({ 
          name: cleanName, 
          prompt: cleanPrompt, 
          description: cleanDescription 
        });
      }
      setName("");
      setDescription("");
      setPrompt("");
      setSelectedPersona(null);
      setActiveModal(null);
    } catch (err: any) {
      setError(err?.message || "Failed to save persona.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPersona) return;
    setError(null);
    try {
      await removePersona({ id: selectedPersona._id });
      setSelectedPersona(null);
      setActiveModal(null);
    } catch (err: any) {
      setError(err?.message || "Failed to delete persona.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0e0c] text-[#f2efeb] p-4 sm:p-6 lg:p-12 relative overflow-x-hidden">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#d4a373]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#d4a373]/3 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-6xl mx-auto flex items-center gap-4 mb-10 relative z-10">
        <Link 
          href="/" 
          className="p-2.5 rounded-xl bg-[#1a1814] border border-[#2a2723] hover:border-[#d4a373]/30 hover:text-[#d4a373] text-[#a8a29e] transition-all flex items-center justify-center cursor-pointer shadow-xl"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#f2efeb]">Agent Personas</h1>
          <p className="text-xs text-[#a8a29e] mt-1">Configure custom agent profiles to mold your AI's persona, instructions, and behavior.</p>
        </div>
      </header>

      {/* Main Content: Gallery Grid */}
      <main className="max-w-6xl mx-auto relative z-10 pb-20">
        {personas === undefined ? (
          // Skeleton loader
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div className="h-[140px] rounded-2xl border border-dashed border-[#2a2723] bg-[#1a1814]/10 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[140px] rounded-2xl border border-[#2a2723] bg-[#1a1814]/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {/* Add Persona dashed card */}
            <button
              onClick={handleOpenCreate}
              className="p-6 min-h-[140px] rounded-2xl border border-dashed border-[#2a2723] hover:border-[#d4a373]/30 bg-transparent hover:bg-[#d4a373]/5 flex flex-col items-center justify-center gap-2.5 group transition-all cursor-pointer"
            >
              <Plus className="w-6 h-6 text-[#a8a29e] group-hover:text-[#d4a373] transition-colors" />
              <span className="text-xs font-bold text-[#a8a29e] group-hover:text-[#f2efeb] tracking-wider uppercase">Add Persona</span>
            </button>

            {/* Persona cards */}
            {personas.map((p) => (
              <div
                key={p._id}
                onClick={() => handleOpenView(p)}
                className="p-5 min-h-[140px] rounded-2xl border border-[#2a2723] hover:border-[#d4a373]/30 bg-[#1a1814]/40 hover:bg-[#1a1814]/60 transition-all duration-300 flex flex-col justify-between cursor-pointer group shadow-lg hover:shadow-[#d4a373]/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#2a2723] border border-[#2a2723]/80 text-[#d4a373] flex items-center justify-center text-sm font-black uppercase shrink-0 group-hover:scale-105 transition-transform">
                      {p.name.substring(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-[#f2efeb] truncate group-hover:text-[#d4a373] transition-colors">{p.name}</h3>
                      <p className="text-[11px] text-[#a8a29e] truncate mt-1 group-hover:text-[#f2efeb]/80 transition-colors">
                        {p.description || "Dialogue assistant profile."}
                      </p>
                      <span className="text-[9px] text-[#a8a29e]/50 font-medium tracking-wide mt-1.5 inline-block">
                        {p.isDefault ? "Default Core" : "Custom Profile"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#2a2723]/30 mt-3">
                  <span className="text-[8px] text-[#a8a29e]/40 font-mono">
                    {p.createdAt > 0 ? new Date(p.createdAt).toLocaleDateString() : "System Built-in"}
                  </span>
                  {p.isDefault ? (
                    <span className="text-[8px] text-[#d4a373] bg-[#d4a373]/10 border border-[#d4a373]/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Dialogue
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(p);
                        }}
                        className="p-1.5 rounded bg-[#2a2723]/80 hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all cursor-pointer"
                        title="Edit persona"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDelete(p);
                        }}
                        className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all cursor-pointer"
                        title="Delete persona"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {/* Detail Viewer Modal */}
        {activeModal === "view" && selectedPersona && (
          <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => { setActiveModal(null); setSelectedPersona(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-lg rounded-2xl bg-[#1a1814] border border-[#2a2723] p-6 shadow-2xl space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#2a2723]/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#2a2723] border border-[#2a2723]/80 text-[#d4a373] flex items-center justify-center text-sm font-black uppercase shrink-0">
                    {selectedPersona.name.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#f2efeb]">{selectedPersona.name}</h3>
                    <p className="text-xs text-[#d4a373] mt-0.5 font-medium italic">
                      {selectedPersona.description || "Dialogue assistant profile."}
                    </p>
                    <p className="text-[10px] text-[#a8a29e] mt-1">
                      {selectedPersona.isDefault ? "System Core Persona" : `Created ${new Date(selectedPersona.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setActiveModal(null); setSelectedPersona(null); }}
                  className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#d4a373]">System Instructions</span>
                <div className="p-4 rounded-xl bg-[#0f0e0c]/90 border border-[#2a2723]/70 text-xs text-[#a8a29e] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar font-mono">
                  {selectedPersona.prompt}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {!selectedPersona.isDefault && (
                  <>
                    <button
                      onClick={() => handleOpenDelete(selectedPersona)}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                    <button
                      onClick={() => handleOpenEdit(selectedPersona)}
                      className="px-4 py-2 bg-[#2a2723] hover:bg-[#3a3733] text-[#f2efeb] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setActiveModal(null); setSelectedPersona(null); }}
                  className="px-4 py-2 bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Create / Edit Form Modal */}
        {(activeModal === "create" || activeModal === "edit") && (
          <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => { setActiveModal(null); setSelectedPersona(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md rounded-2xl bg-[#1a1814] border border-[#2a2723] p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2a2723]/50">
                <h3 className="text-base font-bold text-[#f2efeb]">
                  {activeModal === "edit" ? "Edit Persona" : "Create Persona"}
                </h3>
                <button
                  onClick={() => { setActiveModal(null); setSelectedPersona(null); }}
                  className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSave} className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-[#a8a29e] uppercase tracking-wider font-bold">
                    <label htmlFor="modal-agent-name">Agent Name</label>
                    <span>{name.trim().length} / 20</span>
                  </div>
                  <input
                    id="modal-agent-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 20))}
                    placeholder="e.g. Coach, James, Mentor"
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                    disabled={isSaving}
                    required
                    autoComplete="off"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-[#a8a29e] uppercase tracking-wider font-bold">
                    <label htmlFor="modal-agent-description">Short Summary / Description</label>
                    <span>{description.trim().length} / 100</span>
                  </div>
                  <input
                    id="modal-agent-description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 100))}
                    placeholder="e.g. Focused on daily routine checks and habits planning"
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                    disabled={isSaving}
                    required
                    autoComplete="off"
                  />
                </div>

                {/* System Prompt */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-[#a8a29e] uppercase tracking-wider font-bold">
                    <label htmlFor="modal-agent-prompt">System Prompt</label>
                    <span>{prompt.trim().length} / 1000</span>
                  </div>
                  <textarea
                    id="modal-agent-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value.slice(0, 1000))}
                    placeholder="Define how this agent should behave. e.g. 'You speak in extremely short sentences. You are highly analytical and focus on offering data-driven insights...'"
                    className="w-full h-40 bg-[#0f0e0c] border border-[#2a2723] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb] resize-none font-mono"
                    disabled={isSaving}
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold leading-snug font-sans">
                    {error}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setActiveModal(null); setSelectedPersona(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-[#2a2723] hover:bg-[#3a3733] text-[#a8a29e] hover:text-[#f2efeb] text-xs font-bold transition-all cursor-pointer"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || name.trim().length < 2 || description.trim().length < 2 || prompt.trim().length < 10}
                    className="flex-1 py-2.5 rounded-xl bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] disabled:opacity-40 disabled:hover:bg-[#d4a373] text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-[#d4a373]/15"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? "Saving..." : activeModal === "edit" ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {activeModal === "delete" && selectedPersona && (
          <div className="fixed inset-0 z-210 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setActiveModal("view")}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm rounded-2xl bg-[#1a1814] border border-[#2a2723] p-6 shadow-2xl space-y-4 z-10"
            >
              <div className="text-center space-y-2">
                <h3 className="text-base font-bold text-[#f2efeb]">Delete Persona</h3>
                <p className="text-xs text-[#a8a29e] leading-relaxed">
                  Are you sure you want to delete <span className="text-[#d4a373] font-bold">"{selectedPersona.name}"</span>? This cannot be undone and will revert any associated workspaces to the default Dialogue persona.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setActiveModal("view")}
                  className="flex-1 py-2.5 rounded-xl bg-[#2a2723] hover:bg-[#3a3733] text-[#a8a29e] text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 text-xs font-bold transition-all cursor-pointer shadow-lg shadow-red-500/10"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f0e0c; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2723; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4a373; }
      `}</style>
    </div>
  );
}
