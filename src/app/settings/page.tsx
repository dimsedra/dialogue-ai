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
  Layout,
  Bot,
  Search,
  Globe
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function SettingsPage() {
  const profile = useQuery(api.ai.getProfile);
  const memories = useQuery(api.ai.getAllMemories);
  const updateProfile = useMutation(api.ai.updateProfile);
  const updateMemory = useMutation(api.ai.updateMemoryText);
  const deleteMemory = useMutation(api.ai.deleteMemory);
  const addMemory = useMutation(api.ai.saveMemory);
  const updatePreferences = useMutation(api.ai.updatePreferences);

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
    <div className="h-screen overflow-y-auto bg-[#0f0e0c] text-[#f2efeb] selection:bg-[#d4a373]/30 custom-scrollbar">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col items-start gap-2 mb-10">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-2.5 rounded-2xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all shadow-xl"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          </div>
          <p className="text-[#a8a29e] text-xs ml-14">Personalize your Dialogue experience.</p>
        </div>

        {/* Layout */}
        <div className="flex flex-col md:grid md:grid-cols-[240px_1fr] gap-8 sm:gap-12">
          {/* Navigation */}
          <nav className="flex flex-row md:flex-col justify-center md:justify-start gap-2 overflow-x-auto pb-4 md:pb-0 scrollbar-hide mb-4 md:mb-0">
            {[
              { id: "profile", label: "Profile", icon: User },
              { id: "ai", label: "AI Provider", icon: Cpu },
              { id: "memory", label: "Intelligence", icon: Brain },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "profile" | "ai" | "memory")}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-6 py-3.5 sm:py-4 rounded-2xl transition-all text-[11px] sm:text-sm font-bold whitespace-nowrap border-2 ${
                  activeTab === tab.id 
                    ? "bg-[#d4a373] text-[#0f0e0c] border-[#d4a373] shadow-[0_8px_20px_rgba(212,163,115,0.2)]" 
                    : "bg-[#1a1814] text-[#a8a29e] border-[#2a2723] hover:border-[#3a3733] hover:text-[#f2efeb]"
                }`}
              >
                <tab.icon className={`w-3.5 h-3.5 sm:w-4 h-4 ${activeTab === tab.id ? "text-[#0f0e0c]" : "text-[#a8a29e]"}`} />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="space-y-8">
            <AnimatePresence mode="wait">
              {activeTab === "profile" && (
                <motion.div 
                  key="profile"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <section className="space-y-6 bg-[#1a1814] p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-[#2a2723] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                      <User className="w-32 h-32" />
                    </div>
                    
                    <div className="space-y-1 mb-8">
                      <h2 className="text-xl font-bold">Identity Profile</h2>
                      <p className="text-[#a8a29e] text-xs">Configure how agents perceive and address you.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4a373]">Preferred Name</label>
                      <p className="text-[11px] text-[#a8a29e] mb-2">How should the agents call you during conversations?</p>
                      <input 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Alex"
                        className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-[#d4a373]/50 focus:ring-4 focus:ring-[#d4a373]/5 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4a373]">About You</label>
                      <p className="text-[11px] text-[#a8a29e] mb-2">Describe yourself, your goals, and your style. This helps the AI personalize its help.</p>
                      <textarea 
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={5}
                        placeholder="e.g. I am a software engineer who loves minimal design and deep work..."
                        className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-[#d4a373]/50 focus:ring-4 focus:ring-[#d4a373]/5 transition-all resize-none"
                      />
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === "ai" && (
                <motion.div 
                  key="ai"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <section className="bg-[#1a1814] p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-[#2a2723] shadow-2xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 rounded-2xl bg-[#d4a373]/10 border border-[#d4a373]/20">
                        <Cpu className="w-6 h-6 text-[#d4a373]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Inference Engine</h2>
                        <p className="text-[#a8a29e] text-xs">Choose your default processing engine.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <button 
                        onClick={() => setProvider("gemini")}
                        className={`p-6 rounded-3xl border transition-all text-left relative group ${
                          provider === "gemini" 
                            ? "bg-[#0f0e0c] border-[#d4a373]/30 shadow-inner" 
                            : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#2a2723]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex gap-4">
                            <div className="mt-1">
                              <Zap className={`w-5 h-5 ${provider === "gemini" ? "text-[#d4a373]" : "text-[#a8a29e]"}`} />
                            </div>
                            <div>
                              <h3 className={`font-bold text-sm sm:text-base mb-1 ${provider === "gemini" ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}>Gemini Cloud</h3>
                              <p className="text-[11px] sm:text-xs text-[#a8a29e] leading-relaxed">Fast, capable, and handles complex reasoning. Requires internet connection.</p>
                            </div>
                          </div>
                          <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            provider === "gemini" ? "border-[#d4a373]" : "border-[#2a2723]"
                          }`}>
                            {provider === "gemini" && <div className="h-3 w-3 rounded-full bg-[#d4a373]" />}
                          </div>
                        </div>
                      </button>

                      <button 
                        onClick={() => setProvider("lmstudio")}
                        className={`p-6 rounded-3xl border transition-all text-left relative group ${
                          provider === "lmstudio" 
                            ? "bg-[#0f0e0c] border-[#d4a373]/30 shadow-inner" 
                            : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#2a2723]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex gap-4">
                            <div className="mt-1">
                              <Bot className={`w-5 h-5 ${provider === "lmstudio" ? "text-[#d4a373]" : "text-[#a8a29e]"}`} />
                            </div>
                            <div>
                              <h3 className={`font-bold text-sm sm:text-base mb-1 ${provider === "lmstudio" ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}>LM Studio (Local)</h3>
                              <p className="text-[11px] sm:text-xs text-[#a8a29e] leading-relaxed">Full privacy. Runs on your machine. Needs LM Studio server running on port 1234.</p>
                            </div>
                          </div>
                          <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            provider === "lmstudio" ? "border-[#d4a373]" : "border-[#2a2723]"
                          }`}>
                            {provider === "lmstudio" && <div className="h-3 w-3 rounded-full bg-[#d4a373]" />}
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="mt-8 p-4 rounded-2xl bg-[#d4a373]/5 border border-[#d4a373]/10">
                      <p className="text-xs text-[#d4a373]/80 leading-relaxed italic text-center">
                        Note: This sets the default for new sessions. You can still toggle in individual chats.
                      </p>
                    </div>
                  </section>

                  {/* Search Provider Section */}
                  <section className="bg-[#1a1814] p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-[#2a2723] shadow-2xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 rounded-2xl bg-[#d4a373]/10 border border-[#d4a373]/20">
                        <Search className="w-6 h-6 text-[#d4a373]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Search Intelligence</h2>
                        <p className="text-[#a8a29e] text-xs">Configure how Dialogue researches the web.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button 
                        onClick={() => setSearchProvider("tavily")}
                        className={`p-6 rounded-3xl border transition-all text-left relative group ${
                          searchProvider === "tavily" 
                            ? "bg-[#0f0e0c] border-[#d4a373]/30 shadow-inner" 
                            : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#2a2723]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-2.5 rounded-xl bg-[#d4a373]/10">
                            <Zap className={`w-4 h-4 ${searchProvider === "tavily" ? "text-[#d4a373]" : "text-[#a8a29e]"}`} />
                          </div>
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            searchProvider === "tavily" ? "border-[#d4a373]" : "border-[#2a2723]"
                          }`}>
                            {searchProvider === "tavily" && <div className="h-2.5 w-2.5 rounded-full bg-[#d4a373]" />}
                          </div>
                        </div>
                        <h3 className={`font-bold text-sm sm:text-base mb-1 ${searchProvider === "tavily" ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}>Tavily AI</h3>
                        <p className="text-[11px] sm:text-xs text-[#a8a29e] leading-relaxed">Agentic search optimized for LLM synthesis.</p>
                      </button>

                      <button 
                        onClick={() => setSearchProvider("serper")}
                        className={`p-6 rounded-3xl border transition-all text-left relative group ${
                          searchProvider === "serper" 
                            ? "bg-[#0f0e0c] border-[#d4a373]/30 shadow-inner" 
                            : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#2a2723]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-2.5 rounded-xl bg-[#d4a373]/10">
                            <Globe className={`w-4 h-4 ${searchProvider === "serper" ? "text-[#d4a373]" : "text-[#a8a29e]"}`} />
                          </div>
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            searchProvider === "serper" ? "border-[#d4a373]" : "border-[#2a2723]"
                          }`}>
                            {searchProvider === "serper" && <div className="h-2.5 w-2.5 rounded-full bg-[#d4a373]" />}
                          </div>
                        </div>
                        <h3 className={`font-bold text-sm sm:text-base mb-1 ${searchProvider === "serper" ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}>Serper.dev</h3>
                        <p className="text-[11px] sm:text-xs text-[#a8a29e] leading-relaxed">High-performance Google Search API results.</p>
                      </button>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === "memory" && (
                <motion.div 
                  key="memory"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <section className="bg-[#1a1814] p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-[#2a2723] shadow-2xl">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-[#d4a373]/10 border border-[#d4a373]/20">
                          <Brain className="w-6 h-6 text-[#d4a373]" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">Semantic Memory</h2>
                          <p className="text-[#a8a29e] text-xs">What your agents have learned about you.</p>
                        </div>
                      </div>
                    </div>

                    {/* Add New Memory */}
                    <div className="mb-8 flex gap-3">
                      <input 
                        value={newMemoryText}
                        onChange={(e) => setNewMemoryText(e.target.value)}
                        placeholder="Add a new insight manually..."
                        className="flex-1 bg-[#0f0e0c] border border-[#2a2723] rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-[#d4a373]/50 transition-all"
                        onKeyDown={(e) => e.key === "Enter" && handleAddMemory()}
                      />
                      <button 
                        onClick={handleAddMemory}
                        className="p-3 rounded-2xl bg-[#d4a373]/10 border border-[#d4a373]/20 text-[#d4a373] hover:bg-[#d4a373]/20 transition-all shadow-lg"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {memories?.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-[#2a2723] rounded-3xl">
                          <Brain className="w-8 h-8 text-[#2a2723] mx-auto mb-3" />
                          <p className="text-[#a8a29e] text-sm italic text-center">No memories captured yet.</p>
                        </div>
                      )}
                      {memories?.map((memory) => (
                        <div 
                          key={memory._id}
                          className="group p-5 rounded-2xl bg-[#0f0e0c] border border-[#2a2723] hover:border-[#d4a373]/30 transition-all"
                        >
                          {editingMemoryId === memory._id ? (
                            <div className="flex gap-3">
                              <input 
                                autoFocus
                                value={editMemoryText}
                                onChange={(e) => setEditMemoryText(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none text-sm text-[#f2efeb]"
                                onKeyDown={(e) => e.key === "Enter" && handleUpdateMemory(memory._id)}
                              />
                              <button 
                                onClick={() => handleUpdateMemory(memory._id)}
                                className="text-[#d4a373] hover:text-[#c39262]"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-4">
                              <p className="text-sm text-[#a8a29e] leading-relaxed group-hover:text-[#f2efeb] transition-colors">{memory.text}</p>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    setEditingMemoryId(memory._id);
                                    setEditMemoryText(memory.text);
                                  }}
                                  className="p-2 rounded-xl hover:bg-[#1a1814] text-[#a8a29e] hover:text-[#d4a373] transition-all"
                                >
                                  <Layout className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => deleteMemory({ id: memory._id })}
                                  className="p-2 rounded-xl hover:bg-red-500/10 text-[#a8a29e] hover:text-red-400 transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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

      {/* Floating Save Button for Mobile / Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0f0e0c]/80 backdrop-blur-xl border-t border-[#2a2723] z-50 md:hidden">
        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#d4a373] text-[#0f0e0c] font-black uppercase tracking-widest text-xs transition-all shadow-2xl disabled:opacity-50 active:scale-[0.98]"
        >
          {isSaving ? <Sparkles className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Configuration
        </button>
      </div>

      {/* Desktop Save Button (Inline) */}
      <div className="hidden md:block max-w-4xl mx-auto px-6 pb-20">
        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#d4a373] hover:bg-[#c39262] text-[#0f0e0c] font-bold transition-all shadow-xl shadow-[#d4a373]/10 disabled:opacity-50"
        >
          {isSaving ? <Sparkles className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Apply Settings
        </button>
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2723; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4a373; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
