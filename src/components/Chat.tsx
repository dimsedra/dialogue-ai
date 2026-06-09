"use client";

import {
  getPbClient,
  usePbProfile,
  usePbWorkspacesList,
  usePbSessionsList,
  usePbPersonasList,
  usePbWorkspaceCreate,
  usePbMessageSend,
  usePbSessionCreate,
  usePbSessionDelete,
  usePbTaskCreate,
  usePbEventCreate,
  usePbEventUpdate,
  usePbEventUpdateOccurrence,
  usePbEventDelete,
  usePbTaskToggleCompleted,
  usePbTaskDelete,
  usePbTaskUpdate,
  usePbUpdateProfile,
  usePbMemoryDelete,
  usePbUpdatePreferences,
  usePbHabitCreate,
  usePbHabitLog,
  usePbMessagesPaginated,
  usePaginatedQuery as usePbPaginatedQuery,
  PbId,
  PbWorkspaces,
  PbChatSessions,
  PbAgentPersonas,
  PbTasks,
  PbEvents,
  PbMemories,
  PbReflections,
  PbUserProfile,
} from "@/pb-compat";
import { api } from "@/pb-compat/api";
import { useAuth } from "@/pb-compat/auth";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { EnrichedToolArgs, Scope } from "./chat/types";
import { CreateWorkspaceModal } from "./chat/CreateWorkspaceModal";
import { DeleteSessionModal } from "./chat/DeleteSessionModal";
import { WorkspaceRail } from "./chat/WorkspaceRail";
import { SessionSidebar } from "./chat/SessionSidebar";
import { ChatHeader } from "./chat/ChatHeader";
import { MessageStream } from "./chat/MessageStream";
import { ChatInput } from "./chat/ChatInput";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";


// Heavy modals / dashboard: lazy-load so they don't sit in the initial bundle.
// Dashboard is only mounted on the landing view (no active session).
const Dashboard = dynamic(
  () => import("./chat/Dashboard").then((m) => m.Dashboard),
  { ssr: false, loading: () => null },
);
const ReflectionWrappedModal = dynamic(
  () =>
    import("./chat/ReflectionWrappedModal").then(
      (m) => m.ReflectionWrappedModal,
    ),
  { ssr: false, loading: () => null },
);
// Image export is invoked from a button click — no need to ship the SVG/Canvas
// pipeline in the initial bundle.
const exportReflectionAsImage = async (
  ...args: Parameters<typeof import("../utils/exportReflectionImage").exportReflectionAsImage>
) => {
  const mod = await import("../utils/exportReflectionImage");
  return mod.exportReflectionAsImage(...args);
};
// LM Studio client is only used when the user picks the local provider.
const processLocalLLMRequest = async (
  ...args: Parameters<typeof import("../lib/lmstudio").processLocalLLMRequest>
) => {
  const mod = await import("../lib/lmstudio");
  return mod.processLocalLLMRequest(...args);
};

type AIProvider = string;
type ProviderConfig = { apiKey?: string; baseUrl?: string; modelId?: string };
type ProviderConfigs = Record<string, ProviderConfig>;
type RecurrenceInput = {
  frequency: "daily" | "weekly";
  interval: number;
  daysOfWeek?: number[];
  until?: string;
};
type EventUpdateFields = {
  title?: string;
  location?: string;
  notes?: string;
  outcome?: string;
  statusHook?: string;
  startTime?: number;
  endTime?: number;
  eventType?: "interval" | "point";
  cancelled?: boolean;
  recurrence?: {
    frequency: "daily" | "weekly";
    interval: number;
    daysOfWeek?: number[];
    until?: number;
  };
};

type ChatProps = {
  activeSessionId: string | null;
  setActiveSessionIdAction: (id: string | null) => void;
  activeWorkspaceId: string | undefined;
  setActiveWorkspaceIdAction: (
    id: string | undefined,
    sessionId?: string | null,
  ) => void;
  activeScope: Scope | null;
  setActiveScopeAction: (scope: Scope | null) => void;
  showHistory: boolean;
  setShowHistoryAction: (show: boolean) => void;
  onSyncRef?: React.MutableRefObject<(() => void) | null>;
  isLargeViewport: boolean;
  keyboardOffset: number;
  onChatInputResizeAction?: (offset: number) => void;
  onShowTasksAction?: () => void;
};

function toRecurrenceInput(value: unknown): RecurrenceInput | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<RecurrenceInput>;
  if (
    (candidate.frequency === "daily" || candidate.frequency === "weekly") &&
    typeof candidate.interval === "number"
  ) {
    return {
      frequency: candidate.frequency,
      interval: candidate.interval,
      daysOfWeek: Array.isArray(candidate.daysOfWeek)
        ? candidate.daysOfWeek
        : undefined,
      until: typeof candidate.until === "string" ? candidate.until : undefined,
    };
  }

  return undefined;
}

