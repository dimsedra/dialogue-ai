"use client";

import { usePbProfile, usePbMemoriesList, usePbUpdateProfile, usePbUpdatePreferences, usePbAddSubscription, usePbRemoveSubscription, usePbMemoryCreate, usePbMemoryUpdate, usePbMemoryDelete } from "@/pb-compat";
import { useAuth } from "@/pb-compat/auth";
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
  X,
  Eye,
  EyeOff,
  Bell,
  ChevronDown,
  Clock,
  Play,
  Square,
  FolderOpen,
  Copy,
  Check,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

import { getProviderIcon } from "@/components/ProviderIcons";
import { checkEmbeddingModel } from "@/app/actions/checkEmbeddingModel";
import { getLocalEmbedding } from "@/lib/graph/embedding";

import TavilyIcon from "@/img/icon/search/tavily.svg";
import SerperIcon from "@/img/icon/search/serper.png";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function SettingsPage() {
  const profile = usePbProfile();

  const pbAuth = useAuth();

  const memories = usePbMemoriesList();

  const updateProfile = usePbUpdateProfile();

  const updateMemory = usePbMemoryUpdate();

  const deleteMemory = usePbMemoryDelete();

  const addMemory = usePbMemoryCreate();

  const updatePreferences = usePbUpdatePreferences();

  const addSubscription = usePbAddSubscription();
  const removeSubscription = usePbRemoveSubscription();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const router = useRouter();

  useEffect(() => {
    if (!pbAuth.isLoading && !pbAuth.user) {
      router.push("/");
    }
  }, [pbAuth.isLoading, pbAuth.user, router]);

  useEffect(() => {
    document.documentElement.classList.add("allow-scroll");
    document.body.classList.add("allow-scroll");
    return () => {
      document.documentElement.classList.remove("allow-scroll");
      document.body.classList.remove("allow-scroll");
    };
  }, []);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [timeFormat, setTimeFormat] = useState<"auto" | "12h" | "24h">("auto");
  type AIProvider = "gemini" | "lmstudio" | "openai" | "anthropic" | "deepseek" | "xai" | "mistral" | "groq" | "cohere" | "moonshotai" | "deepinfra" | "togetherai" | "fireworks" | "alibaba" | "baseten" | "huggingface" | "minimax" | "ollama" | "opencode" | "openrouter" | "zhipu" | "local-gguf";
  const [provider, setProvider] = useState<AIProvider>("gemini");

  // Local GGUF states
  const [localGgufModelPath, setLocalGgufModelPath] = useState("");
  const [localGgufGpuLayers, setLocalGgufGpuLayers] = useState<number | string>(99);
  const [localGgufContextSize, setLocalGgufContextSize] = useState<number | string>(4096);
  const [localGgufThreads, setLocalGgufThreads] = useState<number | string>(4);
  const [engineStatus, setEngineStatus] = useState<any>({
    status: "unloaded",
    modelPath: null,
    error: null,
  });
  const [isCopied, setIsCopied] = useState(false);
  const [isLoadingEngine, setIsLoadingEngine] = useState(false);
  const [customConfigs, setCustomConfigs] = useState<
    Record<string, { apiKey?: string; baseUrl?: string; modelId?: string }>
  >({});
  const [taskModels, setTaskModels] = useState<Record<string, string>>({});
  const [searchProvider, setSearchProvider] = useState<"tavily" | "serper">("tavily");
  const [searchApiKey, setSearchApiKey] = useState("");
  const [showSearchApiKey, setShowSearchApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLocalEmbeddingReady, setIsLocalEmbeddingReady] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<"profile" | "ai" | "memory" | "mcp">(
    "profile",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSavedSuccessfully, setIsSavedSuccessfully] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(
    null,
  );
  const [editMemoryText, setEditMemoryText] = useState("");
  const [newMemoryText, setNewMemoryText] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [mcpServers, setMcpServers] = useState<Record<string, { command: string; args: string[] }>>({});
  const [editingMcpKey, setEditingMcpKey] = useState<string | null>(null);
  const [editMcpForm, setEditMcpForm] = useState({ name: '', command: 'npx', args: '' });
  const [prevProfileId, setPrevProfileId] = useState<string | null>(
    null,
  );

  // Sync state during render when profile loads/changes
  if (profile && (profile as any)._id !== prevProfileId) {
    setPrevProfileId((profile as any)._id);
    setName(profile.name || "");
    setBio(profile.bio || "");
    const prefs = profile.preferences as Record<string, unknown> | undefined;
    if (prefs?.provider) {
      setProvider(prefs.provider as AIProvider);
    }
    if (prefs?.customConfigs) {
      setCustomConfigs(prefs.customConfigs as Record<string, { apiKey?: string; baseUrl?: string }>);
    }
    if (prefs?.taskModels) {
      setTaskModels(prefs.taskModels as Record<string, string>);
    }
    if (prefs?.searchProvider) {
      setSearchProvider(
        prefs.searchProvider as "tavily" | "serper",
      );
    }
    if (prefs?.pushEnabled !== undefined) {
      setPushEnabled(!!prefs.pushEnabled);
    }
    if (prefs?.mcpServers) {
      setMcpServers(prefs.mcpServers as Record<string, { command: string; args: string[] }>);
    }
    if (prefs?.timeFormat) {
      setTimeFormat(prefs.timeFormat as "auto" | "12h" | "24h");
    } else {
      setTimeFormat("auto");
    }
    if (prefs?.localGguf) {
      const lg = prefs.localGguf as any;
      setLocalGgufModelPath(lg.modelPath || "");
      setLocalGgufGpuLayers(lg.gpuLayers ?? 99);
      setLocalGgufContextSize(lg.contextSize || 4096);
      setLocalGgufThreads(lg.threads || 4);
    }
  }

  useEffect(() => {
    checkEmbeddingModel().then(setIsLocalEmbeddingReady);
  }, []);

  // Poll local GGUF model runner status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/local-model");
        if (res.ok) {
          const data = await res.json();
          setEngineStatus(data);
        }
      } catch (err) {
        console.warn("Failed to query local GGUF runner status:", err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyPath = () => {
    if (!localGgufModelPath) return;
    navigator.clipboard.writeText(localGgufModelPath);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleBrowsePath = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      try {
        const path = await (window as any).electronAPI.openFileDialog();
        if (path) {
          setLocalGgufModelPath(path);
        }
      } catch (err) {
        console.error("Failed to select GGUF file:", err);
      }
    }
  };

  const handleStartEngine = async () => {
    if (!localGgufModelPath) return;
    setIsLoadingEngine(true);
    try {
      await fetch("/api/local-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "load",
          config: {
            modelPath: localGgufModelPath,
            gpuLayers: localGgufGpuLayers,
            contextSize: localGgufContextSize,
            threads: localGgufThreads,
          },
        }),
      });
    } catch (err) {
      console.error("Failed to start LLM engine:", err);
    } finally {
      setIsLoadingEngine(false);
    }
  };

  const handleStopEngine = async () => {
    setIsLoadingEngine(true);
    try {
      await fetch("/api/local-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unload" }),
      });
    } catch (err) {
      console.error("Failed to stop LLM engine:", err);
    } finally {
      setIsLoadingEngine(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setIsSavedSuccessfully(false);
    const startTime = Date.now();
    try {
      await updateProfile({ name, bio, preferences: { pushEnabled } });
      await updatePreferences({
        provider,
        searchProvider,
        customConfigs,
        taskModels,
        mcpServers,
        timeFormat,
        localGguf: {
          modelPath: localGgufModelPath,
          gpuLayers: Number(localGgufGpuLayers) || 0,
          contextSize: Number(localGgufContextSize) || 4096,
          threads: Number(localGgufThreads) || 4,
        },
      });

      if (provider !== "local-gguf") {
        try {
          await fetch("/api/local-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unload" }),
          });
        } catch (e) {
          console.warn("Failed to auto-unload local GGUF runner on provider change:", e);
        }
      }

      // Enforce a minimum saving loader duration of 800ms to prevent quick micro-flicker
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      setIsSavedSuccessfully(true);
      setTimeout(() => {
        setIsSavedSuccessfully(false);
      }, 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePush = async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      alert("Push notifications are not supported on this browser.");
      return;
    }

    if (!publicKey) {
      alert("Server push key is not loaded yet. Please try again.");
      return;
    }

    if (!pushEnabled) {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          alert("Notification permission was denied.");
          return;
        }

        await navigator.serviceWorker.register("/sw.js");
        const registration = await navigator.serviceWorker.ready;

        const cleanKey = publicKey.replace(/^["']|["']$/g, "").trim();
        const convertedKey = urlBase64ToUint8Array(cleanKey);
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });

        const subJson = subscription.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          await addSubscription({
            endpoint: subJson.endpoint,
            expirationTime: subJson.expirationTime ?? null,
            keys: {
              p256dh: subJson.keys.p256dh,
              auth: subJson.keys.auth,
            },
          });
        }

        setPushEnabled(true);
        await updateProfile({ preferences: { pushEnabled: true } });
      } catch (err) {
        console.error("Failed to enable push notifications:", err);
        alert("Failed to subscribe to push notifications.");
      }
    } else {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await removeSubscription({ endpoint: subscription.endpoint });
            await subscription.unsubscribe();
          }
        }
        setPushEnabled(false);
        await updateProfile({ preferences: { pushEnabled: false } });
      } catch (err) {
        console.error("Failed to disable push notifications:", err);
        alert("Failed to unsubscribe from push notifications.");
      }
    }
  };

  const handleUpdateMemory = async (id: string) => {
    await updateMemory({ id, text: editMemoryText });
    setEditingMemoryId(null);
  };

  const handleAddMemory = async () => {
    if (!newMemoryText.trim()) return;
    const embedding = await getLocalEmbedding(newMemoryText);
    await addMemory({ text: newMemoryText, embedding });
    setNewMemoryText("");
  };

  const AI_PROVIDERS = [
    { id: "gemini", name: "Google Gemini", desc: "Cloud-based reasoning and large context." },
    { id: "openai", name: "OpenAI", desc: "GPT-4 and compatible endpoints." },
    { id: "anthropic", name: "Anthropic", desc: "Claude 3.5 Sonnet and Opus." },
    { id: "deepseek", name: "DeepSeek", desc: "DeepSeek Coder and Chat models." },
    { id: "xai", name: "xAI (Grok)", desc: "Grok 2 and upcoming models." },
    { id: "mistral", name: "Mistral AI", desc: "Open-weight and enterprise models." },
    { id: "groq", name: "Groq", desc: "Ultra-fast inference via LPU." },
    { id: "cohere", name: "Cohere", desc: "Command R+ and enterprise models." },
    { id: "moonshotai", name: "Moonshot AI", desc: "Kimi models with long context." },
    { id: "deepinfra", name: "DeepInfra", desc: "Serverless inference for OS models." },
    { id: "togetherai", name: "Together AI", desc: "Fast inference for OS models." },
    { id: "fireworks", name: "Fireworks AI", desc: "Blazing fast OS model serving." },
    { id: "alibaba", name: "Alibaba (Qwen)", desc: "Qwen series of powerful OS models." },
    { id: "baseten", name: "Baseten", desc: "Managed model inference." },
    { id: "huggingface", name: "Hugging Face", desc: "Open source community models." },
    { id: "minimax", name: "MiniMax", desc: "Powerful models including MiniMax M3." },
    { id: "ollama", name: "Ollama", desc: "Run models locally with ease." },
    { id: "opencode", name: "OpenCode", desc: "Terminal-based AI coding assistant." },
    { id: "openrouter", name: "OpenRouter", desc: "Unified API for many AI models." },
    { id: "zhipu", name: "Zhipu AI (GLM)", desc: "GLM series models by Zhipu AI." },
    { id: "lmstudio", name: "LM Studio", desc: "Local execution for maximum privacy." },
    { id: "local-gguf", name: "Local GGUF (Dialogue Native)", desc: "Load and run GGUF models directly within Dialogue." },
  ] as const;

  return (
    <div className="settings-container bg-[#0f0e0c] text-[#f2efeb] selection:bg-[#d4a373]/30 custom-scrollbar">
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
          <p className="text-[#a8a29e] text-[10px] ml-12">
            Personalize your Dialogue experience.
          </p>
        </div>

        {/* Layout */}
        <div className="flex flex-col md:grid md:grid-cols-[220px_1fr] gap-6 sm:gap-12 items-start">
          {/* Navigation Sidebar (Sticky) */}
          <nav className="flex flex-col w-full md:sticky md:top-6 space-y-2">
            <div className="flex flex-row md:flex-col gap-1.5 overflow-x-auto pb-4 md:pb-0 mb-4 md:mb-6 scrollbar-hide">
              {(
                [
                  { id: "profile", label: "Profile", icon: User },
                  { id: "ai", label: "AI Provider", icon: Cpu },
                  { id: "memory", label: "Intelligence", icon: Brain },
                  { id: "mcp", label: "MCP Servers", icon: Globe },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-2.5 px-4 py-2.5 rounded-xl transition-all text-[11px] font-bold whitespace-nowrap border-2 ${
                    activeTab === tab.id
                      ? "bg-[#d4a373] text-[#0f0e0c] border-[#d4a373] shadow-[0_5px_15px_rgba(212,163,115,0.15)]"
                      : "bg-[#1a1814] text-[#a8a29e] border-[#2a2723] hover:border-[#3a3733] hover:text-[#f2efeb]"
                  }`}
                >
                  <tab.icon
                    className={`w-3.5 h-3.5 ${activeTab === tab.id ? "text-[#0f0e0c]" : "text-[#a8a29e]"}`}
                  />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Actions Section (Sticky Bottom of Sidebar) */}
            <div className="hidden md:flex flex-col gap-2 pt-4 border-t border-[#2a2723]">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving || isSavedSuccessfully}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all shadow-xl active:scale-[0.98] ${
                  isSavedSuccessfully
                    ? "bg-[#588157] hover:bg-[#588157] text-[#f2efeb] shadow-[#588157]/10"
                    : "bg-[#d4a373] hover:bg-[#c39262] text-[#0f0e0c] shadow-[#d4a373]/10"
                }`}
              >
                {isSaving ? (
                  <Sparkles className="w-3.5 h-3.5 animate-spin text-current" />
                ) : isSavedSuccessfully ? (
                  <Check className="w-3.5 h-3.5 text-current animate-bounce" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-current" />
                )}
                {isSaving ? "Saving..." : isSavedSuccessfully ? "Settings Applied!" : "Apply Settings"}
              </button>

              <button
                onClick={() => pbAuth.signOut()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#f87171] hover:bg-red-500/10 hover:border-red-500/20 transition-all font-black uppercase tracking-widest text-[9px] group"
              >
                <LogOut className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                Sign Out
              </button>
            </div>
          </nav>

          {/* Content Area */}
          <div className="w-full min-h-100">
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
                      <h2 className="text-base font-bold text-[#f2efeb]">
                        Identity Profile
                      </h2>
                      <p className="text-[#a8a29e] text-[10px]">
                        Personalize how your AI companions interact with you.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-[#d4a373]">
                          Preferred Name
                        </label>
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
                        <label className="text-[9px] font-bold uppercase tracking-wider text-[#d4a373]">
                          Persona & Instructions
                        </label>
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

                  <section className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Clock className="w-4 h-4 text-[#d4a373]" />
                      <div>
                        <h2 className="text-base font-bold text-[#f2efeb]">
                          Interface Preferences
                        </h2>
                        <p className="text-[#a8a29e] text-[11px]">
                          Customize how time and dates are formatted.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-[#d4a373]">
                        Time Format
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: "auto", label: "Auto", desc: "Locale default" },
                            { id: "12h", label: "12-Hour", desc: "e.g. 4:12 PM" },
                            { id: "24h", label: "24-Hour", desc: "e.g. 16:12" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setTimeFormat(opt.id)}
                            className={`p-3 rounded-lg border text-left transition-all focus:outline-none ${
                              timeFormat === opt.id
                                ? "bg-[#d4a373]/10 border-[#d4a373] text-[#f2efeb]"
                                : "bg-[#0f0e0c] border-[#2a2723] hover:border-[#3a3733] text-[#a8a29e] hover:text-[#f2efeb]"
                            }`}
                          >
                            <div className="text-xs font-bold">{opt.label}</div>
                            <div className="text-[9px] opacity-60 mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Bell className="w-4 h-4 text-[#d4a373]" />
                      <div>
                        <h2 className="text-base font-bold text-[#f2efeb]">
                          System Notifications
                        </h2>
                        <p className="text-[#a8a29e] text-[11px]">
                          Configure alerts sent directly to your device.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#0f0e0c] border border-[#2a2723] flex items-center justify-between">
                      <div className="space-y-1 pr-4">
                        <h3 className="text-xs font-bold text-[#f2efeb]">
                          Closed-Tab Notifications
                        </h3>
                        <p className="text-xs text-[#a8a29e] leading-relaxed">
                          Receive browser push alerts for scheduled reminders
                          even when Dialogue is not open.
                        </p>
                        <p className="text-[11px] text-[#a8a29e]/60 leading-normal mt-1.5 max-w-md">
                          💡 Brave users: Ensure{" "}
                          <span className="text-[#d4a373]">
                            &quot;Use Google services for push messaging&quot;
                          </span>{" "}
                          is enabled in{" "}
                          <code className="bg-[#1a1814] px-1 py-0.5 rounded text-[10px]">
                            brave://settings/privacy
                          </code>
                          .
                        </p>
                      </div>
                      <button
                        onClick={handleTogglePush}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          pushEnabled ? "bg-[#d4a373]" : "bg-[#2a2723]"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#0f0e0c] shadow ring-0 transition duration-200 ease-in-out ${
                            pushEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
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
                      <h2 className="text-base font-bold text-[#f2efeb]">
                        Inference Engine
                      </h2>
                    </div>

                    <div className="space-y-4">
                      <div 
                        className="space-y-2 relative"
                        tabIndex={0}
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setIsProviderDropdownOpen(false);
                          }
                        }}
                      >
                        <label className="text-[9px] font-bold uppercase tracking-wider text-[#d4a373]">
                          Select Provider
                        </label>
                        
                        {(() => {
                          const activeProvider = AI_PROVIDERS.find(p => p.id === provider);
                          if (!activeProvider) return null;
                          const ProviderIcon = getProviderIcon(activeProvider.id);
                          return (
                            <button
                              type="button"
                              onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
                              className="w-full text-left p-3 rounded-lg bg-[#0f0e0c] border border-[#2a2723] hover:border-[#3a3733] flex items-center justify-between gap-3.5 transition-all focus:outline-none focus:border-[#d4a373]/40"
                            >
                              <div className="flex items-center gap-3.5">
                                <ProviderIcon className="w-5 h-5 text-[#d4a373]" />
                                <div>
                                  <h3 className="text-[13px] font-bold text-[#f2efeb]">
                                    {activeProvider.name}
                                  </h3>
                                  <p className="text-[11px] text-[#a8a29e] leading-tight">
                                    {activeProvider.desc}
                                  </p>
                                </div>
                              </div>
                              <ChevronDown className={`w-4 h-4 text-[#a8a29e] transition-transform ${isProviderDropdownOpen ? "rotate-180" : ""}`} />
                            </button>
                          );
                        })()}

                        <AnimatePresence>
                          {isProviderDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              transition={{ duration: 0.15 }}
                              className="absolute z-20 w-full mt-2 bg-[#0f0e0c] border border-[#2a2723] rounded-lg shadow-2xl max-h-64 overflow-y-auto"
                            >
                              {AI_PROVIDERS.map((p) => {
                                const Icon = getProviderIcon(p.id);
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setProvider(p.id as AIProvider);
                                      setShowApiKey(false);
                                      setIsProviderDropdownOpen(false);
                                    }}
                                    className={`w-full text-left p-3 flex items-center gap-3.5 hover:bg-[#1a1815] transition-colors border-b border-[#2a2723]/50 last:border-b-0 ${
                                      provider === p.id ? "bg-[#1a1815]" : ""
                                    }`}
                                  >
                                    <Icon className="w-5 h-5 text-[#d4a373]" />
                                    <div>
                                      <h3 className="text-[13px] font-bold text-[#f2efeb]">
                                        {p.name}
                                      </h3>
                                      <p className="text-[11px] text-[#a8a29e] leading-tight">
                                        {p.desc}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {provider === "local-gguf" ? (
                      <div className="mt-4 p-4 rounded-xl bg-[#0f0e0c] border border-[#2a2723] space-y-4">
                        <div>
                          <h3 className="text-[11px] font-bold text-[#d4a373] uppercase tracking-wider mb-1">
                            Local AI Center (Native GGUF)
                          </h3>
                          <p className="text-[10px] text-[#a8a29e] leading-normal mb-3">
                            Dialogue will load and run this model in an isolated background process to prevent memory leaks and crashes.
                          </p>
                        </div>

                        {/* Model Path Picker */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                            GGUF Model File Path
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={localGgufModelPath}
                              placeholder="No model file selected. Click Browse to select a .gguf model..."
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs text-[#f2efeb] focus:outline-none cursor-default truncate"
                            />
                            <button
                              type="button"
                              onClick={handleBrowsePath}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2723] hover:border-[#d4a373]/50 text-xs font-semibold text-[#f2efeb] bg-[#1a1814] hover:bg-[#201d19] transition-all whitespace-nowrap focus:outline-none"
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-[#d4a373]" />
                              Browse
                            </button>
                            {localGgufModelPath && (
                              <button
                                type="button"
                                onClick={handleCopyPath}
                                className="p-1.5 rounded-lg border border-[#2a2723] hover:border-[#d4a373]/50 text-[#f2efeb] bg-[#1a1814] hover:bg-[#201d19] transition-all focus:outline-none"
                                title="Copy Path"
                              >
                                {isCopied ? (
                                  <Check className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-[#a8a29e]" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Hardware Tuning Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5 col-span-1">
                            <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                              GPU Offload
                            </label>
                            <div className="flex items-center justify-between bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 h-[34px]">
                              <span className="text-[11px] text-[#f2efeb] select-none">
                                Full Offload
                              </span>
                              <button
                                type="button"
                                onClick={() => setLocalGgufGpuLayers(localGgufGpuLayers === 99 ? 0 : 99)}
                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  localGgufGpuLayers === 99 ? "bg-[#d4a373]" : "bg-[#2a2723]"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-[#0f0e0c] shadow ring-0 transition duration-200 ease-in-out ${
                                    localGgufGpuLayers === 99 ? "translate-x-3" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                            {localGgufGpuLayers !== 99 && (
                              <div className="flex items-center justify-between gap-2 bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 h-[34px] mt-1.5">
                                <span className="text-[9px] text-[#a8a29e] uppercase">Layers:</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="120"
                                  value={localGgufGpuLayers}
                                  onChange={(e) => setLocalGgufGpuLayers(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                                  onBlur={() => setLocalGgufGpuLayers((prev) => Math.max(0, Math.min(120, typeof prev === "number" ? prev : parseInt(prev) || 0)))}
                                  className="w-12 bg-transparent text-right text-xs text-[#f2efeb] focus:outline-none font-mono"
                                />
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                              Context Size
                            </label>
                            <input
                              type="number"
                              min="512"
                              max="131072"
                              step="512"
                              value={localGgufContextSize}
                              onChange={(e) => setLocalGgufContextSize(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                              onBlur={() => setLocalGgufContextSize((prev) => Math.max(512, Math.min(131072, typeof prev === "number" ? prev : parseInt(prev) || 4096)))}
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs text-[#f2efeb] focus:outline-none focus:border-[#d4a373]/40 transition-all"
                            />
                            <p className="text-[8px] text-[#a8a29e]/50">Tokens (e.g. 60000)</p>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                              CPU Threads
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="64"
                              value={localGgufThreads}
                              onChange={(e) => setLocalGgufThreads(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                              onBlur={() => setLocalGgufThreads((prev) => Math.max(1, Math.min(64, typeof prev === "number" ? prev : parseInt(prev) || 4)))}
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs text-[#f2efeb] focus:outline-none focus:border-[#d4a373]/40 transition-all"
                            />
                            <p className="text-[8px] text-[#a8a29e]/50">Inference threads</p>
                          </div>
                        </div>

                        {/* Engine Live Status Indicator Card */}
                        <div className={`mt-2 p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
                          engineStatus.status === 'ready' 
                            ? 'bg-green-500/5 border-green-500/20' 
                            : engineStatus.status === 'loading'
                            ? 'bg-yellow-500/5 border-yellow-500/20'
                            : engineStatus.status === 'error'
                            ? 'bg-red-500/5 border-red-500/20'
                            : 'bg-[#12110e] border-[#2a2723]'
                        }`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-[#a8a29e] tracking-wider">Engine Status:</span>
                              <span className={`text-[11px] font-bold ${
                                engineStatus.status === 'ready'
                                  ? 'text-green-400'
                                  : engineStatus.status === 'loading'
                                  ? 'text-yellow-400'
                                  : engineStatus.status === 'error'
                                  ? 'text-red-400'
                                  : 'text-neutral-400'
                              }`}>
                                {engineStatus.status === 'ready' && '🟢 Ready (Listening on port 11430)'}
                                {engineStatus.status === 'loading' && '🟡 Loading GGUF Model...'}
                                {engineStatus.status === 'unloaded' && '⚪ Unloaded (Saves VRAM & RAM)'}
                                {engineStatus.status === 'error' && '🔴 Error loading GGUF model'}
                              </span>
                            </div>
                            {engineStatus.status === 'ready' && engineStatus.modelPath && (
                              <p className="text-[9px] text-[#a8a29e] truncate max-w-md">
                                Loaded: {engineStatus.modelPath.split(/[\\/]/).pop()}
                              </p>
                            )}
                            {engineStatus.status === 'error' && engineStatus.error && (
                              <p className="text-[9px] text-red-400 max-w-md leading-tight">
                                {engineStatus.error}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {engineStatus.status === 'unloaded' || engineStatus.status === 'error' ? (
                              <button
                                type="button"
                                disabled={!localGgufModelPath || isLoadingEngine}
                                onClick={handleStartEngine}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-500/30 hover:border-green-500/60 text-green-400 bg-green-500/5 hover:bg-green-500/10 text-xs font-bold transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-none"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                Start Engine
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isLoadingEngine}
                                onClick={handleStopEngine}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 hover:border-red-500/60 text-red-400 bg-red-500/5 hover:bg-red-500/10 text-xs font-bold transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-none"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                                Stop Engine
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 p-4 rounded-xl bg-[#0f0e0c] border border-[#2a2723] space-y-3">
                        <h3 className="text-[11px] font-bold text-[#d4a373] uppercase tracking-wider mb-2">
                          Custom {provider} Config
                        </h3>
                        <div className="space-y-1.5">
                          <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                            {provider === "lmstudio"
                              ? "API Key (Ignored for local LLM)"
                              : "API Key (Overrides Env Var)"}
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type={showApiKey ? "text" : "password"}
                              value={customConfigs[provider]?.apiKey || ""}
                              onChange={(e) =>
                                setCustomConfigs((prev) => ({
                                  ...prev,
                                  [provider]: {
                                    ...prev[provider],
                                    apiKey: e.target.value,
                                  },
                                }))
                              }
                              onCopy={(e) => !showApiKey && e.preventDefault()}
                              onCut={(e) => !showApiKey && e.preventDefault()}
                              placeholder={
                                provider === "lmstudio"
                                  ? showApiKey
                                    ? "lm-studio"
                                    : "••••••••••••"
                                  : showApiKey
                                    ? "sk-..."
                                    : "••••••••••••"
                              }
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg pl-3 pr-9 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-2.5 text-[#a8a29e] hover:text-[#f2efeb] focus:outline-none transition-colors"
                              title={showApiKey ? "Hide API Key" : "Show API Key"}
                            >
                              {showApiKey ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                            {provider === "lmstudio"
                              ? "Base URL (Defaults to http://localhost:1234/v1)"
                              : "Base URL (Optional)"}
                          </label>
                          <input
                            type="text"
                            value={customConfigs[provider]?.baseUrl || ""}
                            onChange={(e) =>
                              setCustomConfigs((prev) => ({
                                ...prev,
                                [provider]: {
                                  ...prev[provider],
                                  baseUrl: e.target.value,
                                },
                              }))
                            }
                            placeholder={
                              provider === "openai"
                                ? "https://api.openai.com/v1"
                                : provider === "lmstudio"
                                  ? "http://localhost:1234/v1"
                                  : ""
                            }
                            className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                            Model ID (Optional)
                          </label>
                          <input
                            type="text"
                            value={customConfigs[provider]?.modelId || ""}
                            onChange={(e) =>
                              setCustomConfigs((prev) => ({
                                ...prev,
                                [provider]: {
                                  ...prev[provider],
                                  modelId: e.target.value,
                                },
                              }))
                            }
                            placeholder={
                              provider === "openai"
                                ? "gpt-4o"
                                : provider === "anthropic"
                                  ? "claude-3-5-sonnet-latest"
                                  : provider === "lmstudio"
                                    ? "e.g. llama-3.2-3b-instruct"
                                    : "gemini-1.5-pro"
                            }
                            className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4 p-4 rounded-xl bg-[#0f0e0c] border border-[#2a2723] space-y-3">
                      <h3 className="text-[11px] font-bold text-[#d4a373] uppercase tracking-wider mb-2">
                        Task Models
                      </h3>
                      <p className="text-[11px] text-[#a8a29e]/60 leading-relaxed">
                        Models used for background tasks like reflection
                        summaries and OCR. These do not need to be as powerful
                        as your chat model.
                      </p>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                          Reflection Summary
                        </label>
                        <input
                          type="text"
                          value={taskModels["reflection"] || ""}
                          onChange={(e) =>
                            setTaskModels((prev) => ({
                              ...prev,
                              reflection: e.target.value,
                            }))
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            handleSaveProfile()
                          }
                          placeholder={
                            provider === "local-gguf"
                              ? "local-model (Runs on active GGUF)"
                              : customConfigs[provider]?.modelId || "gemini-2.0-flash"
                          }
                          className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                          OCR / Vision Extraction
                        </label>
                        <p className="text-[10px] text-[#a8a29e]/50">
                          Requires a multimodal model that supports image input
                          (e.g. Gemini Pro Vision, GPT-4o).
                        </p>
                        <input
                          type="text"
                          value={taskModels["ocr"] || ""}
                          onChange={(e) =>
                            setTaskModels((prev) => ({
                              ...prev,
                              ocr: e.target.value,
                            }))
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            handleSaveProfile()
                          }
                          placeholder={
                            provider === "local-gguf"
                              ? "local-model (Runs on active GGUF)"
                              : customConfigs[provider]?.modelId || "gemini-2.0-flash"
                          }
                          className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                          Auto-Title & Date Parsing
                        </label>
                        <input
                          type="text"
                          value={taskModels["title"] || ""}
                          onChange={(e) =>
                            setTaskModels((prev) => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            handleSaveProfile()
                          }
                          placeholder={
                            provider === "local-gguf"
                              ? "local-model (Runs on active GGUF)"
                              : customConfigs[provider]?.modelId || "gemini-2.0-flash-lite"
                          }
                          className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                          Memory Extraction
                        </label>
                        <input
                          type="text"
                          value={taskModels["memory"] || ""}
                          onChange={(e) =>
                            setTaskModels((prev) => ({
                              ...prev,
                              memory: e.target.value,
                            }))
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            handleSaveProfile()
                          }
                          placeholder={
                            provider === "local-gguf"
                              ? "local-model (Runs on active GGUF)"
                              : customConfigs[provider]?.modelId || "gemini-2.0-flash-lite"
                          }
                          className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                        />
                      </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-[#2a2723]">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <Brain className="w-4 h-4 text-[#d4a373]" />
                          <h2 className="text-base font-bold text-[#f2efeb]">
                            Semantic Memory Engine
                          </h2>
                        </div>
                        {isLocalEmbeddingReady ? (
                          <div className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                              Local Engine Active
                            </span>
                          </div>
                        ) : (
                          <div className="px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                              Engine Missing
                            </span>
                          </div>
                        )}
                      </div>

                      <div className={`p-4 rounded-xl border ${isLocalEmbeddingReady ? "bg-[#d4a373]/5 border-[#d4a373]/20" : "bg-red-500/5 border-red-500/20"}`}>
                        <div className="flex flex-col gap-1">
                          <h3 className={`text-xs font-bold ${isLocalEmbeddingReady ? "text-[#d4a373]" : "text-red-400"}`}>
                            Transformers.js (multilingual-e5-small)
                          </h3>
                          <p className="text-[11px] text-[#a8a29e] leading-relaxed">
                            {isLocalEmbeddingReady 
                              ? "The local embedding model is successfully bundled and cached. Dialogue is ready to securely vectorize your semantic memory entirely offline." 
                              : "The local embedding model is missing from your models directory. Please run the download script to enable offline semantic memory."}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-[#2a2723]">
                      <div className="flex items-center gap-2.5 mb-4">
                        <Search className="w-4 h-4 text-[#d4a373]" />
                        <h2 className="text-base font-bold text-[#f2efeb]">
                          Search Intelligence
                        </h2>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(
                          [
                            {
                              id: "tavily",
                              name: "Tavily AI",
                              desc: "Optimized for LLM research.",
                              imageSrc: TavilyIcon,
                            },
                            {
                              id: "serper",
                              name: "Serper.dev",
                              desc: "Google Search API power.",
                              imageSrc: SerperIcon,
                            },
                          ] as const
                        ).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setSearchProvider(s.id);
                              setShowSearchApiKey(false);
                            }}
                            className={`p-3 rounded-lg border transition-all text-left group ${
                              searchProvider === s.id
                                ? "bg-[#0f0e0c] border-[#d4a373]/40"
                                : "bg-[#1a1814]/50 border-[#2a2723] hover:border-[#3a3733]"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <Image 
                                src={s.imageSrc} 
                                alt={s.name} 
                                width={16} 
                                height={16}
                                className={`object-contain ${searchProvider === s.id ? "opacity-100" : "opacity-50 grayscale"}`}
                              />
                              <div
                                className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${
                                  searchProvider === s.id
                                    ? "border-[#d4a373]"
                                    : "border-[#2a2723]"
                                }`}
                              >
                                {searchProvider === s.id && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#d4a373]" />
                                )}
                              </div>
                            </div>
                            <h3
                              className={`text-[12px] font-bold ${searchProvider === s.id ? "text-[#f2efeb]" : "text-[#a8a29e]"}`}
                            >
                              {s.name}
                            </h3>
                            <p className="text-[10px] text-[#a8a29e] leading-tight">
                              {s.desc}
                            </p>
                          </button>
                        ))}
                      </div>

                      {/* Custom Search Config */}
                      <div className="mt-4 p-4 rounded-xl bg-[#0f0e0c] border border-[#2a2723] space-y-3">
                        <h3 className="text-[11px] font-bold text-[#d4a373] uppercase tracking-wider mb-2">
                          Custom {searchProvider} Config
                        </h3>
                        <div className="space-y-1.5">
                          <label className="text-[9px] text-[#a8a29e] uppercase tracking-wider">
                            API Key (Overrides Env Var)
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type={showSearchApiKey ? "text" : "password"}
                              value={
                                customConfigs[searchProvider]?.apiKey || ""
                              }
                              onChange={(e) =>
                                setCustomConfigs((prev) => ({
                                  ...prev,
                                  [searchProvider]: {
                                    ...prev[searchProvider],
                                    apiKey: e.target.value,
                                  },
                                }))
                              }
                              onCopy={(e) =>
                                !showSearchApiKey && e.preventDefault()
                              }
                              onCut={(e) =>
                                !showSearchApiKey && e.preventDefault()
                              }
                              placeholder={
                                showSearchApiKey
                                  ? searchProvider === "tavily"
                                    ? "tvly-..."
                                    : "api_key"
                                  : "••••••••••••"
                              }
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg pl-3 pr-9 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all text-[#f2efeb]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowSearchApiKey(!showSearchApiKey)
                              }
                              className="absolute right-2.5 text-[#a8a29e] hover:text-[#f2efeb] focus:outline-none transition-colors"
                              title={
                                showSearchApiKey
                                  ? "Hide API Key"
                                  : "Show API Key"
                              }
                            >
                              {showSearchApiKey ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
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
                      <h2 className="text-base font-bold text-[#f2efeb]">
                        Semantic Memory
                      </h2>
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
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAddMemory()
                        }
                      />
                      <button
                        onClick={handleAddMemory}
                        className="px-3 rounded-lg bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-87.5 overflow-y-auto pr-1 custom-scrollbar">
                      {memories?.length === 0 && (
                        <div className="text-center py-8 border border-dashed border-[#2a2723] rounded-lg">
                          <p className="text-[#a8a29e] text-[10px] italic">
                            No memories stored.
                          </p>
                        </div>
                      )}
                      {memories?.map((memory: any) => (
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
                                onChange={(e) =>
                                  setEditMemoryText(e.target.value)
                                }
                                className="flex-1 bg-transparent border-none outline-none text-xs text-[#f2efeb]"
                                onKeyDown={(e) =>
                                  e.key === "Enter" &&
                                  handleUpdateMemory(memory._id)
                                }
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleUpdateMemory(memory._id)}
                                  className="text-[#d4a373] p-1"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingMemoryId(null)}
                                  className="text-[#a8a29e] p-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-4">
                              <p className="text-[11px] text-[#a8a29e] leading-relaxed group-hover:text-[#f2efeb]">
                                {memory.text}
                              </p>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingMemoryId(memory._id);
                                    setEditMemoryText(memory.text);
                                  }}
                                  className="p-1 text-[#a8a29e] hover:text-[#d4a373]"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    deleteMemory({ id: memory._id })
                                  }
                                  className="p-1 text-[#a8a29e] hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
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

              {activeTab === "mcp" && (
                <motion.div
                  key="mcp"
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  className="space-y-4"
                >
                  <section className="bg-[#1a1814] p-5 rounded-xl border border-[#2a2723] shadow-lg">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Globe className="w-4 h-4 text-[#d4a373]" />
                      <div>
                        <h2 className="text-base font-bold text-[#f2efeb]">
                          MCP Servers
                        </h2>
                        <p className="text-[#a8a29e] text-[10px]">
                          External tool integrations via the Model Context Protocol.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {Object.keys(mcpServers).length === 0 && !editingMcpKey && (
                        <div className="text-center py-8 border border-dashed border-[#2a2723] rounded-lg">
                          <p className="text-[#a8a29e] text-[10px] italic mb-3">
                            No MCP servers configured.
                          </p>
                          <button
                            onClick={() => {
                              setEditingMcpKey("__new");
                              setEditMcpForm({ name: '', command: 'npx', args: '' });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4a373] text-[#0f0e0c] text-[10px] font-bold hover:bg-[#c39262] transition-all"
                          >
                            <Plus className="w-3 h-3" />
                            Add Server
                          </button>
                        </div>
                      )}

                      {editingMcpKey === "__new" && (
                        <div className="p-3 rounded-lg bg-[#0f0e0c] border border-[#d4a373]/40 space-y-2">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]">
                              Server Name
                            </label>
                            <input
                              autoFocus
                              value={editMcpForm.name}
                              onChange={(e) => setEditMcpForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="e.g. wikipedia"
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]">
                              Command
                            </label>
                            <input
                              value={editMcpForm.command}
                              onChange={(e) => setEditMcpForm(f => ({ ...f, command: e.target.value }))}
                              placeholder="npx"
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]">
                              Arguments
                            </label>
                            <input
                              value={editMcpForm.args}
                              onChange={(e) => setEditMcpForm(f => ({ ...f, args: e.target.value }))}
                              placeholder="-y wikipedia-mcp"
                              className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all"
                            />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              disabled={!editMcpForm.name.trim() || !editMcpForm.command.trim()}
                              onClick={() => {
                                setMcpServers(prev => ({
                                  ...prev,
                                  [editMcpForm.name.trim()]: {
                                    command: editMcpForm.command.trim(),
                                    args: editMcpForm.args.trim() ? editMcpForm.args.trim().split(/\s+/) : [],
                                  },
                                }));
                                setEditingMcpKey(null);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4a373] text-[#0f0e0c] text-[10px] font-bold hover:bg-[#c39262] transition-all disabled:opacity-40"
                            >
                              <Save className="w-3 h-3" />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMcpKey(null)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] text-[10px] font-bold hover:border-[#3a3733] transition-all"
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {Object.entries(mcpServers).map(([key, server]) => (
                        <div key={key}>
                          {editingMcpKey === key ? (
                            <div className="p-3 rounded-lg bg-[#0f0e0c] border border-[#d4a373]/40 space-y-2">
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]">
                                  Server Name
                                </label>
                                <input
                                  autoFocus
                                  value={editMcpForm.name}
                                  onChange={(e) => setEditMcpForm(f => ({ ...f, name: e.target.value }))}
                                  className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]">
                                  Command
                                </label>
                                <input
                                  value={editMcpForm.command}
                                  onChange={(e) => setEditMcpForm(f => ({ ...f, command: e.target.value }))}
                                  className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]">
                                  Arguments
                                </label>
                                <input
                                  value={editMcpForm.args}
                                  onChange={(e) => setEditMcpForm(f => ({ ...f, args: e.target.value }))}
                                  className="w-full bg-[#1a1814] border border-[#2a2723] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#d4a373]/40 transition-all"
                                />
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button
                                  disabled={!editMcpForm.name.trim() || !editMcpForm.command.trim()}
                                  onClick={() => {
                                    const updated = { ...mcpServers };
                                    delete updated[key];
                                    updated[editMcpForm.name.trim()] = {
                                      command: editMcpForm.command.trim(),
                                      args: editMcpForm.args.trim() ? editMcpForm.args.trim().split(/\s+/) : [],
                                    };
                                    setMcpServers(updated);
                                    setEditingMcpKey(null);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4a373] text-[#0f0e0c] text-[10px] font-bold hover:bg-[#c39262] transition-all disabled:opacity-40"
                                >
                                  <Save className="w-3 h-3" />
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingMcpKey(null)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] text-[10px] font-bold hover:border-[#3a3733] transition-all"
                                >
                                  <X className="w-3 h-3" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group p-3 rounded-lg bg-[#0f0e0c] border border-[#2a2723] hover:border-[#d4a373]/20 transition-all">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-[12px] font-bold text-[#f2efeb]">
                                    {key}
                                  </h3>
                                  <p className="text-[10px] text-[#a8a29e] font-mono truncate mt-0.5">
                                    {server.command} {server.args.join(' ')}
                                  </p>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    onClick={() => {
                                      setEditingMcpKey(key);
                                      setEditMcpForm({ name: key, command: server.command, args: server.args.join(' ') });
                                    }}
                                    className="p-1.5 text-[#a8a29e] hover:text-[#d4a373] transition-colors"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const updated = { ...mcpServers };
                                      delete updated[key];
                                      setMcpServers(updated);
                                    }}
                                    className="p-1.5 text-[#a8a29e] hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {Object.keys(mcpServers).length > 0 && editingMcpKey !== "__new" && (
                      <button
                        onClick={() => {
                          setEditingMcpKey("__new");
                          setEditMcpForm({ name: '', command: 'npx', args: '' });
                        }}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[#2a2723] text-[#a8a29e] text-[10px] font-bold hover:border-[#d4a373]/40 hover:text-[#d4a373] transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        Add Server
                      </button>
                    )}
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-2 bg-[#0f0e0c]/90 backdrop-blur-2xl border-t border-[#2a2723] z-100 md:hidden flex gap-2">
        <button
          onClick={() => pbAuth.signOut()}
          className="p-2.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-red-400"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleSaveProfile}
          disabled={isSaving || isSavedSuccessfully}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${
            isSavedSuccessfully
              ? "bg-[#588157] text-[#f2efeb]"
              : "bg-[#d4a373] text-[#0f0e0c]"
          }`}
        >
          {isSaving ? (
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
          ) : isSavedSuccessfully ? (
            <Check className="w-3.5 h-3.5 animate-bounce" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaving ? "Saving..." : isSavedSuccessfully ? "Changes Applied!" : "Apply Changes"}
        </button>
      </div>

      <style jsx global>{`
        .settings-container {
          min-height: 100dvh;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
          height: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2a2723;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4a373;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
