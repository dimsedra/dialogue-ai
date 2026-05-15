"use client";

import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Send, User, Bot, Sparkles, Trash2, Tag, Plus, X, Edit3, Check, ChevronLeft, ChevronRight, Clock, Settings, Zap, Cpu, Menu, Copy, File as FileIcon, PlusCircle, ExternalLink, CalendarDays, MapPin, Search, CheckCircle2, ArrowDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../convex/_generated/dataModel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { processLocalLLMRequest } from "../lib/lmstudio";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
}



function ToolCard({ toolCall }: { toolCall: ToolCall }) {
  if (!toolCall) return null;

  if (toolCall.name === "addTask") {
    const { text, dueDate, priority, category } = toolCall.args as { 
      text: string; 
      dueDate?: string; 
      priority?: string; 
      category?: string; 
    };
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 p-5 rounded-3xl bg-[#d4a373]/5 border border-[#d4a373]/10 space-y-4 shadow-xl shadow-black/20"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[#d4a373]">
            <div className="p-1.5 rounded-lg bg-[#d4a373]/10">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Task Created</span>
          </div>
          {priority && (
            <span className={`text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest border ${
              priority === "high" ? "bg-red-500/10 border-red-500/20 text-red-400" :
              priority === "medium" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
              "bg-blue-500/10 border-blue-500/20 text-blue-400"
            }`}>
              {priority}
            </span>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-[15px] text-[#f2efeb] font-semibold leading-relaxed">{text}</p>
          <div className="flex flex-wrap gap-4 pt-1">
            {category && (
              <div className="flex items-center gap-2 text-[11px] text-[#a8a29e] font-medium">
                <Tag className="w-3.5 h-3.5 text-[#d4a373]/60" />
                {category}
              </div>
            )}
                {dueDate && (
              <div className="flex items-center gap-2 text-[11px] text-[#d4a373] font-bold">
                <Clock className="w-3.5 h-3.5" />
                {format(parseISO(dueDate), "eee, MMM d, HH:mm")}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "addEvent") {
    const { title, startTime, location } = toolCall.args as { 
      title: string; 
      startTime: string; 
      location?: string;
    };
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 p-5 rounded-3xl bg-[#8b5cf6]/5 border border-[#8b5cf6]/10 space-y-4 shadow-xl shadow-black/20"
      >
        <div className="flex items-center gap-2.5 text-[#8b5cf6]">
          <div className="p-1.5 rounded-lg bg-[#8b5cf6]/10">
            <CalendarDays className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Event Scheduled</span>
        </div>
        <div className="space-y-3">
          <p className="text-[15px] text-[#f2efeb] font-semibold leading-relaxed">{title}</p>
          <div className="flex flex-wrap gap-4 pt-1">
            <div className="flex items-center gap-2 text-[11px] text-[#8b5cf6] font-bold">
              <Clock className="w-3.5 h-3.5" />
              {(() => {
                // Hyper-robust local parsing for the UI card
                const s = startTime;
                const match = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
                if (match) {
                  const [, y, m, d, h, min] = match;
                  return format(new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)), "eee, MMM d, HH:mm");
                }
                return format(parseISO(s), "eee, MMM d, HH:mm");
              })()}
              <span className="text-[9px] opacity-40 font-black ml-1 uppercase tracking-tighter">
                {new Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ")}
              </span>
            </div>
            {location && (
              <div className="flex items-center gap-2 text-[11px] text-[#a8a29e] font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#8b5cf6]/60" />
                {location}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (toolCall.name === "searchWeb" || toolCall.name === "multiSearch") {
    const isMulti = toolCall.name === "multiSearch";
    const query = !isMulti ? (toolCall.args as { query: string }).query : undefined;
    const count = isMulti ? (toolCall.args as { count: number }).count : 1;
    
    return (
      <div className="mt-2 flex items-center gap-2.5 py-1.5 px-3 rounded-full bg-[#3b82f6]/[0.03] border border-[#3b82f6]/10 w-fit">
        <Search className="w-3 h-3 text-[#3b82f6]/60" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#3b82f6]/80 whitespace-nowrap">
          {isMulti ? `${count} Research Queries` : "Researching"}
        </span>
        {query && (
          <>
            <div className="w-[1px] h-2 bg-[#3b82f6]/20" />
            <span className="text-[9px] text-[#a8a29e]/60 truncate max-w-[150px] font-medium">&quot;{query}&quot;</span>
          </>
        )}
      </div>
    );
  }

  if (toolCall.name === "updateMemory") {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-3 flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10 shadow-sm"
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/10">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <span className="text-[11px] text-[#a8a29e] font-medium italic">
          Dialogue learned something new about you.
        </span>
      </motion.div>
    );
  }

  return null;
}

export function Chat({ 
  activeSessionId, 
  setActiveSessionId,
  activeWorkspaceId,
  setActiveWorkspaceId,
  showHistory,
  setShowHistory,
  onSyncRef,
  isLargeViewport,
  keyboardOffset
}: { 
  activeSessionId: Id<"chatSessions"> | null, 
  setActiveSessionId: (id: Id<"chatSessions"> | null) => void,
  activeWorkspaceId: Id<"workspaces"> | undefined,
  setActiveWorkspaceId: (id: Id<"workspaces"> | undefined, sessionId?: Id<"chatSessions"> | null) => void,
  showHistory: boolean,
  setShowHistory: (show: boolean) => void,
  onSyncRef?: React.MutableRefObject<(() => void) | null>,
  isLargeViewport: boolean,
  keyboardOffset: number
}) {
  const workspaces = useQuery(api.workspaces.list);
  const sessions = useQuery(api.messages.listSessions, { workspaceId: activeWorkspaceId });
  const messages = useQuery(api.messages.list, { sessionId: activeSessionId ?? undefined });
  
  const createWorkspace = useMutation(api.workspaces.create);
  const sendMessage = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const createSession = useMutation(api.messages.createSession);
  const deleteSession = useMutation(api.messages.deleteSession);
  const renameSession = useMutation(api.messages.renameSession);
  const updateWorkspaceContext = useMutation(api.workspaces.updateContext);
  
  // Tool Mutations for local LLM
  const addTask = useMutation(api.ai.addTask);
  const addEvent = useMutation(api.events.add);
  const updateEvent = useMutation(api.events.update);
  const deleteEvent = useMutation(api.events.remove);
  const completeTask = useMutation(api.tasks.toggleCompleted);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateMemory = useMutation(api.ai.updateProfile);

  const convex = useConvex();

  const [input, setInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isEditingWorkspaceContext, setIsEditingWorkspaceContext] = useState(false);
  const [tempContext, setTempContext] = useState("");
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{ id: Id<"chatSessions">; title: string } | null>(null);
  
  // Settings / Provider State
  const [showSettings, setShowSettings] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ [name: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newPreviews: { [name: string]: string } = {};
    const cleanupUrls: string[] = [];

    selectedFiles.forEach(file => {
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        newPreviews[file.name] = url;
        cleanupUrls.push(url);
      }
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviews(newPreviews);
    return () => cleanupUrls.forEach(url => URL.revokeObjectURL(url));
  }, [selectedFiles]);
  const profile = useQuery(api.ai.getProfile);
  const [provider, setProvider] = useState<"gemini" | "lmstudio">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dialogue_provider") as "gemini" | "lmstudio") || "gemini";
    }
    return "gemini";
  });
  
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollBottom(!isAtBottom);
  };

  const [lastSyncedProfileId, setLastSyncedProfileId] = useState<Id<"userProfile"> | null>(null);

  // Sync provider with DB profile during render
  if (profile && profile._id !== lastSyncedProfileId) {
    setLastSyncedProfileId(profile._id);
    if (profile.preferences?.provider && profile.preferences.provider !== provider) {
      setProvider(profile.preferences.provider);
    }
  }

  const handleProviderChange = (p: "gemini" | "lmstudio") => {
    setProvider(p);
    localStorage.setItem("dialogue_provider", p);
  };
  
  useEffect(() => {
    if (sessions && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0]._id);
    }
  }, [sessions, activeSessionId, setActiveSessionId]);



  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, showScrollBottom]);

  // ---- Shared helper: run LM Studio logic for a given session + text ----
  const runLocalLLMForSession = async (
    sessionId: Id<"chatSessions">,
    userText: string,
    opts?: { brief?: boolean }
  ) => {
    try {
      const promptCtx = await convex.query(api.ai.getPromptContext, {
        sessionId,
        timezoneOffset: new Date().getTimezoneOffset(),
        ...(opts?.brief !== undefined ? { brief: opts.brief } : {}),
      });

      const recentMsgs = (messages || []).slice(-10);

      const result = await processLocalLLMRequest({
        systemInstruction: promptCtx.systemInstruction,
        recentMessages: recentMsgs,
        userText,
      });

      if (result.toolCall) {
        const { name, args } = result.toolCall;
        
        const parseLocal = (s: string) => {
          const match = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
          if (match) {
            const [, y, m, d, h, min] = match;
            return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)).getTime();
          }
          return new Date(s).getTime();
        };

        if (name === "addTask" || name === "updateTask") {
          if (name === "addTask") {
            await addTask({ 
              ...args, 
              dueDate: args.dueDate ? parseLocal(args.dueDate as string) : undefined,
              workspaceId: promptCtx.workspaceId 
            });
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const taskUpdates: Record<string, any> = {};
            if (args.text) taskUpdates.text = args.text;
            if (args.completed !== undefined) taskUpdates.completed = args.completed;
            if (args.priority) taskUpdates.priority = args.priority;
            if (args.category) taskUpdates.category = args.category;
            if (args.notes) taskUpdates.notes = args.notes;
            if (args.dueDate) taskUpdates.dueDate = parseLocal(args.dueDate as string);

            await updateTask({
              id: args.taskId as Id<"tasks">,
              ...taskUpdates
            });
          }
        }
        else if (name === "addEvent" || name === "updateEvent") {
          // Explicitly parse the ISO string to avoid any UTC fallback
          // This ensures that "11:50" from the AI is ALWAYS 11:50 in the user's local time

          if (name === "addEvent") {
            const startTime = parseLocal(args.startTime as string);
            const endTime = parseLocal(args.endTime as string);
            
            await addEvent({ 
              ...args, 
              startTime, 
              endTime, 
              workspaceId: promptCtx.workspaceId 
            });
          } else {
            const updates: Record<string, string | number> = {};
            if (args.title) updates.title = args.title;
            if (args.location) updates.location = args.location;
            if (args.notes) updates.notes = args.notes;
            if (args.startTime) updates.startTime = parseLocal(args.startTime as string);
            if (args.endTime) updates.endTime = parseLocal(args.endTime as string);

            await updateEvent({
              id: args.eventId as Id<"events">,
              ...updates
            });
          }
        }
        else if (name === "deleteEvent") {
          await deleteEvent({ id: args.eventId as Id<"events"> });
        }
        else if (name === "completeTask") await completeTask({ id: args.taskId as Id<"tasks"> });
        else if (name === "deleteTask") await deleteTask({ id: args.taskId as Id<"tasks"> });
        else if (name === "updateMemory") await updateMemory({ bio: args.bio as string });
      }

      await sendMessage({
        sessionId,
        text: result.aiText || "Done!",
        author: "AI",
        toolCall: result.toolCall
          ? { name: result.toolCall.name, args: result.toolCall.args, result: { status: "success" } }
          : undefined,
      });
    } catch (error) {
      console.error("LM Studio Error:", error);
      await sendMessage({
        sessionId,
        text: "I encountered a connection error. Please make sure LM Studio's Local Server is running on port 1234.",
        author: "AI",
      });
    }
  };

  // ---- Sync handler (used by both the sidebar button and TaskPanel) ----
  const handleSync = async () => {
    const syncText = "Sync my workspace.";
    let sessionId = activeSessionId;

    if (!sessionId) {
      sessionId = await createSession({
        title: `Sync - ${new Date().toLocaleDateString()}`,
        workspaceId: activeWorkspaceId,
      });
      setActiveSessionId(sessionId);
    }

    await sendMessage({
      sessionId,
      text: syncText,
      author: "User",
      brief: true,
      timezoneOffset: new Date().getTimezoneOffset(),
      provider,
    });

    if (provider === "lmstudio") {
      await runLocalLLMForSession(sessionId, syncText, { brief: true });
    }
    // Gemini path: the Convex scheduler handles it automatically via messages.send
  };

  // Expose handleSync to parent via ref (placed after declaration)
  useEffect(() => {
    if (onSyncRef) onSyncRef.current = handleSync;
  });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || !activeSessionId || isUploading) return;

    const userText = input.trim();
    const currentFiles = [...selectedFiles];
    setInput("");
    setSelectedFiles([]);
    setIsUploading(true);

    try {
      // Parallel uploads
      const uploadPromises = currentFiles.map(async (file) => {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();
        return {
          storageId,
          fileName: file.name,
          fileType: file.type,
        };
      });

      const uploadedAttachments = await Promise.all(uploadPromises);

      await sendMessage({
        sessionId: activeSessionId,
        text: userText || (uploadedAttachments.length > 0 ? `Attached ${uploadedAttachments.length} files` : ""),
        author: "User",
        timezoneOffset: new Date().getTimezoneOffset(),
        provider,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      });

      if (provider === "lmstudio") {
        await runLocalLLMForSession(activeSessionId, userText);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleNewChat = async () => {
    const id = await createSession({ 
      title: `Chat ${new Date().toLocaleTimeString()}`,
      workspaceId: activeWorkspaceId
    });
    setActiveSessionId(id);
  };

  const handleAddWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    const colors = ["#d4a373", "#8b5cf6", "#ec4899", "#10b981", "#3b82f6"];
    const index = (workspaces?.length || 0) % colors.length;
    
    await createWorkspace({
      name: newWorkspaceName.trim(),
      icon: "Briefcase",
      color: colors[index]
    });

    setNewWorkspaceName("");
    setIsCreatingWorkspace(false);
  };

  const handleUpdateWorkspaceContext = async () => {
    if (activeWorkspaceId) {
      await updateWorkspaceContext({ 
        id: activeWorkspaceId, 
        context: tempContext 
      });
      setIsEditingWorkspaceContext(false);
    }
  };

  const currentWorkspace = workspaces?.find(w => w._id === activeWorkspaceId);

  const handleDeleteChat = async (id: Id<"chatSessions">, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions?.find(s => s._id === id);
    if (session) {
      setConfirmDeleteSession({ id, title: session.title || "Untitled Session" });
    }
  };

  const executeDeleteChat = async (id: Id<"chatSessions">) => {
    await deleteSession({ id });
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
    setConfirmDeleteSession(null);
  };

  const startEditing = (id: Id<"chatSessions">, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setEditTitle(title);
  };

  const handleRename = async (id: Id<"chatSessions">) => {
    if (editTitle.trim()) {
      await renameSession({ id, title: editTitle.trim() });
    }
    setEditingSessionId(null);
  };

  return (
    <div className="flex-1 flex overflow-hidden h-full relative">
      {/* Workspace Rail (The Focus) - Hidden on Mobile */}
      <nav className="hidden lg:flex w-[84px] h-full shrink-0 border-r border-[#2a2723] bg-gradient-to-b from-[#141210] to-[#0f0e0c] flex-col items-center py-8 gap-8 z-50 relative">
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
                onClick={() => setShowHistory(true)}
                className="p-2 rounded-r-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] transition-all shadow-black/50 shadow-lg group flex items-center justify-center border-l-0"
                title="Show History"
              >
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="w-12 h-12 rounded-[20px] bg-gradient-to-br from-[#d4a373] to-[#c39262] flex items-center justify-center shadow-xl shadow-[#d4a373]/20 shrink-0 group transition-all cursor-pointer hover:scale-110 active:scale-95">
          <Bot className="w-6 h-6 text-[#0f0e0c]" />
        </div>
        
        <div className="w-10 h-[1px] bg-[#2a2723]/50" />
        
        <div className="flex-1 w-full flex flex-col items-center gap-5 overflow-y-auto overflow-x-hidden custom-scrollbar py-6">
          {/* Global / All Workspace */}
          <div className="w-full relative group flex items-center justify-center">
            <button
              onClick={() => setActiveWorkspaceId(undefined)}
              className={`w-12 h-12 rounded-[20px] flex items-center justify-center transition-all duration-300 border relative overflow-hidden group/btn ${
                !activeWorkspaceId 
                  ? "bg-[#d4a373] border-[#d4a373] shadow-[0_0_20px_rgba(212,163,115,0.3)] scale-110" 
                  : "bg-[#1a1814] border-[#2a2723] text-[#a8a29e] hover:border-[#d4a373]/30 hover:text-[#f2efeb] hover:scale-105"
              }`}
            >
              <Sparkles className={`w-5 h-5 transition-transform duration-300 ${!activeWorkspaceId ? "text-[#0f0e0c] scale-110" : "group-hover/btn:rotate-12"}`} />
              {!activeWorkspaceId && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-white"
                />
              )}
            </button>
            {!activeWorkspaceId && (
              <motion.div 
                layoutId="active-ws"
                className="absolute left-0 w-1.5 h-8 bg-[#d4a373] rounded-r-full shadow-[2px_0_10px_rgba(212,163,115,0.5)] z-20"
              />
            )}
            <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 z-[100] whitespace-nowrap shadow-2xl">
              All Workspaces
            </div>
          </div>

          {workspaces?.map((ws) => (
            <div key={ws._id} className="w-full relative group flex items-center justify-center">
              <button
                onClick={() => setActiveWorkspaceId(ws._id)}
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
              <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 z-[100] whitespace-nowrap shadow-2xl">
                {ws.name}
              </div>
            </div>
          ))}

          <div className="relative group mt-2">
            <button
              onClick={() => setIsCreatingWorkspace(true)}
              className="w-12 h-12 rounded-[20px] bg-[#1a1814]/40 border border-dashed border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:border-[#d4a373]/40 hover:text-[#d4a373] hover:bg-[#d4a373]/5 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
            <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 z-[100] whitespace-nowrap shadow-2xl">
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
            <div className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[10px] font-bold uppercase tracking-widest text-[#f2efeb] opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 z-[100] whitespace-nowrap shadow-2xl">
              Settings
            </div>
          </Link>
        </div>
      </nav>

      {/* Sessions Sidebar */}
      <AnimatePresence mode="wait">
        {showHistory && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "288px", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="h-full border-r border-[#2a2723] bg-[#1a1814] shrink-0 z-[100] lg:relative fixed left-0 w-[85%] sm:w-[288px] flex overflow-hidden"
          >
            {/* Mobile Workspace Rail (Inside the Drawer) */}
            <div className="lg:hidden w-[72px] h-full bg-[#141210] border-r border-[#2a2723] flex flex-col items-center pt-10 pb-6 gap-6 shrink-0">
              <button 
                onClick={() => setActiveWorkspaceId(undefined)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${!activeWorkspaceId ? 'bg-[#d4a373] shadow-lg shadow-[#d4a373]/20' : 'bg-[#0f0e0c] border border-[#2a2723] text-[#a8a29e]'}`}
              >
                <Bot className={`w-5 h-5 ${!activeWorkspaceId ? 'text-[#0f0e0c]' : ''}`} />
              </button>
              
              <div className="w-8 h-[1px] bg-[#2a2723]" />
              
              <div className="flex-1 flex flex-col items-center gap-4 overflow-y-auto scrollbar-hide w-full px-2 pt-4">
                {workspaces?.map((ws) => (
                  <button
                    key={ws._id}
                    onClick={() => setActiveWorkspaceId(ws._id)}
                    className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-all ${activeWorkspaceId === ws._id ? 'ring-2 ring-[#d4a373] ring-offset-2 ring-offset-[#141210]' : 'bg-[#0f0e0c] border border-[#2a2723]'}`}
                  >
                    <span className="text-lg">{ws.icon && ws.icon.length < 3 ? ws.icon : ws.name[0]}</span>
                  </button>
                ))}
                
                {/* Add Workspace Button for Mobile */}
                <button
                  onClick={() => setIsCreatingWorkspace(true)}
                  className="w-10 h-10 rounded-xl bg-[#1a1814]/40 border border-dashed border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:border-[#d4a373]/40 hover:text-[#d4a373] transition-all shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Settings Access */}
              <Link
                href="/settings"
                className="w-10 h-10 rounded-xl bg-[#0f0e0c] border border-[#2a2723] flex items-center justify-center text-[#a8a29e] hover:text-[#d4a373] transition-all"
              >
                <Settings className="w-5 h-5" />
              </Link>
            </div>

            {/* History List */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1a1814] relative">
              <button
                onClick={() => setShowHistory(false)}
                className="absolute left-full top-1/2 -translate-y-1/2 z-[110] w-7 h-16 rounded-r-2xl bg-[#d4a373] text-[#0f0e0c] flex items-center justify-center transition-all shadow-[10px_0_30px_rgba(0,0,0,0.4)] lg:hidden active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <header className="p-4 lg:p-6 shrink-0 space-y-4 lg:space-y-6">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#d4a373]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2efeb]">
                      {activeWorkspaceId 
                        ? workspaces?.find(w => w._id === activeWorkspaceId)?.name 
                        : "Universal Chat"}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="hidden lg:flex p-1.5 rounded-lg text-[#a8a29e] hover:text-[#f2efeb] hover:bg-[#2a2723] transition-all"
                    title="Hide History"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <button 
                  onClick={handleNewChat}
                  className="w-full flex items-center justify-center gap-2.5 py-3 lg:py-3.5 rounded-2xl bg-[#d4a373] hover:bg-[#c39262] text-[#0f0e0c] text-sm font-bold transition-all duration-300 shadow-lg shadow-[#d4a373]/10"
                >
                  <Plus className="w-4 h-4" />
                  New Session
                </button>
              </header>

            
            <style>{`
              .custom-scrollbar::-webkit-scrollbar { width: 4px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: #1a1814; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2723; border-radius: 2px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4a373; }
            `}</style>
            <div className="flex-1 overflow-y-auto px-3 py-2 lg:py-4 space-y-0.5 lg:space-y-1 custom-scrollbar">
              <div className="px-3 mb-2 sticky top-0 bg-[#1a1814] py-2 z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e]/50">History</span>
              </div>
              {sessions?.map((session) => (
                <div
                  key={session._id}
                  onClick={() => {
                    if (!activeWorkspaceId && session.workspaceId) {
                      setActiveWorkspaceId(session.workspaceId, session._id);
                    } else {
                      setActiveSessionId(session._id);
                    }
                  }}
                  className={`group flex items-center justify-between p-2.5 lg:p-3.5 rounded-2xl cursor-pointer transition-all duration-300 ${
                    activeSessionId === session._id 
                      ? "bg-[#2a2723] text-[#f2efeb]" 
                      : "text-[#a8a29e] hover:bg-[#1f1d19] hover:text-[#f2efeb]"
                  }`}
                >
                  <div className="flex-1 flex items-center gap-3 truncate mr-2">
                    <div className={`w-1.5 h-1.5 rounded-full transition-all shrink-0 ${activeSessionId === session._id ? "bg-[#d4a373] scale-100" : "bg-transparent scale-0"}`} />
                    {editingSessionId === session._id ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(session._id)}
                        onBlur={() => handleRename(session._id)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-none outline-none text-sm font-medium w-full text-[#f2efeb]"
                      />
                    ) : (
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">{session.title}</span>

                        {!activeWorkspaceId && session.workspaceId && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div 
                              className="w-1 h-1 rounded-full" 
                              style={{ backgroundColor: workspaces?.find(w => w._id === session.workspaceId)?.color }} 
                            />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#a8a29e]/60 truncate">
                              {workspaces?.find(w => w._id === session.workspaceId)?.name}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                    {editingSessionId !== session._id && (
                      <>
                        <button 
                          onClick={(e) => startEditing(session._id, session.title || "", e)}
                          className="p-1 hover:text-[#d4a373] transition-all mr-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteChat(session._id, e)}
                          className="p-1 hover:text-red-400 transition-all shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {editingSessionId === session._id && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRename(session._id); }}
                        className="p-1 text-[#d4a373] transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>


      {/* Main Chat Area */}
      <motion.div 
        className="flex-1 flex flex-col h-full min-w-0 relative bg-[#0f0e0c]"
      >
        {/* Floating Toggle for History (when collapsed) */}
        
        <header className="absolute top-0 left-0 right-0 px-4 lg:px-8 py-3 lg:py-4 flex flex-col gap-4 bg-[#0f0e0c]/80 backdrop-blur-xl z-30 border-b border-[#2a2723]/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 lg:gap-4">
              {/* Mobile Navigation Toggles */}
              <div className="lg:hidden flex items-center gap-1.5">
                <button 
                  onClick={() => setShowHistory(true)}
                  className="p-2 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] active:scale-90 transition-all"
                  title="Menu"
                >
                  <Menu className="w-4 h-4" />
                </button>
                
                {/* Mobile Active Workspace Indicator (Non-interactive indicator in header) */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#1a1814]/50 border border-[#2a2723]/50">
                  <div 
                    className="w-1.5 h-1.5 rounded-full" 
                    style={{ backgroundColor: activeWorkspaceId ? workspaces?.find(w => w._id === activeWorkspaceId)?.color : "#d4a373" }} 
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e] max-w-[60px] truncate">
                    {activeWorkspaceId ? workspaces?.find(w => w._id === activeWorkspaceId)?.name : "Universal"}
                  </span>
                </div>
              </div>

              <div className="hidden lg:block space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-[#f2efeb] tracking-tight truncate max-w-[200px] lg:max-w-md">
                    {activeSessionId ? sessions?.find(s => s._id === activeSessionId)?.title : "New Session"}
                  </h1>
                  
                  {/* Settings / Provider Toggle */}
                  <div className="relative ml-2">
                    <button 
                      onClick={() => setShowSettings(!showSettings)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#d4a373] hover:border-[#d4a373]/40 transition-all shadow-lg shadow-black/20 group"
                      title="Change AI Provider"
                    >
                      {provider === "gemini" ? <Zap className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e] group-hover:text-[#d4a373] transition-colors">
                        {provider === "gemini" ? "Gemini" : "Local"}
                      </span>
                    </button>
                    
                    <AnimatePresence>
                      {showSettings && (
                        <>
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSettings(false)}
                            className="fixed inset-0 bg-[#000]/60 backdrop-blur-sm z-[60]"
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute top-full left-0 mt-3 w-[250px] bg-[#1a1814] border border-[#2a2723] rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[70] space-y-4"
                          >
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-[#f2efeb]">AI Provider</h3>
                                <p className="text-[10px] text-[#a8a29e]">Select your model engine.</p>
                              </div>
                              <button 
                                onClick={() => setShowSettings(false)}
                                className="p-1.5 hover:bg-[#2a2723] rounded-lg text-[#a8a29e] transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            <div className="space-y-2">
                              <button
                                onClick={() => handleProviderChange("gemini")}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                                  provider === "gemini" 
                                    ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]" 
                                    : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:border-[#3a3733]"
                                }`}
                              >
                                <span className="text-xs font-bold">Google Gemini</span>
                                {provider === "gemini" && <Check className="w-3.5 h-3.5" />}
                              </button>
                              
                              <button
                                onClick={() => handleProviderChange("lmstudio")}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                                  provider === "lmstudio" 
                                    ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]" 
                                    : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:border-[#3a3733]"
                                }`}
                              >
                                <span className="text-xs font-bold">Local LLM (LM Studio)</span>
                                {provider === "lmstudio" && <Check className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {currentWorkspace && (
                    <div className="flex items-center gap-2">
                      <div 
                        className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter border"
                        style={{ 
                          backgroundColor: `${currentWorkspace.color}15`, 
                          borderColor: `${currentWorkspace.color}40`,
                          color: currentWorkspace.color
                        }}
                      >
                        {currentWorkspace.name}
                      </div>

                      <div className="relative">
                        <button 
                          onClick={() => {
                            setTempContext(currentWorkspace.context || "");
                            setIsEditingWorkspaceContext(true);
                          }}
                          className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 group/tag ${
                            currentWorkspace.context 
                              ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]" 
                              : "bg-[#1a1814] border-[#2a2723] text-[#a8a29e] hover:border-[#d4a373]/30 hover:text-[#d4a373]"
                          }`}
                        >
                          <Tag className="w-3 h-3" />
                          <span className="text-[9px] font-bold uppercase tracking-widest hidden group-hover/tag:inline-block">
                            {currentWorkspace.context ? "Edit Context" : "Add Context"}
                          </span>
                        </button>

                        <AnimatePresence>
                          {isEditingWorkspaceContext && (
                            <>
                              <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsEditingWorkspaceContext(false)}
                                className="fixed inset-0 bg-[#000]/60 backdrop-blur-sm z-[60]"
                              />
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-full left-0 mt-3 w-[400px] bg-[#1a1814] border border-[#d4a373]/30 rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[70] space-y-4"
                              >
                                <div className="space-y-1">
                                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#d4a373]">Workspace Context</h3>
                                  <p className="text-[10px] text-[#a8a29e]">Define the goals and rules for the AI agent in this workspace.</p>
                                </div>
                                <textarea
                                  autoFocus
                                  value={tempContext}
                                  onChange={(e) => setTempContext(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleUpdateWorkspaceContext();
                                    }
                                  }}
                                  placeholder="Type instructions here..."
                                  className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-xl p-4 text-xs text-[#f2efeb] placeholder:text-[#a8a29e]/20 min-h-[160px] resize-none outline-none focus:border-[#d4a373]/40 transition-all scrollbar-hide"
                                />
                                <div className="flex items-center justify-end gap-3 pt-2">
                                  <button 
                                    onClick={() => setIsEditingWorkspaceContext(false)}
                                    className="px-4 py-2 text-[10px] font-bold text-[#a8a29e] hover:text-[#f2efeb] uppercase tracking-widest"
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    onClick={handleUpdateWorkspaceContext}
                                    className="px-5 py-2 bg-[#d4a373] text-[#0f0e0c] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-lg shadow-[#d4a373]/10"
                                  >
                                    Save Instructions
                                  </button>
                                </div>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[#a8a29e] text-[11px] font-medium">
                  <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-[#d4a373]" /> Dialogue Agent</span>
                  <span>•</span>
                  <span>{messages?.length || 0} messages</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1814] border border-[#2a2723]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>

        </header>
        
        {/* Mobile Session Title */}
        <div className="lg:hidden px-6 py-1.5 border-b border-[#2a2723]/30 bg-[#12110e]">
          <h1 className="text-xs font-bold text-[#a8a29e] uppercase tracking-[0.2em] truncate">
            {activeSessionId ? sessions?.find(s => s._id === activeSessionId)?.title : "New Session"}
          </h1>
        </div>

        <main 
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto px-4 lg:px-8 pt-24 lg:pt-32 pb-4 lg:pb-10 space-y-6 lg:space-y-12"
        >
          {/* Premium Centered Scroll Down Button (Gemini Style) */}
          <AnimatePresence>
            {showScrollBottom && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8, y: 10, x: "-50%" }}
                animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, scale: 0.8, y: 10, x: "-50%" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={scrollToBottom}
                className="fixed bottom-28 lg:bottom-32 left-1/2 z-40 p-2.5 rounded-full bg-[#1a1814]/80 backdrop-blur-md border border-[#2a2723] text-[#d4a373] shadow-xl shadow-black/40 hover:bg-[#2a2723] transition-all"
                title="Scroll to Bottom"
              >
                <ArrowDown className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>

          <div className="max-w-4xl mx-auto space-y-6 lg:space-y-12">
            {messages === undefined || !activeSessionId ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in zoom-in duration-700">
                <div className="relative group">
                  <div className="absolute inset-0 bg-[#d4a373]/20 blur-3xl rounded-full group-hover:bg-[#d4a373]/30 transition-all duration-500" />
                  <div className="relative w-24 h-24 rounded-[32px] bg-[#1a1814] border border-[#d4a373]/20 flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] group-hover:border-[#d4a373]/40 transition-all duration-500">
                    <Bot className="w-10 h-10 text-[#d4a373]" />
                  </div>
                </div>
                
                <div className="text-center space-y-3">
                  <h3 className="text-2xl font-bold text-[#f2efeb] tracking-tight">Dialogue Initialized</h3>
                  <p className="text-sm text-[#a8a29e] max-w-[280px] leading-relaxed mx-auto">
                    Select a session from the history or start a fresh conversation to begin.
                  </p>
                </div>

                <button
                  onClick={handleNewChat}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#d4a373] text-[#0f0e0c] font-bold text-sm uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-xl shadow-[#d4a373]/10 hover:shadow-[#d4a373]/20 hover:-translate-y-1 active:translate-y-0"
                >
                  <Plus className="w-4 h-4" />
                  Start New Chat
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-sm mx-auto">
                <div className="w-16 h-16 rounded-3xl bg-[#1a1814] border border-[#2a2723] flex items-center justify-center shadow-2xl">
                  <Bot className="w-8 h-8 text-[#d4a373]/40" />
                </div>
                <div className="space-y-2">
                  <p className="text-[#f2efeb] font-medium italic">&quot;The best way to predict the future is to create it.&quot;</p>
                  <p className="text-[#a8a29e] text-xs leading-relaxed">Dialogue is ready to help you manage your tasks and thoughts with clarity.</p>
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {[...messages].map((msg) => (
                  <div key={msg._id}>
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className={`flex gap-3 lg:gap-5 ${msg.author === "User" ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`w-8 h-8 lg:w-9 lg:h-9 rounded-xl lg:rounded-2xl flex-shrink-0 flex items-center justify-center shadow-sm ${
                        msg.author === "User" 
                          ? "bg-[#1f1d19] border border-[#2a2723]" 
                          : "bg-[#d4a373] shadow-lg shadow-[#d4a373]/10"
                      }`}>
                        {msg.author === "User" 
                          ? <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#a8a29e]" /> 
                          : <Bot className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#0f0e0c]" />
                        }
                      </div>
                      <div className={`flex flex-col space-y-2 min-w-0 max-w-[90%] lg:max-w-[85%] ${msg.author === "User" ? "items-end ml-auto" : "mr-auto"}`}>
                        <div className={`px-4 lg:px-5 py-2 lg:py-4 rounded-2xl lg:rounded-3xl min-w-0 ${
                          msg.author === "User"
                            ? "bg-[#1f1d19] border border-[#2a2723] text-[#f2efeb] rounded-tr-none"
                            : "bg-[#1a1814] border border-[#2a2723] text-[#f2efeb] rounded-tl-none prose prose-invert prose-sm max-w-none w-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                        }`}>
                          {/* Unified Attachment Rendering */}
                           {(() => {
                             const allAtts = [...(msg.attachments || [])];
                             if (msg.storageId && !allAtts.some(a => a.storageId === msg.storageId)) {
                               allAtts.push({
                                 storageId: msg.storageId,
                                 fileName: msg.fileName || "File",
                                 fileType: msg.fileType || "application/octet-stream"
                               });
                             }
                             
                             if (allAtts.length === 0) return null;

                             return (
                               <div className="flex flex-wrap gap-2 mb-3">
                                 {allAtts.map((att, idx) => (
                                   <div key={idx} className="group relative">
                                     {att.fileType?.startsWith("image/") ? (
                                       <div 
                                         onClick={() => window.open(`${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`, "_blank")}
                                         className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-[#d4a373]/20 shadow-lg bg-black/40 hover:border-[#d4a373]/40 transition-all cursor-pointer"
                                       >
                                         {/* eslint-disable-next-line @next/next/no-img-element */}
                                         <img 
                                           src={`${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`} 
                                           alt={att.fileName || "Attached image"} 
                                           className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                         />
                                         <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                           <div className="p-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                                             <ExternalLink className="w-4 h-4 text-white" />
                                           </div>
                                         </div>
                                       </div>
                                     ) : (
                                       <div 
                                         onClick={() => window.open(`${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`, "_blank")}
                                         className={`flex items-center gap-2 p-2 rounded-xl border max-w-[200px] ${
                                         msg.author === "User" 
                                           ? "bg-black/20 border-white/10" 
                                           : "bg-[#0f0e0c] border-[#2a2723]"
                                       } hover:border-[#d4a373]/30 transition-all cursor-pointer`}>
                                         <div className="w-8 h-8 rounded-lg bg-[#1a1814] flex items-center justify-center border border-[#2a2723] shrink-0">
                                           <FileIcon className="w-4 h-4 text-[#d4a373]" />
                                         </div>
                                         <div className="overflow-hidden">
                                           <p className="text-[11px] font-bold text-[#f2efeb] truncate">{att.fileName || "File"}</p>
                                           <p className="text-[9px] text-[#a8a29e] uppercase tracking-widest truncate">{att.fileType?.split("/")[1] || "Document"}</p>
                                         </div>
                                       </div>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             );
                           })()}

                          {msg.author === "User" ? (
                            <p className="text-sm lg:text-[15px] leading-relaxed lg:leading-[1.6] whitespace-pre-wrap">{msg.text}</p>
                          ) : (
                            <div className="text-sm lg:text-[15px] leading-relaxed lg:leading-[1.6] markdown-content">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                                  ul: ({ children }) => <ul className="list-disc pl-4 mb-4 space-y-1">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-4 space-y-1">{children}</ol>,
                                  li: ({ children }) => <li className="text-[#a8a29e]">{children}</li>,
                                  strong: ({ children }) => <strong className="text-[#d4a373] font-bold">{children}</strong>,
                                  pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => {
                                    return (
                                      <div className="relative my-6 group/code min-w-0">
                                        {children}
                                      </div>
                                    );
                                  },
                                  code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
                                    const match = /language-(\w+)/.exec(className || "");
                                    const isInline = !className;
                                    
                                    if (isInline) {
                                      return (
                                        <code className="bg-[#0f0e0c] px-1.5 py-0.5 rounded text-[#d4a373] font-mono text-[13px]" {...props}>
                                          {children}
                                        </code>
                                      );
                                    }

                                    const language = match ? match[1] : "text";
                                    const codeString = String(children).replace(/\n$/, "");

                                    return (
                                      <div className="relative">
                                        <div className="absolute top-0 right-4 -translate-y-1/2 flex items-center gap-2 z-10">
                                          {language && (
                                            <div className="px-2.5 py-1 rounded-lg bg-[#1a1814] border border-[#d4a373]/20 text-[9px] font-black uppercase tracking-[0.2em] text-[#d4a373] shadow-xl">
                                              {language}
                                            </div>
                                          )}
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(codeString);
                                              setCopiedCode(codeString);
                                              setTimeout(() => setCopiedCode(null), 2000);
                                            }}
                                            className="p-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all shadow-xl"
                                            title="Copy Code"
                                          >
                                            {copiedCode === codeString ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                          </button>
                                        </div>
                                        <SyntaxHighlighter
                                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                          style={vscDarkPlus as any}
                                          language={language}
                                          PreTag="div"
                                          customStyle={{
                                            margin: 0,
                                            padding: "1.25rem",
                                            background: "#0f0e0c",
                                            borderRadius: "1.5rem",
                                            border: "1px solid #2a2723",
                                            fontSize: "0.85rem",
                                            lineHeight: "1.6",
                                            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)"
                                          }}
                                          codeTagProps={{
                                            style: {
                                              fontFamily: "inherit",
                                              background: "transparent"
                                            }
                                          }}
                                          {...props}
                                        >
                                          {codeString}
                                        </SyntaxHighlighter>
                                      </div>
                                    );
                                  },
                                  table: ({ children }) => (
                                    <div className="overflow-x-auto mb-6">
                                      <table className="w-full text-sm border-collapse">{children}</table>
                                    </div>
                                  ),
                                  thead: ({ children }) => <thead className="border-b border-[#2a2723]">{children}</thead>,
                                  tbody: ({ children }) => <tbody className="divide-y divide-[#2a2723]">{children}</tbody>,
                                  tr: ({ children }) => <tr className="hover:bg-[#1f1d19]/50 transition-colors">{children}</tr>,
                                  th: ({ children }) => <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-[#d4a373]">{children}</th>,
                                  td: ({ children }) => <td className="px-3 py-2 text-[#a8a29e]">{children}</td>,
                                }}
                              >
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          )}
                          {msg.author === "AI" && msg.toolCall && (
                            <ToolCard toolCall={msg.toolCall as ToolCall} />
                          )}
                        </div>
                        <span className="text-[9px] text-[#a8a29e]/60 font-bold tracking-widest uppercase px-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </motion.div>
                  </div>
                ))}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>
        <motion.footer 
          animate={{ 
            bottom: isLargeViewport ? 0 : keyboardOffset,
          }}
          initial={false}
          transition={{ duration: 0 }}
          className="absolute left-0 right-0 px-3 py-4 lg:p-8 bg-gradient-to-t from-[#0f0e0c] via-[#0f0e0c]/95 to-transparent z-40"
        >
          {/* Attachment Tray */}
          <AnimatePresence>
            {selectedFiles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.9 }}
                className="flex flex-wrap gap-3 mb-3 lg:mb-4 ml-1 lg:mx-auto lg:max-w-4xl"
              >
                {selectedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="relative group/thumb">
                    <div className="w-16 h-16 lg:w-20 lg:h-20 bg-[#1a1814]/80 backdrop-blur-2xl rounded-2xl border border-[#d4a373]/30 shadow-2xl flex flex-col items-center justify-center overflow-hidden group-hover/thumb:border-[#d4a373]/50 transition-all">
                      {previews[file.name] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img 
                          src={previews[file.name]} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 p-2 text-center">
                          <FileIcon className="w-6 h-6 text-[#d4a373]" />
                          <span className="text-[8px] font-black uppercase tracking-widest text-[#a8a29e] truncate w-full px-1">
                            {file.name.split('.').pop()}
                          </span>
                        </div>
                      )}
                      
                      {/* Delete Overlay */}
                      <button 
                        onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                      >
                        <X className="w-5 h-5 text-white" />
                      </button>
                    </div>
                    
                    {/* Filename Tag (Floating) */}
                    <div className="absolute top-0 left-full ml-3 px-3 py-2 bg-[#1a1814]/90 backdrop-blur-xl rounded-xl border border-[#2a2723] shadow-xl pointer-events-none opacity-0 group-hover/thumb:opacity-100 transition-all -translate-x-2 group-hover/thumb:translate-x-0 hidden lg:block whitespace-nowrap z-[70]">
                      <p className="text-[10px] font-bold text-[#f2efeb]">{file.name}</p>
                      <p className="text-[8px] text-[#a8a29e] uppercase tracking-widest font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSend} className="relative group max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-[#d4a373]/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
            
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setSelectedFiles(prev => [...prev, ...files]);
                e.target.value = ""; // Reset to allow re-uploading the same file
              }}
              className="hidden"
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute left-2 lg:left-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#a8a29e] hover:text-[#d4a373] hover:bg-[#d4a373]/10 transition-all z-10"
              disabled={isUploading || !activeSessionId}
            >
              <PlusCircle className={`w-5 h-5 ${isUploading ? 'animate-spin' : ''}`} />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={!activeSessionId ? "Select a conversation" : isUploading ? "Uploading file..." : "Ask Dialogue..."}
              disabled={!activeSessionId || isUploading}
              className="relative w-full bg-[#1a1814]/90 backdrop-blur-xl border border-[#2a2723] text-[#f2efeb] pl-12 lg:pl-14 pr-12 lg:pr-14 py-4 rounded-[2rem] focus:outline-none focus:border-[#d4a373]/40 focus:ring-1 focus:ring-[#d4a373]/20 transition-all duration-300 placeholder:text-[#a8a29e]/30 text-sm lg:text-[15px] shadow-2xl"
            />
            
            <button
              type="submit"
              disabled={(!input.trim() && selectedFiles.length === 0) || !activeSessionId || isUploading}
              className="absolute right-2 lg:right-2.5 top-1/2 -translate-y-1/2 p-2 lg:p-2.5 rounded-lg lg:rounded-xl bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] transition-all shadow-xl shadow-[#d4a373]/10 disabled:opacity-0 disabled:scale-90 z-10"
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              )}
            </button>
          </form>
          <p className="mt-2 text-center text-[8px] lg:text-[9px] text-[#a8a29e]/20 uppercase tracking-[0.4em] font-bold">Dialogue Interface v1.0.4</p>
        </motion.footer>
      </motion.div>

      {/* Global Workspace Creation Modal */}
      <AnimatePresence>
        {isCreatingWorkspace && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreatingWorkspace(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-[400px] bg-[#1a1814] border border-[#d4a373]/30 rounded-[32px] p-8 lg:p-10 shadow-[0_30px_90px_rgba(0,0,0,0.8)] space-y-8 overflow-hidden"
            >
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#d4a373]/10 blur-[80px] rounded-full" />
              
              <div className="space-y-3 relative">
                <div className="w-12 h-12 rounded-2xl bg-[#d4a373]/10 border border-[#d4a373]/20 flex items-center justify-center mb-2">
                  <Plus className="w-6 h-6 text-[#d4a373]" />
                </div>
                <h3 className="text-2xl font-bold text-[#f2efeb] tracking-tight">New Workspace</h3>
                <p className="text-sm text-[#a8a29e] leading-relaxed">Create a focused environment for your projects and ideas.</p>
              </div>

              <form onSubmit={handleAddWorkspace} className="space-y-6 relative">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a8a29e] ml-1">Workspace Name</label>
                  <input
                    autoFocus
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="e.g. Creative Lab, Work, Studies..."
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-2xl px-6 py-4 text-sm text-[#f2efeb] focus:border-[#d4a373]/50 focus:ring-1 focus:ring-[#d4a373]/30 outline-none transition-all placeholder:text-[#2a2723]"
                  />
                </div>
                
                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsCreatingWorkspace(false)}
                    className="flex-1 py-4 rounded-2xl border border-[#2a2723] text-xs font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#f2efeb] hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!newWorkspaceName.trim()}
                    className="flex-1 py-4 rounded-2xl bg-[#d4a373] text-[#0f0e0c] text-xs font-bold uppercase tracking-widest hover:bg-[#c39262] transition-all shadow-xl shadow-[#d4a373]/20 disabled:opacity-50 disabled:grayscale"
                  >
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Confirmation Modal for Session Deletion */}
      <AnimatePresence>
        {confirmDeleteSession && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0f0e0c]/80 backdrop-blur-sm p-6"
            onClick={() => setConfirmDeleteSession(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] bg-[#1a1814] border border-[#d4a373]/20 rounded-2xl p-6 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-[#f2efeb] mb-2 leading-tight">
                Delete Session?
              </h3>
              <p className="text-sm text-[#a8a29e] mb-6 leading-relaxed">
                Are you sure you want to delete <span className="text-[#f2efeb] font-semibold italic">&quot;{confirmDeleteSession.title}&quot;</span>? All messages and context from this session will be lost.
              </p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => executeDeleteChat(confirmDeleteSession.id)}
                  className="w-full py-3 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete Session
                </button>
                <button 
                  onClick={() => setConfirmDeleteSession(null)}
                  className="w-full py-3 bg-transparent text-[#a8a29e] rounded-xl text-xs font-bold uppercase tracking-widest hover:text-[#f2efeb] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