export function Chat({
  activeSessionId,
  setActiveSessionIdAction,
  activeWorkspaceId,
  setActiveWorkspaceIdAction,
  activeScope,
  setActiveScopeAction,
  showHistory,
  setShowHistoryAction,
  onSyncRef,
  isLargeViewport,
  keyboardOffset,
  onChatInputResizeAction,
  onShowTasksAction,
}: ChatProps) {
  const { signOut } = useAuth();
  const workspaces = usePbWorkspacesList();
  const sessions = usePbSessionsList({ workspaceId: activeWorkspaceId });

  // All sessions across every workspace — used only by the Dashboard landing view
  const allSessions = usePbSessionsList({ allWorkspaces: true });

  const profile = usePbProfile();
  const personas = usePbPersonasList();

  const activeSession = sessions?.find((s) => s._id === activeSessionId);
  const activePersona =
    personas?.find((p) => p._id === activeSession?.agentPersona) ||
    personas?.find((p) => p.isDefault);

  const createWorkspace = usePbWorkspaceCreate();
  const sendMessage = usePbMessageSend();
  const createSession = usePbSessionCreate();
  const deleteSession = usePbSessionDelete();
  const triggerAutoTitle = async ({ sessionId }: { sessionId: string }) => {
    if (!sessionId) return;
    const token = getPbClient().authStore.token;
    if (!token) return;
    void fetch("/api/jobs/generateSessionTitle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ args: { sessionId } }),
    }).catch((err) => {
      console.error("[pbTriggerAutoTitle] fetch failed:", err);
    });
  };

  // Tool Mutations for local LLM
  const addTask = usePbTaskCreate();
  const addEvent = usePbEventCreate();
  const updateEvent = usePbEventUpdate();
  const updateOccurrence = usePbEventUpdateOccurrence();
  const deleteEvent = usePbEventDelete();
  const completeTask = usePbTaskToggleCompleted();
  const deleteTask = usePbTaskDelete();
  const updateTask = usePbTaskUpdate();
  const updateUserBio = usePbUpdateProfile();
  const deleteSemanticMemory = usePbMemoryDelete();
  const updatePreferences = usePbUpdatePreferences();
  const createHabit = usePbHabitCreate();
  const logHabit = usePbHabitLog();

  const [provider, setProvider] = useState<AIProvider>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("dialogue_provider") as AIProvider) || "gemini"
      );
    }
    return "gemini";
  });

  const [lastSyncedProfileId, setLastSyncedProfileId] =
    useState<string | null>(null);

  // Sync provider with DB profile during render
  if (profile && profile._id !== lastSyncedProfileId) {
    setLastSyncedProfileId(profile._id);
    const prefs = profile.preferences as Record<string, unknown> | undefined;
    if (
      prefs?.provider &&
      prefs.provider !== provider
    ) {
      setProvider(prefs.provider as AIProvider);
    }
  }

  const handleProviderChange = async (p: AIProvider) => {
    setProvider(p);
    localStorage.setItem("dialogue_provider", p);
    try {
      await updatePreferences({ provider: p });
    } catch (err) {
      console.error("Failed to update active provider in DB preferences:", err);
    }
  };

  const getActiveModelName = useMemo((): string => {
    const prefs = profile?.preferences as Record<string, unknown> | undefined;
    const customConfigs = prefs?.customConfigs as
      | ProviderConfigs
      | undefined;
    const config = customConfigs?.[provider];
    if (config?.modelId) {
      return config.modelId;
    }
    switch (provider) {
      case "gemini":
        return "gemini-3.5-flash";
      case "openai":
        return "gpt-5.5-pro";
      case "anthropic":
        return "claude-sonnet-4.6";
      case "deepseek":
        return "deepseek-chat";
      case "xai":
        return "grok-2-latest";
      case "mistral":
        return "mistral-large-latest";
      case "groq":
        return "llama3-8b-8192";
      case "cohere":
        return "command-r-plus";
      case "moonshotai":
        return "moonshot-v1-8k";
      case "deepinfra":
        return "meta-llama/Meta-Llama-3.3-70B-Instruct";
      case "togetherai":
        return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
      case "fireworks":
        return "accounts/fireworks/models/llama-v3p3-70b-instruct";
      case "alibaba":
        return "qwen-turbo";
      case "baseten":
        return "meta-llama/Llama-3.3-70B-Instruct";
      case "huggingface":
        return "meta-llama/Meta-Llama-3.3-70B-Instruct";
      case "minimax":
        return "minimax/minimax-m3";
      case "ollama":
        return "llama3.3";
      case "opencode":
        return "anthropic/claude-3-5-sonnet-20241022";
      case "openrouter":
        return "anthropic/claude-3.5-sonnet:beta";
      case "zhipu":
        return "glm-4-plus";
      case "lmstudio":
        return "local";
      default:
        return "ai";
    }
  }, [profile?.preferences, provider]);

  const getActiveConfig = useMemo(() => {
    const prefs = profile?.preferences as Record<string, unknown> | undefined;
    const customConfigs = prefs?.customConfigs as ProviderConfigs | undefined;
    return customConfigs?.[provider] || {};
  }, [profile?.preferences, provider]);

  const pendingInitialMessageRef = useRef<{ sessionId: string; text: string } | null>(null);
  const activeSyncRef = useRef<(() => void) | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [openReflectionId, setOpenReflectionId] = useState<string | null>(null);

  useEffect(() => {
    if (
      activeWorkspaceId &&
      sessions &&
      sessions.length > 0 &&
      !activeSessionId
    ) {
      setActiveSessionIdAction(sessions[0]._id);
    }
  }, [sessions, activeSessionId, setActiveSessionIdAction, activeWorkspaceId]);

  // OCEAN Heartbeat: Automatically trigger background OCEAN digest generation if pending
  useEffect(() => {
    const p = profile as { userId?: string } | undefined;
    if (p?.userId) {
      // Fire and forget
      fetch('/api/cron/ocean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: p.userId })
      }).catch(err => console.error("OCEAN heartbeat failed", err));
    }
  }, [profile]);

  // ---- Sync handler (used by both the sidebar button and TaskPanel) ----
  const handleSync = async () => {
    if (activeSessionId && activeSyncRef.current) {
      await activeSyncRef.current();
      return;
    }

    const syncText = "Sync my workspace.";
    const id = await createSession({
      title: `Sync - ${new Date().toLocaleDateString()}`,
      workspaceId: activeWorkspaceId,
    });
    
    pendingInitialMessageRef.current = { sessionId: id, text: syncText };
    setActiveSessionIdAction(id);
  };

  // Expose handleSync to parent via ref (placed after declaration)
  useEffect(() => {
    if (onSyncRef) onSyncRef.current = handleSync;
  });


  const handleAddWorkspace = async (name: string) => {
    const colors = ["#d4a373", "#8b5cf6", "#ec4899", "#10b981", "#3b82f6"];
    const index = (workspaces?.length || 0) % colors.length;

    await createWorkspace({
      name,
      icon: "Briefcase",
      color: colors[index],
    });

    setIsCreatingWorkspace(false);
  };

  const currentWorkspace = workspaces?.find(
    (w: PbWorkspaces) => w._id === activeWorkspaceId,
  );

  const handleDeleteChat = async (
    id: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const session = sessions?.find((s: PbChatSessions) => s._id === id);
    if (session) {
      setConfirmDeleteSession({
        id,
        title: session.title || "Untitled Session",
      });
    }
  };

  const executeDeleteChat = async (id: string) => {
    await deleteSession({ id });
    if (activeSessionId === id) {
      setActiveSessionIdAction(null);
    }
    setConfirmDeleteSession(null);
  };

  const handleNewChat = async (
    workspaceOverride?: string | null,
    agentPersonaId?: string,
    initialMessage?: string,
  ) => {
    const wsId = workspaceOverride === null ? undefined : workspaceOverride || activeWorkspaceId;
    const title = initialMessage
      ? initialMessage.length > 30
        ? initialMessage.substring(0, 30) + "..."
        : initialMessage
      : `Chat ${new Date().toLocaleTimeString()}`;

    const id = await createSession({
      title,
      workspaceId: wsId,
      agentPersonaId: agentPersonaId === "default_dialogue" ? undefined : agentPersonaId,
    });
    if (wsId !== activeWorkspaceId && wsId) {
      setActiveWorkspaceIdAction(wsId);
    }

    if (initialMessage) {
      pendingInitialMessageRef.current = { sessionId: id, text: initialMessage };
    }

    setActiveSessionIdAction(id);
    if (!isLargeViewport) {
      setShowHistoryAction(false);
    }
  };

  // When selecting a session from the Dashboard, switch to its workspace if needed
  const handleDashboardSelectSession = useCallback(
    (id: string) => {
      const session = allSessions?.find(
        (s: PbChatSessions) => s._id === id,
      );
      if (session?.workspace && session.workspace !== activeWorkspaceId) {
        setActiveWorkspaceIdAction(session.workspace);
      }
      setActiveSessionIdAction(id);
      if (!isLargeViewport) {
        setShowHistoryAction(false);
      }
    },
    [
      allSessions,
      activeWorkspaceId,
      setActiveWorkspaceIdAction,
      setActiveSessionIdAction,
      isLargeViewport,
      setShowHistoryAction,
    ],
  );

  return (
    <div className="flex-1 flex overflow-hidden h-full relative">
      {/* Workspace Rail (The Focus) - Hidden on Mobile */}
      <WorkspaceRail
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        showHistory={showHistory}
        onSelectWorkspace={(id) => setActiveWorkspaceIdAction(id)}
        onOpenCreateModal={() => setIsCreatingWorkspace(true)}
        onShowHistory={() => setShowHistoryAction(true)}
      />

      {/* Sessions Sidebar */}
      <SessionSidebar
        sessions={sessions}
        workspaces={workspaces}
        activeSessionId={activeSessionId}
        activeWorkspaceId={activeWorkspaceId}
        showHistory={showHistory}
        isLargeViewport={isLargeViewport}
        onSelectSession={(id) => setActiveSessionIdAction(id)}
        onSelectWorkspaceSession={(wsId, sessionId) =>
          setActiveWorkspaceIdAction(wsId, sessionId)
        }
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onSelectWorkspace={(id) => setActiveWorkspaceIdAction(id)}
        onOpenCreateWorkspace={() => setIsCreatingWorkspace(true)}
        onCloseHistory={() => setShowHistoryAction(false)}
      />

      {/* Main Content Area */}
      <motion.div
        layout
        className="flex-1 flex flex-col h-full min-w-0 relative bg-[#0f0e0c] overflow-hidden"
      >
        {!activeWorkspaceId && !activeSessionId ? (
          <Dashboard
            workspaces={workspaces}
            sessions={allSessions}
            profile={profile}
            onNewChat={handleNewChat}
            onSelectSession={handleDashboardSelectSession}
            onShowHistory={() => setShowHistoryAction(true)}
            onShowTasks={onShowTasksAction}
            onOpenReflection={setOpenReflectionId}
          />
        ) : (
          <ActiveChat
            key={activeSessionId || "no-session"}
            activeSessionId={activeSessionId}
            activeWorkspaceId={activeWorkspaceId}
            workspaces={workspaces}
            sessions={sessions}
            profile={profile}
            activePersona={activePersona}
            provider={provider}
            getActiveModelName={getActiveModelName}
            getActiveConfig={getActiveConfig}
            isLargeViewport={isLargeViewport}
            keyboardOffset={keyboardOffset}
            activeScope={activeScope}
            setActiveScopeAction={setActiveScopeAction}
            onShowTasksAction={onShowTasksAction}
            setShowHistoryAction={setShowHistoryAction}
            onChatInputResizeAction={onChatInputResizeAction}
            signOut={signOut}
            handleProviderChange={handleProviderChange}
            sendMessage={sendMessage}
            addTask={addTask}
            updateTask={updateTask}
            addEvent={addEvent}
            updateEvent={updateEvent}
            updateOccurrence={updateOccurrence}
            deleteEvent={deleteEvent}
            completeTask={completeTask}
            deleteTask={deleteTask}
            updateUserBio={updateUserBio}
            deleteSemanticMemory={deleteSemanticMemory}
            updatePreferences={updatePreferences}
            createHabit={createHabit}
            logHabit={logHabit}
            triggerAutoTitle={triggerAutoTitle}
            pendingInitialMessageRef={pendingInitialMessageRef}
            activeSyncRef={activeSyncRef}
          />
        )}
      </motion.div>

      {/* Global Workspace Creation Modal */}
      <CreateWorkspaceModal
        isOpen={isCreatingWorkspace}
        onClose={() => setIsCreatingWorkspace(false)}
        onSubmit={handleAddWorkspace}
        isLargeViewport={isLargeViewport}
      />
      {/* Confirmation Modal for Session Deletion */}
      <DeleteSessionModal
        session={confirmDeleteSession}
        onConfirm={(id) => executeDeleteChat(id)}
        onCancel={() => setConfirmDeleteSession(null)}
        isLargeViewport={isLargeViewport}
      />
      <ReflectionWrappedModal
        reflectionId={openReflectionId}
        onClose={() => setOpenReflectionId(null)}
        onExportImage={async (id) => {
          let data: any;
          try {
            const pb = (await import("@/pb-compat/client")).getPbClient();
            const rec = await pb.collection("reflections").getOne(id);
            data = {
              ...rec,
              _id: rec.id,
              userId: rec.user,
              workspaceId: rec.workspace,
            };
          } catch (e) {
            console.error("Failed to fetch reflection from PB for export:", e);
          }
          if (data) await exportReflectionAsImage(data);
        }}
      />
    </div>
  );
}

