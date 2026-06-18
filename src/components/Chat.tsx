"use client";

import {
  getPbClient,
  usePbProfile,
  usePbWorkspacesList,
  usePbSessionsList,
  usePbPersonasList,
  usePbWorkspaceCreate,
  usePbMessageSend,
  usePbMessageUpdate,
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
  PbUserProfile,
} from "@/pb-compat";
import { api } from "@/pb-compat/api";
import { useAuth } from "@/pb-compat/auth";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Scope } from "./chat/types";
import { CreateWorkspaceModal } from "./chat/CreateWorkspaceModal";
import { DeleteSessionModal } from "./chat/DeleteSessionModal";
import { WorkspaceRail } from "./chat/WorkspaceRail";
import { SessionSidebar } from "./chat/SessionSidebar";
import { ChatHeader } from "./chat/ChatHeader";
import { MessageStream } from "./chat/MessageStream";
import { ChatInput } from "./chat/ChatInput";
import { ToolApprovalCard } from "./chat/ToolApprovalCard";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";


// Heavy modals / dashboard: lazy-load so they don't sit in the initial bundle.
// Dashboard is only mounted on the landing view (no active session).
const Dashboard = dynamic(
  () => import("./chat/Dashboard").then((m) => m.Dashboard),
  { ssr: false, loading: () => null },
);
type AIProvider = string;
type ProviderConfig = { apiKey?: string; baseUrl?: string; modelId?: string };
type ProviderConfigs = Record<string, ProviderConfig>;
type ChatProps = {
  isLoaded?: boolean;
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

export function Chat({
  isLoaded,
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
  const updateMessage = usePbMessageUpdate();
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
        isLoaded={isLoaded}
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
        layout={isLoaded ? "x" : false}
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
            updateMessage={updateMessage}
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
  updateMessage: any;
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
  updateMessage,
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
  const sdkToDbIdRef = useRef<Map<string, string>>(new Map());
  const [localScopes, setLocalScopes] = useState<Record<string, Scope>>({});
  const [isTyping, setIsTyping] = useState(false);

  // Clear local scopes and mappings when activeSessionId changes
  useEffect(() => {
    setLocalScopes({});
    sdkToDbIdRef.current.clear();
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

  const { messages: aiMessages, setMessages, sendMessage: sendVercelMessage, status, addToolApprovalResponse } = useChat({
    sendAutomaticallyWhen: ({ messages }) => {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role !== 'assistant') return false;
      const parts = lastMessage.parts ?? [];
      const toolParts = parts.filter((p: any) => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')));
      if (toolParts.length === 0) return false;
      // Only auto-submit when the user has responded to a pending approval request,
      // and there are no other pending approval requests waiting for action.
      const hasResponded = toolParts.some((p: any) => (p as any).state === 'approval-responded');
      const hasPending = toolParts.some((p: any) => (p as any).state === 'approval-requested');
      return hasResponded && !hasPending;
    },
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
            'x-active-workspace': activeWorkspaceId || "",
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

        const existingDbId = message.id ? sdkToDbIdRef.current.get(message.id) : undefined;
        let convexId;

        try {
          if (existingDbId) {
            try {
              convexId = await updateMessage(existingDbId, {
                text: textContent || "(tool execution)",
                reasoning,
                toolCalls,
              });
            } catch (err: any) {
              // Handle database 404 (stale cache/deleted record) by falling back to message creation
              if (err?.status === 404 || String(err).includes("404")) {
                console.warn(`[onFinish] Message record ${existingDbId} not found. Creating a new message in DB cache.`);
                sdkToDbIdRef.current.delete(message.id);
                convexId = await sendMessage({
                  sessionId: activeSessionId,
                  text: textContent || "(tool execution)",
                  author: "AI",
                  reasoning,
                  toolCalls,
                });
                if (convexId && message.id) {
                  sdkToDbIdRef.current.set(message.id, convexId);
                }
              } else {
                throw err;
              }
            }
          } else {
            convexId = await sendMessage({
              sessionId: activeSessionId,
              text: textContent || "(tool execution)",
              author: "AI",
              reasoning,
              toolCalls,
            });
            if (convexId && message.id) {
              sdkToDbIdRef.current.set(message.id, convexId);
            }
          }

          if (convexId && message.id) {
            idMapRef.current.set(convexId, message.id);
          }
        } catch (err) {
          console.error("[onFinish] Failed to save/update assistant message in DB cache:", err);
        }

        // Trigger AI title generation on first response (idempotent — skips if title already set)
        triggerAutoTitle({ sessionId: activeSessionId });
      }
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';
 
  // Extract pending tool approval requests from AI messages
  const pendingApprovals = useMemo(() => {
    const approvals: Array<{
      approvalId: string;
      toolName: string;
      args: Record<string, unknown>;
    }> = [];
    for (const m of aiMessages) {
      if (m.role !== 'assistant') continue;
      for (const part of m.parts ?? []) {
        const isToolPart = part.type === 'dynamic-tool' || (typeof part.type === 'string' && part.type.startsWith('tool-'));
        if (!isToolPart) continue;
        const tp = part as any;
        if (tp.state !== 'approval-requested' || !tp.approval?.id) continue;
        const toolName = part.type === 'dynamic-tool'
          ? tp.toolName
          : part.type.split('-').slice(1).join('-');
        approvals.push({
          approvalId: tp.approval.id,
          toolName,
          args: typeof tp.input === 'object' && tp.input ? tp.input as Record<string, unknown> : {},
        });
      }
    }
    return approvals;
  }, [aiMessages]);

  // Debug: log approval state changes
  useEffect(() => {
    if (pendingApprovals.length > 0) {
      console.log('[ToolApproval] Found pending approvals:', JSON.stringify(pendingApprovals), 'status:', status);
    }
    for (const m of aiMessages) {
      if (m.role !== 'assistant') continue;
      const toolParts = (m.parts ?? []).filter(p => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')))
        .map(p => { const tp = p as any; return { type: p.type, state: tp.state, toolName: tp.toolName || p.type.split('-').slice(1).join('-'), hasApproval: !!tp.approval?.id }; });
      if (toolParts.length > 0) {
        console.log('[ToolApproval] Assistant tool parts:', JSON.stringify(toolParts));
      }
    }
  }, [aiMessages, status, pendingApprovals]);

  // Vercel AI SDK vs Convex Sync (Hybrid Approach)
  useEffect(() => {
    if (messages && !isLoading) {
      const hasConvexCaughtUp = messages.length > aiMessages.length;

      if (hasConvexCaughtUp || aiMessages.length === 0) {
        const seenIds = new Set<string>();
        const mappedHistory = messages.map(m => {
          const parts: any[] = [];
          if (m.reasoning) {
            const splitReasoning = m.reasoning.split('\n[---DIALOGUE_REASONING_SPLIT---]\n');
            for (const rText of splitReasoning) {
              parts.push({
                type: "reasoning" as const,
                reasoning: rText,
                text: rText,
                details: [],
              });
            }
          }
          parts.push({ type: "text" as const, text: m.text });

          if (m.toolCalls && m.toolCalls.length > 0) {
            m.toolCalls.forEach((tc: any, index: number) => {
              parts.push({
                type: "tool-call" as const,
                toolCallId: tc.id || `${m._id}-tool-${index}`,
                toolName: tc.name,
                args: tc.args,
              });
            });
          }

          let sdkId = idMapRef.current.get(m._id) || m._id;
          if (seenIds.has(sdkId)) {
            sdkId = `${sdkId}-dup-${m._id}`;
          }
          seenIds.add(sdkId);

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

  // Set the sync callback
  useEffect(() => {
    if (activeSyncRef) {
      activeSyncRef.current = async () => {
        const syncText = "Sync my workspace.";
        setIsTyping(true);
        try {
          const aiPromise = sendVercelMessage({ text: syncText });
          await Promise.all([
            sendMessage({
              sessionId: activeSessionId,
              text: syncText,
              author: "User",
              brief: true,
              timezoneOffset: new Date().getTimezoneOffset(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              provider,
            }),
            aiPromise
          ]);
        } catch (err) {
          console.error("Failed to sync workspace:", err);
        } finally {
          setIsTyping(false);
        }
      };
    }
    return () => {
      if (activeSyncRef) activeSyncRef.current = null;
    };
  }, [activeSessionId, provider, sendMessage, sendVercelMessage, activeSyncRef]);

  // Fire the AI call for new-chat initial messages once the activeSessionId has settled
  useEffect(() => {
    const pending = pendingInitialMessageRef.current;
    if (!pending || pending.sessionId !== activeSessionId || isLoading) return;
    pendingInitialMessageRef.current = null;

    const trigger = async () => {
      setIsTyping(true);
      try {
        const aiPromise = sendVercelMessage({ text: pending.text });
        await Promise.all([
          sendMessage({
            sessionId: activeSessionId,
            text: pending.text,
            author: "User",
            timezoneOffset: new Date().getTimezoneOffset(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            provider,
          }),
          aiPromise
        ]);
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
    
    const seenIds = new Set<string>();
    return aiMessages.map((m, idx) => {
      const textParts = m.parts ? m.parts.filter(p => p.type === 'text') : [];
      const reasoningParts = m.parts ? m.parts.filter(p => p.type === 'reasoning') : [];
      
      const text = textParts.length > 0 
        ? textParts.map(p => (p as any).text).join('') 
        : (m as any).content || '';
        
      const reasoning = reasoningParts.length > 0
        ? reasoningParts.map(p => (p as any).reasoning || (p as any).text).join('\n\n')
        : (m as any).reasoning || undefined;

      let msgId = m.id;
      if (seenIds.has(msgId)) {
        msgId = `${msgId}-dup-${idx}`;
      }
      seenIds.add(msgId);

      return {
        _id: msgId,
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
        pendingScopeRef.current = scope ?? null;
        aiPromise = sendVercelMessage({ text: textMessageContent });

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
        isTyping={isTyping || isLoading}
        isSyncing={isSyncing}
        isLargeViewport={isLargeViewport}
        keyboardOffset={keyboardOffset}
        onTypingDone={handleTypingDone}
        agentName={activePersona?.name}
        onLoadOlder={loadOlderMessages}
        canLoadOlder={messagesPaginated.status === "CanLoadMore"}
        isLoadingOlder={false}
        provider={provider}
      >
        {pendingApprovals.length > 0 && (
          <div className="space-y-2 px-4">
            {pendingApprovals.map((pa) => (
              <ToolApprovalCard
                key={pa.approvalId}
                approvalId={pa.approvalId}
                toolName={pa.toolName}
                args={pa.args}
                onApprove={() => addToolApprovalResponse({ id: pa.approvalId, approved: true })}
                onDecline={() => addToolApprovalResponse({ id: pa.approvalId, approved: false, reason: 'User declined' })}
              />
            ))}
          </div>
        )}
      </MessageStream>

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
