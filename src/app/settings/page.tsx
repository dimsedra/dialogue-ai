"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { 
  ArrowLeft, 
  User, 
  Brain, 
  Cpu, 
  Save, 
  Trash2, 
  Plus, 
  Sparkles, 
  Zap,
  Bot,
  Search,
  Globe,
  LogOut,
  Edit3,
  X
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthActions } from "@convex-dev/auth/react";

export default function SettingsPage() {
  const profile = useQuery(api.ai.getProfile, {});
  const memories = useQuery(api.ai.getAllMemories, {});
  const updateProfile = useMutation(api.ai.updateProfile);
  const updateMemory = useMutation(api.ai.updateMemoryText);
  const deleteMemory = useMutation(api.ai.deleteMemory);
  const addMemory = useMutation(api.ai.saveMemory);
  const updatePreferences = useMutation(api.ai.updatePreferences);
  const { signOut } = useAuthActions();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [provider, setProvider] = useState<"gemini" | "lmstudio">("gemini");
  const [searchProvider, setSearchProvider] = useState<"tavily" | "serper">("tavily");
  const [prevProfileId, setPrevProfileId] = useState<Id<"userProfile"> | null>(null);

  const [activeTab, setActiveTab] = useState<"profile" | "ai" | "memory">("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<Id<"memories"> | null>(null);
  const [editMemoryText, setEditMemoryText] = useState("");
  const [newMemoryText, setNewMemoryText] = useState("");

  // Sync state during render when profile loads/changes
  if (profile && profile._id !== prevProfileId) {
    setPrevProfileId(profile._id);
    setName(profile.name || "");
    setBio(profile.bio || "");
    if (profile.preferences?.provider) {
      setProvider(profile.preferences.provider as "gemini" | "lmstudio");
    }
    if (profile.preferences?.searchProvider) {
      setSearchProvider(profile.preferences.searchProvider as "tavily" | "serper");
    }
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateProfile({ name, bio });
      await updatePreferences({ provider, searchProvider });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMemory = async (id: Id<"memories">) => {
    await updateMemory({ id, text: editMemoryText });
    setEditingMemoryId(null);
  };

  const handleAddMemory = async () => {
    if (!newMemoryText.trim()) return;
    const dummyEmbedding = Array(768).fill(0).map(() => Math.random());
    await addMemory({ text: newMemoryText, embedding: dummyEmbedding });
    setNewMemoryText("");
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-[#0f0e0c] text-[#f2efeb] selection:bg-[#d4a373]/30 custom-scrollbar">
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
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          </div>
          <p className="text-[#a8a29e] text-[10px] ml-12">Personalize your Dialogue experience.</p>
        </div>

        {/* Layout */}
        <div className="flex flex-col md:grid md:grid-cols-[220px_1fr] gap-6 sm:gap-12 items-start">
          {/* Navigation Sidebar (Sticky) */}
          <nav className="flex flex-col w-full md:sticky md:top-6 space-y-2">
            <div className="flex flex-row md:flex-col gap-1.5 overflow-x-auto pb-4 md:pb-0 mb-4 md:mb-6 scrollbar-hide">
              {( [
                { id: "profile", label: "Profile", icon: User },
                { id: "ai", label: "AI Provider", icon: Cpu },
                { id: "memory", label: "Intelligence", icon: Brain },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-2.5 px-4 py-2.5 rounded-xl transition-all text-[11px] font-bold whitespace-nowrap border-2 ${
                    activeTab === tab.id 
                      ? "bg-[#d4a373] text-[#0f0e0c] border-[#d4a373] shadow-[0_5px_15px_rgba(212,163,115,0.15)]" 
                      : "bg-[#1a1814] text-[#a8a29e] border-[#2a2723] hover:border-[#3a3733] hover:text-[#f2efeb]"
                  }`}
                >
                  <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? "text-[#0f0e0c]" : "text-[#a8a29e]"}`} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Actions Section (Sticky Bottom of Sidebar) */}
            <div className="hidden md:flex flex-col gap-2 pt-4 border-t border-[#2a2723]">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#d4a373] hover:bg-[#c39262] text-[#0f0e0c] font-black uppercase tracking-widest text-[9px] transition-all shadow-xl shadow-[#d4a373]/10 disabled:opacity-50 active:scale-[0.98]"
              >
                {isSaving ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Apply Settings
              </button>
              
              <button
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#f87171] hover:bg-red-500/10 hover:border-red-500/20 transition-all font-black uppercase tracking-widest text-[9px] group"
              >
                <LogOut className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                Sign Out
              </button>
            </div>
          </nav>

          {/* Content Area */}
          <div className="w-full min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeTab === "profile" && (
                <motion.div 
                  key="profile"
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  className="space-y-4"
                >
                  <section className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-[#f2efeb]">Identity Profile</h2>
                      <p className="text-[#a8a29e] text-[10px]">Personalize how your AI companions interact with you.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-[#d4a373]">Preferred Name</label>
                        <input 
                          name="settings-pref-name"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Alex"
                          className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-[#d4a373]/40 transition-all"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-[#d4a373]">Persona & Instructions</label>
                        <textarea 
                          name="settings-persona-bio"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={4}
                          placeholder="Tell Dialogue about your role, goals, and communication style..."
                          className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#d4a373]/40 transition-all resize-none"
                        />
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === "ai" && (
                <motion.div 
                  key="ai"
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  className="space-y-4"
                >
                  <section className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Cpu className="w-4 h-4 text-[#d4a373]" />
                      <h2 className="text-base font-bold text-[#f2efeb]">Inference Engine</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {( [
                        { id: "gemini", name: "Google Gemini", desc: "Cloud-based reasoning and large context.", icon: Zap },
                        { id: "lmstudio", name: "LM Studio", desc: "Local execution for maximum privacy.", icon: Bot }
                      ] as const).map((p) => (
                        <button 
                          key={p.id}
                          onClick={() => setProvider(p.id)}
                          className={`p-3 rounded-lg border transition-all text-left flex items-center justify-between group ${
                            provider === p.id 
                              ? "bg-[#0f0e0c] border-[#d4a373]/40" 
                              : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#3a3733]"
                          }`}
                        >
                          <div className="flex items-center gap-3.5">
                            <p.icon className={`w-4 h-4 ${provider === p.id ? "text-[#d4a373]" : "text-[#a8a29e]"}`} />
                            <div>
                              <h3 className={`text-[13px] font-bold ${provider === p.id ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}>{p.name}</h3>
                              <p className="text-[10px] text-[#a8a29e] leading-tight">{p.desc}</p>
                            </div>
                          </div>
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                            provider === p.id ? "border-[#d4a373]" : "border-[#2a2723]"
                          }`}>
                            {provider === p.id && <div className="h-2 w-2 rounded-full bg-[#d4a373]" />}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="mt-6 pt-5 border-t border-[#2a2723]">
                      <div className="flex items-center gap-2.5 mb-4">
                        <Search className="w-4 h-4 text-[#d4a373]" />
                        <h2 className="text-base font-bold text-[#f2efeb]">Search Intelligence</h2>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {( [
                          { id: "tavily", name: "Tavily AI", desc: "Optimized for LLM research.", icon: Zap },
                          { id: "serper", name: "Serper.dev", desc: "Google Search API power.", icon: Globe }
                        ] as const).map((s) => (
                          <button 
                            key={s.id}
                            onClick={() => setSearchProvider(s.id)}
                            className={`p-3 rounded-lg border transition-all text-left group ${
                              searchProvider === s.id 
                                ? "bg-[#0f0e0c] border-[#d4a373]/40" 
                                : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#3a3733]"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <s.icon className={`w-3.5 h-3.5 ${searchProvider === s.id ? "text-[#d4a373]" : "text-[#a8a29e]"}`} />
                              <div className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${
                                searchProvider === s.id ? "border-[#d4a373]" : "border-[#2a2723]"
                              }`}>
                                {searchProvider === s.id && <div className="h-1.5 w-1.5 rounded-full bg-[#d4a373]" />}
                              </div>
                            </div>
                            <h3 className={`text-[12px] font-bold ${searchProvider === s.id ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}>{s.name}</h3>
                            <p className="text-[10px] text-[#a8a29e] leading-tight">{s.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === "memory" && (
                <motion.div 
                  key="memory"
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  className="space-y-4"
                >
                  <section className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Brain className="w-4 h-4 text-[#d4a373]" />
                      <h2 className="text-base font-bold text-[#f2efeb]">Semantic Memory</h2>
                    </div>

                    <div className="mb-4 flex gap-2">
                      <input 
                        name="settings-new-memory"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={newMemoryText}
                        onChange={(e) => setNewMemoryText(e.target.value)}
                        placeholder="Add insight..."
                        className="flex-1 bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#d4a373]/40 transition-all"
                        onKeyDown={(e) => e.key === "Enter" && handleAddMemory()}
                      />
                      <button 
                        onClick={handleAddMemory}
                        className="px-3 rounded-lg bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                      {memories?.length === 0 && (
                        <div className="text-center py-8 border border-dashed border-[#2a2723] rounded-lg">
                          <p className="text-[#a8a29e] text-[10px] italic">No memories stored.</p>
                        </div>
                      )}
                      {memories?.map((memory) => (
                        <div 
                          key={memory._id}
                          className="group p-2.5 rounded-lg bg-[#0f0e0c] border border-[#2a2723] hover:border-[#d4a373]/20 transition-all"
                        >
                          {editingMemoryId === memory._id ? (
                            <div className="flex gap-2 items-center">
                              <input 
                                autoFocus
                                name="settings-edit-memory"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                value={editMemoryText}
                                onChange={(e) => setEditMemoryText(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none text-xs text-[#f2efeb]"
                                onKeyDown={(e) => e.key === "Enter" && handleUpdateMemory(memory._id)}
                              />
                              <div className="flex gap-1">
                                <button onClick={() => handleUpdateMemory(memory._id)} className="text-[#d4a373] p-1"><Save className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditingMemoryId(null)} className="text-[#a8a29e] p-1"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-4">
                              <p className="text-[11px] text-[#a8a29e] leading-relaxed group-hover:text-[#f2efeb]">{memory.text}</p>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditingMemoryId(memory._id); setEditMemoryText(memory.text); }} className="p-1 text-[#a8a29e] hover:text-[#d4a373]"><Edit3 className="w-3 h-3" /></button>
                                <button onClick={() => deleteMemory({ id: memory._id })} className="p-1 text-[#a8a29e] hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-2 bg-[#0f0e0c]/90 backdrop-blur-2xl border-t border-[#2a2723] z-[100] md:hidden flex gap-2">
        <button
          onClick={() => signOut()}
          className="p-2.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-red-400"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#d4a373] text-[#0f0e0c] font-bold text-[10px] uppercase tracking-wider"
        >
          {isSaving ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Apply Changes
        </button>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 2px; height: 2px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2723; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4a373; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