interface ActiveChatProps {
  activeSessionId: string | null;
  activeWorkspaceId: string | undefined;
  workspaces: PbWorkspaces[] | undefined;
  sessions: PbChatSessions[] | undefined;
  profile: any;
  activePersona: any;
  provider: AIProvider;
  getActiveModelName: string;
  getActiveConfig: any;
  isLargeViewport: boolean;
  keyboardOffset: number;
  activeScope: Scope | null;
  setActiveScopeAction: (scope: Scope | null) => void;
  onShowTasksAction?: () => void;
  setShowHistoryAction: (show: boolean) => void;
  onChatInputResizeAction?: (offset: number) => void;
  signOut: () => void;
  handleProviderChange: (p: AIProvider) => void;
  sendMessage: any;
  addTask: any;
  updateTask: any;
  addEvent: any;
  updateEvent: any;
  updateOccurrence: any;
  deleteEvent: any;
  completeTask: any;
  deleteTask: any;
  updateUserBio: any;
  deleteSemanticMemory: any;
  updatePreferences: any;
  createHabit: any;
  logHabit: any;
  triggerAutoTitle: any;
  pendingInitialMessageRef: React.MutableRefObject<{ sessionId: string; text: string } | null>;
  activeSyncRef: React.MutableRefObject<(() => void) | null>;
}

function ActiveChat({
  activeSessionId,
  activeWorkspaceId,
  workspaces,
  sessions,
  profile,
  activePersona,
  provider,
  getActiveModelName,
  getActiveConfig,
  isLargeViewport,
  keyboardOffset,
  activeScope,
  setActiveScopeAction,
  onShowTasksAction,
  setShowHistoryAction,
  onChatInputResizeAction,
  signOut,
  handleProviderChange,
  sendMessage,
  addTask,
  updateTask,
  addEvent,
  updateEvent,
  updateOccurrence,
  deleteEvent,
  completeTask,
  deleteTask,
  updateUserBio,
  deleteSemanticMemory,
  updatePreferences,
  createHabit,
  logHabit,
  triggerAutoTitle,
  pendingInitialMessageRef,
  activeSyncRef,
}: ActiveChatProps) {

  const idMapRef = useRef<Map<string, string>>(new Map());
  const [localScopes, setLocalScopes] = useState<Record<string, Scope>>({});
  const [isTyping, setIsTyping] = useState(false);

  // Clear local scopes when activeSessionId changes
  useEffect(() => {
    setLocalScopes({});
  }, [activeSessionId]);

  const messagesPaginated = usePbPaginatedQuery(
    usePbMessagesPaginated,
    activeSessionId ? { sessionId: activeSessionId } : "skip",
    { initialNumItems: 50 },
  );

  const messages = useMemo(() => {
    if (!activeSessionId) return undefined;
    if (messagesPaginated.status === "LoadingFirstPage") return undefined;
    const sorted = [...messagesPaginated.results].sort(
      (a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0),
    );
    return sorted.reverse().map((msg: any) => ({
      ...msg,
      _id: msg._id || msg.id,
      _creationTime: msg._creationTime || msg.createdAt,
      sessionId: msg.sessionId || msg.session,
    }));
  }, [messagesPaginated.results, messagesPaginated.status, activeSessionId]);

  const loadOlderMessages = useCallback(() => {
    if (messagesPaginated.status === "CanLoadMore") {
      void messagesPaginated.loadMore(50);
    }
  }, [messagesPaginated]);

  const isSyncing = !!(activeSessionId && messages === undefined);
  const authToken = getPbClient().authStore.token;

  const pendingScopeRef = useRef<Scope | null | undefined>(undefined);

  const { messages: aiMessages, setMessages, sendMessage: sendVercelMessage, status } = useChat({
    transport: new DefaultChatTransport({ 
      api: `/api/chat?sessionId=${activeSessionId || ""}&provider=${provider}&modelId=${getActiveModelName}`,
      fetch: async (input, init) => {
        const scopeHeader = pendingScopeRef.current !== undefined
          ? JSON.stringify(pendingScopeRef.current)
          : undefined;
        return fetch(input, {
          ...init,
          headers: {
            ...init?.headers,
            'x-api-key': getActiveConfig.apiKey || "",
            'x-base-url': getActiveConfig.baseUrl || "",
            'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
            'x-auth-token': authToken || "",
            ...(scopeHeader ? { 'x-active-scope': scopeHeader } : {}),
          }
        });
      }
    }),
    id: activeSessionId || "default",
    onFinish: async ({ message }) => {
      if (activeSessionId) {
        const textContent = message.parts 
          ? message.parts.filter(p => p.type === 'text').map(p => (p as any).text).join('') 
          : (message as any).content || '';
          
        // Skip intermediate tool execution steps that have no text content yet
        if (!textContent) {
          return;
        }

        const reasoningParts = message.parts ? message.parts.filter(p => p.type === 'reasoning') : [];
        const reasoning = reasoningParts.length > 0
          ? reasoningParts.map(p => (p as any).reasoning || (p as any).text).join('\n[---DIALOGUE_REASONING_SPLIT---]\n')
          : (message as any).reasoning || undefined;

        const toolCalls = (message as any).toolInvocations && (message as any).toolInvocations.length > 0
          ? (message as any).toolInvocations.map((ti: any) => ({
              name: ti.toolName,
              args: ti.args,
              result: ti.result
            }))
          : undefined;

        const convexId = await sendMessage({
          sessionId: activeSessionId,
          text: textContent || "(tool execution)",
          author: "AI",
          reasoning,
          toolCalls,
        });

        if (convexId && message.id) {
          idMapRef.current.set(convexId, message.id);
        }

        // Trigger AI title generation on first response (idempotent — skips if title already set)
        triggerAutoTitle({ sessionId: activeSessionId });
      }
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Vercel AI SDK vs Convex Sync (Hybrid Approach)
  useEffect(() => {
    if (messages && !isLoading) {
      const hasConvexCaughtUp = messages.length > aiMessages.length;

      if (hasConvexCaughtUp || aiMessages.length === 0) {
        const mappedHistory = messages.map(m => {
          const parts: any[] = [];
          if (m.reasoning) {
            const splitReasoning = m.reasoning.split('\n[---DIALOGUE_REASONING_SPLIT---]\n');
            for (const rText of splitReasoning) {
              parts.push({ type: "reasoning" as const, text: rText });
            }
          }
          parts.push({ type: "text" as const, text: m.text });

          const sdkId = idMapRef.current.get(m._id) || m._id;
          return {
            id: sdkId,
            role: (m.author === "User" ? "user" : "assistant") as "user" | "assistant",
            content: m.text,
            parts,
            toolCalls: m.toolCalls,
            toolCall: m.toolCall,
            toolInvocations: m.toolCalls?.map((tc: any, index: number) => ({
              toolCallId: tc.id || `${m._id}-tool-${index}`,
              toolName: tc.name,
              args: tc.args,
              result: tc.result,
              state: tc.result !== undefined ? "result" : "call",
            })),
            attachments: Array.isArray(m.attachments)
              ? m.attachments.map((att: any) => {
                  if (typeof att === "string") {
                    const pb = getPbClient();
                    return {
                      storageId: att,
                      url: pb.files.getUrl(m, att),
                      fileName: att,
                      fileType: att.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? "image/png" : "application/octet-stream"
                    };
                  }
                  return att;
                })
              : m.attachments,
            storageId: m.storageId,
            fileName: m.fileName,
            fileType: m.fileType,
            url: m.storageId ? getPbClient().files.getUrl(m, m.storageId) : undefined,
            scope: m.scope,
            reasoning: (m as any).reasoning,
            sessionId: m.sessionId,
          };
        });
        setMessages(mappedHistory);
      }
    }
  }, [messages, isLoading, setMessages, aiMessages.length, activeSessionId]);

  // Run LM Studio logic
  const runLocalLLMForSession = useCallback(
    async (
      sessionId: string,
      userText: string,
      opts?: { brief?: boolean; scope?: Scope | null },
    ) => {
      try {
        const promptCtx = await api.ai.getPromptContext({
          sessionId,
          timezoneOffset: new Date().getTimezoneOffset(),
          ...(opts?.brief !== undefined ? { brief: opts.brief } : {}),
          ...(opts?.scope ? { scope: opts.scope } : {}),
        }) as { systemInstruction: string; workspaceId?: string; timezoneOffset?: number };

        const recentMsgs = (messages || []).slice(-10);

        const result = await processLocalLLMRequest({
          systemInstruction: promptCtx.systemInstruction,
          recentMessages: recentMsgs,
          userText,
        });

        let aiTextOverride = result.aiText || "Done!";

        if (result.toolCalls && result.toolCalls.length > 0) {
          const parseLocal = (s: string) => {
            const match = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
            if (match) {
              const [, y, m, d, h, min] = match;
              return new Date(
                Number(y),
                Number(m) - 1,
                Number(d),
                Number(h),
                Number(min),
              ).getTime();
            }
            return new Date(s).getTime();
          };

          const executedCalls: Array<{
            name: string;
            args: Record<string, unknown>;
            result?: unknown;
          }> = [];

          for (const tc of result.toolCalls) {
            const { name, args } = tc;
            const enrichedArgs = { ...args } as EnrichedToolArgs;

            if (name === "addTask" || name === "updateTask") {
              if (name === "addTask") {
                await addTask({
                  text: (args.text as string) || "New Task",
                  priority: args.priority as
                    | "low"
                    | "medium"
                    | "high"
                    | undefined,
                  category: args.category as string | undefined,
                  notes: args.notes as string | undefined,
                  progress:
                    args.progress !== undefined
                      ? Number(args.progress)
                      : undefined,
                  statusHook: args.statusHook as string | undefined,
                  dueDate: args.dueDate
                    ? parseLocal(args.dueDate as string)
                    : undefined,
                  dueDateStr: args.dueDate
                    ? (args.dueDate as string).split("T")[0]
                    : undefined,
                  workspaceId: promptCtx.workspaceId ?? undefined,
                });
              } else {
                const oldTask = await api.tasks.get({ id: args.taskId as string });
                const taskUpdates: Record<
                  string,
                  string | number | boolean | undefined
                > = {};
                if (args.text) taskUpdates.text = args.text as string;
                if (args.completed !== undefined)
                  taskUpdates.completed = args.completed as boolean;
                if (args.priority)
                  taskUpdates.priority = args.priority as
                    | "low"
                    | "medium"
                    | "high";
                if (args.category)
                  taskUpdates.category = args.category as string;
                if (args.notes) taskUpdates.notes = args.notes as string;
                if (args.progress !== undefined)
                  taskUpdates.progress = Number(args.progress);
                if (args.statusHook !== undefined)
                  taskUpdates.statusHook = args.statusHook as string;
                if (args.dueDate) {
                  taskUpdates.dueDate = parseLocal(args.dueDate as string);
                  taskUpdates.dueDateStr = (args.dueDate as string).split(
                    "T",
                  )[0];
                }

                await updateTask({
                  id: args.taskId as string,
                  timezoneOffset: promptCtx.timezoneOffset ?? undefined,
                  ...taskUpdates,
                });

                enrichedArgs.titleHint = oldTask?.text;
                enrichedArgs.oldValues = oldTask
                  ? {
                      text: oldTask.text,
                      completed: oldTask.completed,
                      priority: oldTask.priority,
                      category: oldTask.category,
                      notes: oldTask.notes,
                      progress: oldTask.progress,
                      statusHook: oldTask.statusHook,
                      dueDate: oldTask.dueDate,
                      dueDateStr: oldTask.dueDateStr,
                    }
                  : undefined;
              }
            } else if (name === "deleteTask") {
              const oldTask = await api.tasks.get({ id: args.taskId as string });
              await deleteTask({ id: args.taskId as string });
              enrichedArgs.titleHint = oldTask?.text;
            } else if (name === "addEvent" || name === "updateEvent") {
              if (name === "addEvent") {
                await addEvent({
                  title: (args.title as string) || "New Event",
                  startTime: args.startTime
                    ? parseLocal(args.startTime as string)
                    : Date.now(),
                  endTime: args.endTime
                    ? parseLocal(args.endTime as string)
                    : Date.now() + 3600000,
                  location: args.location as string | undefined,
                  notes: args.notes as string | undefined,
                  eventType: args.eventType as "interval" | "point" | undefined,
                  recurrence: toRecurrenceInput(args.recurrence),
                  workspaceId: promptCtx.workspaceId ?? undefined,
                });
              } else {
                const oldEvent = await api.events.get({ id: args.eventId as string });
                const updates: EventUpdateFields = {};
                if (args.title) updates.title = args.title as string;
                if (args.location) updates.location = args.location as string;
                if (args.notes) updates.notes = args.notes as string;
                if (args.outcome) updates.outcome = args.outcome as string;
                if (args.statusHook !== undefined)
                  updates.statusHook = args.statusHook as string;
                if (args.startTime)
                  updates.startTime = parseLocal(args.startTime as string);
                if (args.endTime)
                  updates.endTime = parseLocal(args.endTime as string);
                if (args.eventType)
                  updates.eventType = args.eventType as "interval" | "point";
                if (args.cancelled !== undefined)
                  updates.cancelled = args.cancelled as boolean;
                if (args.recurrence) {
                  const ri = toRecurrenceInput(args.recurrence);
                  if (ri) {
                    updates.recurrence = {
                      frequency: ri.frequency,
                      interval: ri.interval,
                      daysOfWeek: ri.daysOfWeek,
                      until: ri.until ? parseLocal(ri.until) : undefined,
                    };
                  }
                }

                await updateEvent({
                  id: args.eventId as string,
                  timezoneOffset: promptCtx.timezoneOffset ?? undefined,
                  ...updates,
                });

                enrichedArgs.titleHint = oldEvent?.title;
                enrichedArgs.oldValues = oldEvent
                  ? {
                      title: oldEvent.title,
                      startTime: oldEvent.startTime,
                      endTime: oldEvent.endTime,
                      location: oldEvent.location,
                      notes: oldEvent.notes,
                      eventType: oldEvent.eventType,
                      recurrence: oldEvent.recurrence,
                      outcome: oldEvent.outcome,
                      statusHook: oldEvent.statusHook,
                      cancelled: oldEvent.cancelled,
                    }
                  : undefined;
              }
            } else if (name === "updateEventOccurrence") {
              const oldEvent = await api.events.get({ id: args.eventId as string });
              await updateOccurrence({
                id: args.eventId as string,
                occurrenceId: args.occurrenceId as string,
                startTime: args.startTime
                  ? parseLocal(args.startTime as string)
                  : undefined,
                endTime: args.endTime
                  ? parseLocal(args.endTime as string)
                  : undefined,
                cancelled: args.cancelled as boolean | undefined,
                notes: args.notes as string | undefined,
                outcome: args.outcome as string | undefined,
                statusHook: args.statusHook as string | undefined,
              });
              enrichedArgs.titleHint = oldEvent?.title;
            } else if (name === "deleteEvent") {
              const oldEvent = await api.events.get({ id: args.eventId as string });
              await deleteEvent({ id: args.eventId as string });
              enrichedArgs.titleHint = oldEvent?.title;
            } else if (name === "updateUserBio") {
              await updateUserBio({
                bio: args.bio as string,
              });
            } else if (name === "saveSemanticMemory") {
              // Handled by background cron in Mastra agent (silent)
            } else if (name === "deleteSemanticMemory") {
              await deleteSemanticMemory({
                memoryId: args.memoryId as string,
              });
            } else if (name === "retrieveGraphContext") {
              // Read-only tool
            } else if (name === "getRelevantTasks") {
              const limit =
                args.limit !== undefined ? Number(args.limit) : 10;
              const statusHook = args.statusHook as string | undefined;

              const tasks = await api.tasks.list({
                workspaceId: promptCtx.workspaceId ?? undefined,
                statusHook,
              } as any);

              enrichedArgs.tasks = tasks.slice(0, limit);
              enrichedArgs.count = tasks.length;
            } else if (name === "getRelevantEvents") {
              const limit =
                args.limit !== undefined ? Number(args.limit) : 10;
              const statusHook = args.statusHook as string | undefined;

              const events = await api.events.list({
                workspaceId: promptCtx.workspaceId ?? undefined,
                statusHook,
              } as any);

              enrichedArgs.events = events.slice(0, limit);
              enrichedArgs.count = events.length;
            } else if (name === "searchTasksAndEvents") {
              const limit =
                args.limit !== undefined ? Number(args.limit) : 10;
              const queryStr = args.query as string;

              let results: any[] = [];
              const tasks = await api.tasks.list({
                workspaceId: promptCtx.workspaceId ?? undefined,
              });
              const events = await api.events.list({
                workspaceId: promptCtx.workspaceId ?? undefined,
              });
              const q = queryStr.toLowerCase();
              const filteredTasks = tasks.filter((t: any) =>
                t.text.toLowerCase().includes(q),
              );
              const filteredEvents = events.filter((e: any) =>
                e.title.toLowerCase().includes(q),
              );
              results = results.concat(
                filteredTasks.map((t: any) => ({
                  type: "task",
                  id: t.id,
                  title: t.text,
                  completed: t.completed,
                })),
              );
              results = results.concat(
                filteredEvents.map((e: any) => ({
                  type: "event",
                  id: e.id,
                  title: e.title,
                  startTime: e.startTime,
                  location: e.location,
                })),
              );

              results = results.slice(0, limit);
              enrichedArgs.count = results.length;
              enrichedArgs.results = results;
            } else if (name === "batchAddTasks") {
              const batchArgs = args as {
                tasks: Array<{
                  text: string;
                  priority?: string;
                  category?: string;
                  dueDate?: string;
                  notes?: string;
                }>;
              };

              const parsedTasks = batchArgs.tasks.map((t) => ({
                text: t.text,
                priority: t.priority as "low" | "medium" | "high" | undefined,
                category: t.category,
                dueDate: t.dueDate ? parseLocal(t.dueDate) : undefined,
                notes: t.notes,
              }));

              const ids = await Promise.all(
                parsedTasks.map((t) =>
                  addTask({
                    ...t,
                    workspaceId: promptCtx.workspaceId ?? undefined,
                  } as any)
                )
              );
              enrichedArgs.ids = ids;
              enrichedArgs.count = ids.length;
            } else if (name === "getTaskNotes") {
              const task = await api.tasks.get({ id: args.taskId as string });
              enrichedArgs.notes = task?.notes || null;
              enrichedArgs.hasNotes = !!task?.notes;
              enrichedArgs.titleHint = task?.text;
            } else if (name === "listWorkspaces") {
              const workspaces = await api.workspaces.list({});
              enrichedArgs.workspaces = workspaces;
            } else if (name === "create_habit") {
              const habitId = await createHabit({
                workspaceId: promptCtx.workspaceId ?? undefined,
                name: args.name as string,
                description: args.description as string | undefined,
                frequency: args.frequency as "daily" | "custom",
                frequencyConfig: {
                  daysOfWeek: args.daysOfWeek as number[] | undefined,
                },
              });
              enrichedArgs.habitId = habitId;
            } else if (name === "log_habit") {
              const logId = await logHabit({
                habitId: args.habitId as string,
                dateString: args.dateString as string,
                status: args.status as "completed" | "skipped",
                notes: args.notes as string | undefined,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
              const habit = await api.habits.get({ id: args.habitId as string });
              enrichedArgs.logId = logId;
              enrichedArgs.newStreak = habit?.currentStreak || 0;
              enrichedArgs.titleHint = habit?.name;
            } else if (name === "get_habit_consistency") {
              const report = await api.habits.getHabitConsistency({
                workspaceId: promptCtx.workspaceId ?? undefined,
                periodStartDate: args.periodStartDate as string,
                periodEndDate: args.periodEndDate as string,
              });
              enrichedArgs.report = report;
            }

            const isOnlyContext =
              (name === "updateTask" &&
                Object.keys(args).every((k) =>
                  ["taskId", "notes", "progress", "statusHook"].includes(k),
                ) &&
                Object.keys(args).some((k) =>
                  ["notes", "progress", "statusHook"].includes(k),
                )) ||
              (name === "updateEvent" &&
                Object.keys(args).every((k) =>
                  ["eventId", "notes", "outcome", "statusHook"].includes(k),
                ) &&
                Object.keys(args).some((k) =>
                  ["notes", "outcome", "statusHook"].includes(k),
                ));

            if (!isOnlyContext) {
              executedCalls.push({
                name,
                args: enrichedArgs,
                result: { status: "success" },
              });
            }
          }

          await sendMessage({
            sessionId,
            text: aiTextOverride,
            author: "AI",
            toolCall: executedCalls.length > 0 ? executedCalls[0] : undefined,
            toolCalls: executedCalls.length > 0 ? executedCalls : undefined,
          });
        } else {
          await sendMessage({
            sessionId,
            text: aiTextOverride,
            author: "AI",
          });
        }
      } catch (error) {
        console.error("LM Studio Error:", error);
        await sendMessage({
          sessionId,
          text: "I encountered a connection error. Please make sure LM Studio's Local Server is running on port 1234.",
          author: "AI",
        });
      }
    },
    [
      addEvent,
      addTask,
      completeTask,
      deleteEvent,
      deleteSemanticMemory,
      deleteTask,
      messages,
      profile?.bio,
      profile?.name,
      sendMessage,
      updateEvent,
      updateOccurrence,
      updateTask,
      updateUserBio,
    ],
  );

  // Set the sync callback
  useEffect(() => {
    if (activeSyncRef) {
      activeSyncRef.current = async () => {
        const syncText = "Sync my workspace.";
        await sendMessage({
          sessionId: activeSessionId,
          text: syncText,
          author: "User",
          brief: true,
          timezoneOffset: new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          provider,
        });

        setIsTyping(true);

        if (provider === "lmstudio") {
          try {
            await runLocalLLMForSession(activeSessionId as string, syncText, {
              brief: true,
            });
          } finally {
            setIsTyping(false);
          }
        } else {
          try {
            await sendVercelMessage({
              text: syncText,
            });
          } finally {
            setIsTyping(false);
          }
        }
      };
    }
    return () => {
      if (activeSyncRef) activeSyncRef.current = null;
    };
  }, [activeSessionId, provider, sendMessage, runLocalLLMForSession, sendVercelMessage, activeSyncRef]);

  // Fire the AI call for new-chat initial messages once the activeSessionId has settled
  useEffect(() => {
    const pending = pendingInitialMessageRef.current;
    if (!pending || pending.sessionId !== activeSessionId || isLoading) return;
    pendingInitialMessageRef.current = null;

    const trigger = async () => {
      setIsTyping(true);
      try {
        await sendMessage({
          sessionId: activeSessionId,
          text: pending.text,
          author: "User",
          timezoneOffset: new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          provider,
        });

        if (provider === "lmstudio") {
          await runLocalLLMForSession(activeSessionId as string, pending.text);
        } else {
          await sendVercelMessage({ text: pending.text });
        }
      } catch (err) {
        console.error("Failed to trigger AI for initial message:", err);
      } finally {
        setIsTyping(false);
      }
    };
    trigger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Build a scope lookup from messages
  const scopeByContent = useMemo(() => {
    if (!messages) return new Map<string, Scope>();
    const map = new Map<string, Scope>();
    for (const cm of messages) {
      if (cm.scope && cm.author === "User") {
        map.set(cm.text, cm.scope);
      }
    }
    return map;
  }, [messages]);

  const displayMessages = useMemo(() => {
    if (!activeSessionId) return undefined;
    if (messagesPaginated.status === "LoadingFirstPage") return undefined;
    
    return aiMessages.map((m) => {
      const textParts = m.parts ? m.parts.filter(p => p.type === 'text') : [];
      const reasoningParts = m.parts ? m.parts.filter(p => p.type === 'reasoning') : [];
      
      const text = textParts.length > 0 
        ? textParts.map(p => (p as any).text).join('') 
        : (m as any).content || '';
        
      const reasoning = reasoningParts.length > 0
        ? reasoningParts.map(p => (p as any).reasoning || (p as any).text).join('\n\n')
        : (m as any).reasoning || undefined;

      return {
        _id: m.id,
        author: m.role === "user" ? "User" : "AI",
        text,
        reasoning,
        parts: m.parts,
        toolCalls: (m as any).toolCalls || ((m as any).toolInvocations ? (m as any).toolInvocations.map((ti: any) => ({
          name: ti.toolName,
          args: ti.args,
          result: ti.result,
        })) : undefined),
        toolCall: (m as any).toolCall,
        attachments: (m as any).attachments,
        storageId: (m as any).storageId,
        fileName: (m as any).fileName,
        fileType: (m as any).fileType,
        scope: (m as any).scope || localScopes[text] || scopeByContent.get(text),
        timestamp: Date.now(),
        sessionId: (m as any).sessionId || activeSessionId,
      };
    });
  }, [aiMessages, activeSessionId, messagesPaginated.status, scopeByContent, localScopes]);

  const handleSend = useCallback(
    async (userText: string, files: File[], scope?: Scope | null) => {
      if (!activeSessionId) return;

      try {
        // PB handles files directly in the mutation

        const textMessageContent = userText || (files.length > 0 ? `Attached ${files.length} files` : "");

        setIsTyping(true);

        // Start Vercel AI SDK stream immediately to set isLoading=true
        let aiPromise;
        if (provider === "lmstudio") {
          aiPromise = runLocalLLMForSession(activeSessionId, userText, { scope });
        } else {
          pendingScopeRef.current = scope ?? null;
          aiPromise = sendVercelMessage({ text: textMessageContent });
        }

        if (scope) {
          setLocalScopes(prev => ({
            ...prev,
            [textMessageContent]: scope,
          }));
        }

        try {
          await Promise.all([
            sendMessage({
              sessionId: activeSessionId,
              text: textMessageContent,
              author: "User",
              timezoneOffset: new Date().getTimezoneOffset(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              provider,
              files: files.length > 0 ? files : undefined,
              scope: scope || undefined,
            }),
            aiPromise
          ]);
        } finally {
          pendingScopeRef.current = undefined;
          setIsTyping(false);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        setIsTyping(false);
      }
    },
    [
      activeSessionId,
      provider,

      runLocalLLMForSession,
      sendMessage,
      sendVercelMessage,
    ],
  );

  const handleTypingDone = useCallback(() => {
    setIsTyping(false);
  }, []);

  const currentWorkspace = workspaces?.find(
    (w: PbWorkspaces) => w.id === activeWorkspaceId,
  );

  return (
    <>
      <ChatHeader
        activeSessionTitle={
          activeSessionId
            ? sessions?.find(
                (s: PbChatSessions) => s.id === activeSessionId,
              )?.title
            : undefined
        }
        currentWorkspace={currentWorkspace}
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaces}
        messageCount={messages?.length || 0}
        provider={provider}
        activeModelName={getActiveModelName}
        isLargeViewport={isLargeViewport}
        onProviderChange={handleProviderChange}
        onSignOut={signOut}
        onShowHistory={() => setShowHistoryAction(true)}
        onShowTasks={onShowTasksAction}
      />

      <MessageStream
        messages={displayMessages as any}
        activeSessionId={activeSessionId}
        isTyping={isTyping}
        isSyncing={isSyncing}
        isLargeViewport={isLargeViewport}
        keyboardOffset={keyboardOffset}
        onTypingDone={handleTypingDone}
        agentName={activePersona?.name}
        onLoadOlder={loadOlderMessages}
        canLoadOlder={messagesPaginated.status === "CanLoadMore"}
        isLoadingOlder={false}
      />

      <ChatInput
        activeSessionId={activeSessionId}
        isLargeViewport={isLargeViewport}
        keyboardOffset={keyboardOffset}
        activeScope={activeScope}
        setActiveScope={setActiveScopeAction}
        onSend={handleSend}
        onChatInputResize={onChatInputResizeAction}
      />
    </>
  );
}
