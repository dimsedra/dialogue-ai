"use client";

import { useQuery, useMutation, useConvex, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useCallback } from "react";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useAuthActions } from "@convex-dev/auth/react";
import { processLocalLLMRequest } from "../lib/lmstudio";
import { EnrichedToolArgs, Scope } from "./chat/types";
import { CreateWorkspaceModal } from "./chat/CreateWorkspaceModal";
import { DeleteSessionModal } from "./chat/DeleteSessionModal";
import { WorkspaceRail } from "./chat/WorkspaceRail";
import { SessionSidebar } from "./chat/SessionSidebar";
import { ChatHeader } from "./chat/ChatHeader";
import { MessageStream } from "./chat/MessageStream";
import { Dashboard } from "./chat/Dashboard";
import { ReflectionWrappedModal } from "./chat/ReflectionWrappedModal";
import { exportReflectionAsImage } from "../utils/exportReflectionImage";
import { ChatInput } from "./chat/ChatInput";
import { motion } from "framer-motion";

type AIProvider = "gemini" | "lmstudio" | "openai" | "anthropic";
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
  activeSessionId: Id<"chatSessions"> | null;
  setActiveSessionIdAction: (id: Id<"chatSessions"> | null) => void;
  activeWorkspaceId: Id<"workspaces"> | undefined;
  setActiveWorkspaceIdAction: (
    id: Id<"workspaces"> | undefined,
    sessionId?: Id<"chatSessions"> | null,
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
  const workspaces = useQuery(api.workspaces.list, {});
  const sessions = useQuery(api.messages.listSessions, {
    workspaceId: activeWorkspaceId,
  });
  // All sessions across every workspace — used only by the Dashboard landing view
  const allSessions = useQuery(api.messages.listSessions, {
    allWorkspaces: true,
  });
  const messages = useQuery(
    api.messages.list,
    activeSessionId ? { sessionId: activeSessionId } : "skip",
  );
  const profile = useQuery(api.ai.getProfile, {});
  const personas = useQuery(api.personas.list);

  const activeSession = sessions?.find((s) => s._id === activeSessionId);
  const activePersona =
    personas?.find((p) => p._id === activeSession?.agentPersonaId) ||
    personas?.find((p) => p.isDefault);

  const createWorkspace = useMutation(api.workspaces.create);
  const sendMessage = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const createSession = useMutation(api.messages.createSession);
  const deleteSession = useMutation(api.messages.deleteSession);

  const { signOut } = useAuthActions();

  // Tool Mutations for local LLM
  const addTask = useMutation(api.ai.addTask);
  const addEvent = useMutation(api.events.add);
  const updateEvent = useMutation(api.events.update);
  const updateOccurrence = useMutation(api.events.updateOccurrence);
  const deleteEvent = useMutation(api.events.remove);
  const completeTask = useMutation(api.tasks.toggleCompleted);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const updateUserBio = useMutation(api.ai.updateProfile);
  const saveSemanticMemory = useAction(api.ai_action.saveSemanticMemoryAction);
  const deleteSemanticMemory = useMutation(api.ai.deleteMemory);
  const updatePreferences = useMutation(api.ai.updatePreferences);

  const convex = useConvex();

  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{
    id: Id<"chatSessions">;
    title: string;
  } | null>(null);
  const [openReflectionId, setOpenReflectionId] = useState<Id<"reflections"> | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const isSyncing = !!(activeSessionId && messages === undefined);

  const [provider, setProvider] = useState<AIProvider>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("dialogue_provider") as AIProvider) || "gemini"
      );
    }
    return "gemini";
  });

  const [lastSyncedProfileId, setLastSyncedProfileId] =
    useState<Id<"userProfile"> | null>(null);

  // Sync provider with DB profile during render
  if (profile && profile._id !== lastSyncedProfileId) {
    setLastSyncedProfileId(profile._id);
    if (
      profile.preferences?.provider &&
      profile.preferences.provider !== provider
    ) {
      setProvider(profile.preferences.provider as AIProvider);
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

  const getActiveModelName = (): string => {
    const customConfigs = profile?.preferences?.customConfigs as
      | ProviderConfigs
      | undefined;
    const config = customConfigs?.[provider];
    if (config?.modelId) {
      return config.modelId;
    }
    switch (provider) {
      case "gemini":
        return "gemini-3.1-flash";
      case "openai":
        return "gpt-5.5";
      case "anthropic":
        return "claude-sonnet";
      case "lmstudio":
        return "local";
      default:
        return "ai";
    }
  };

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

  // ---- Shared helper: run LM Studio logic for a given session + text ----
  const runLocalLLMForSession = useCallback(
    async (
      sessionId: Id<"chatSessions">,
      userText: string,
      opts?: { brief?: boolean; scope?: Scope | null },
    ) => {
      try {
        const promptCtx = await convex.query(api.ai.getPromptContext, {
          sessionId,
          timezoneOffset: new Date().getTimezoneOffset(),
          ...(opts?.brief !== undefined ? { brief: opts.brief } : {}),
          ...(opts?.scope ? { scope: opts.scope } : {}),
        });

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
                const oldTask = await convex.query(api.tasks.get, {
                  id: args.taskId as Id<"tasks">,
                });
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
                  id: args.taskId as Id<"tasks">,
                  timezoneOffset: promptCtx.timezoneOffset ?? undefined,
                  ...taskUpdates,
                });

                enrichedArgs.titleHint = oldTask?.text;
                enrichedArgs.oldValues = oldTask
                  ? {
                      text: oldTask.text,
                      priority: oldTask.priority,
                      category: oldTask.category,
                      dueDate: oldTask.dueDate,
                      completed: oldTask.completed,
                    }
                  : undefined;
              }
            } else if (name === "addEvent" || name === "updateEvent") {
              if (name === "addEvent") {
                const startTime = parseLocal(args.startTime as string);
                const endTime = args.endTime
                  ? parseLocal(args.endTime as string)
                  : undefined;
                const eventType =
                  (args.eventType as "interval" | "point") ||
                  (args.endTime ? "interval" : "point");
                const recurrenceInput = toRecurrenceInput(args.recurrence);
                const recurrence = recurrenceInput
                  ? {
                      frequency: recurrenceInput.frequency,
                      interval: recurrenceInput.interval,
                      daysOfWeek: recurrenceInput.daysOfWeek,
                      until: recurrenceInput.until
                        ? parseLocal(recurrenceInput.until)
                        : undefined,
                    }
                  : undefined;

                await addEvent({
                  title: (args.title as string) || "Untitled Event",
                  location: args.location as string | undefined,
                  description: args.description as string | undefined,
                  notes: args.notes as string | undefined,
                  outcome: args.outcome as string | undefined,
                  statusHook: args.statusHook as string | undefined,
                  startTime,
                  endTime,
                  eventType,
                  recurrence,
                  workspaceId: promptCtx.workspaceId ?? undefined,
                });
              } else {
                const oldEvent = await convex.query(api.events.get, {
                  id: args.eventId as Id<"events">,
                });
                const updates: EventUpdateFields = {};
                if (args.title) updates.title = args.title as string;
                if (args.location) updates.location = args.location as string;
                if (args.notes) updates.notes = args.notes as string;
                if (args.outcome) updates.outcome = args.outcome as string;
                if (args.statusHook)
                  updates.statusHook = args.statusHook as string;
                if (args.startTime)
                  updates.startTime = parseLocal(args.startTime as string);
                if (args.endTime)
                  updates.endTime = parseLocal(args.endTime as string);
                if (args.eventType)
                  updates.eventType = args.eventType as "interval" | "point";
                if (args.cancelled !== undefined)
                  updates.cancelled = args.cancelled as boolean;
                const recurrenceInput = toRecurrenceInput(args.recurrence);
                if (recurrenceInput) {
                  updates.recurrence = {
                    frequency: recurrenceInput.frequency,
                    interval: recurrenceInput.interval,
                    daysOfWeek: recurrenceInput.daysOfWeek,
                    until: recurrenceInput.until
                      ? parseLocal(recurrenceInput.until)
                      : undefined,
                  };
                }

                await updateEvent({
                  id: args.eventId as Id<"events">,
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
                    }
                  : undefined;
              }
            } else if (name === "deleteEvent") {
              const event = await convex.query(api.events.get, {
                id: args.eventId as Id<"events">,
              });
              await deleteEvent({ id: args.eventId as Id<"events"> });
              enrichedArgs.titleHint = event?.title;
            } else if (name === "updateEventOccurrence") {
              const oldEvent = await convex.query(api.events.get, {
                id: args.seriesId as Id<"events">,
              });
              await updateOccurrence({
                seriesId: args.seriesId as Id<"events">,
                originalStartTime: parseLocal(args.originalStartTime as string),
                startTime: args.startTime
                  ? parseLocal(args.startTime as string)
                  : undefined,
                endTime: args.endTime
                  ? parseLocal(args.endTime as string)
                  : undefined,
                eventType: args.eventType
                  ? (args.eventType as "interval" | "point")
                  : undefined,
                title: args.title as string | undefined,
                location: args.location as string | undefined,
                cancelled:
                  args.cancelled !== undefined
                    ? (args.cancelled as boolean)
                    : undefined,
              });
              enrichedArgs.titleHint =
                (args.title as string | undefined) ?? oldEvent?.title;
            } else if (name === "completeTask") {
              const task = await convex.query(api.tasks.get, {
                id: args.taskId as Id<"tasks">,
              });
              await completeTask({ id: args.taskId as Id<"tasks"> });
              enrichedArgs.titleHint = task?.text;
            } else if (name === "deleteTask") {
              const task = await convex.query(api.tasks.get, {
                id: args.taskId as Id<"tasks">,
              });
              await deleteTask({ id: args.taskId as Id<"tasks"> });
              enrichedArgs.titleHint = task?.text;
            } else if (name === "updateUserBio") {
              await updateUserBio({ bio: args.bio as string });
              enrichedArgs.oldBio = profile?.bio;
            } else if (name === "saveSemanticMemory") {
              await saveSemanticMemory({ text: args.text as string });
            } else if (name === "deleteSemanticMemory") {
              await deleteSemanticMemory({
                id: args.memoryId as Id<"memories">,
              });
            } else if (name === "searchHistoricalEntities") {
              const histArgs = args as {
                type: "tasks" | "events" | "all";
                query?: string;
                startTime?: number;
                endTime?: number;
                limit?: number;
              };

              let results: unknown[] = [];
              const limit = histArgs.limit ?? 20;

              if (histArgs.type === "tasks" || histArgs.type === "all") {
                const tasks = await convex.query(api.tasks.searchHistory, {
                  query: histArgs.query,
                  startTime: histArgs.startTime,
                  endTime: histArgs.endTime,
                  limit,
                });
                results = results.concat(
                  tasks.map((t) => ({
                    type: "task" as const,
                    id: t._id,
                    text: t.text,
                    completedAt: t.completedAt,
                    category: t.category,
                    priority: t.priority,
                  })),
                );
              }

              if (histArgs.type === "events" || histArgs.type === "all") {
                const events = await convex.query(api.events.searchHistory, {
                  query: histArgs.query,
                  startTime: histArgs.startTime,
                  endTime: histArgs.endTime,
                  limit,
                });
                results = results.concat(
                  events.map((e) => ({
                    type: "event",
                    id: e._id,
                    title: e.title,
                    startTime: e.startTime,
                    location: e.location,
                  })),
                );
              }

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

              const ids = await convex.mutation(api.tasks.batchAdd, {
                tasks: parsedTasks,
                workspaceId: promptCtx.workspaceId ?? undefined,
              });
              enrichedArgs.ids = ids;
              enrichedArgs.count = ids.length;
            } else if (name === "getTaskNotes") {
              const task = await convex.query(api.tasks.get, {
                id: args.taskId as Id<"tasks">,
              });
              enrichedArgs.notes = task?.notes || null;
              enrichedArgs.hasNotes = !!task?.notes;
              enrichedArgs.titleHint = task?.text;
            } else if (name === "listWorkspaces") {
              const workspaces = await convex.query(api.workspaces.list, {});
              enrichedArgs.workspaces = workspaces;
            } else if (name === "create_habit") {
              const habitId = await convex.mutation(api.habits.createHabit, {
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
              const logId = await convex.mutation(api.habits.logHabit, {
                habitId: args.habitId as Id<"habits">,
                dateString: args.dateString as string,
                status: args.status as "completed" | "skipped",
                notes: args.notes as string | undefined,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
              const habit = await convex.query(api.habits.get, {
                id: args.habitId as Id<"habits">,
              });
              enrichedArgs.logId = logId;
              enrichedArgs.newStreak = habit?.currentStreak || 0;
              enrichedArgs.titleHint = habit?.name;
            } else if (name === "get_habit_consistency") {
              const report = await convex.query(
                api.habits.getHabitConsistency,
                {
                  workspaceId: promptCtx.workspaceId ?? undefined,
                  periodStartDate: args.periodStartDate as string,
                  periodEndDate: args.periodEndDate as string,
                },
              );
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
      convex,
      deleteEvent,
      deleteSemanticMemory,
      deleteTask,
      messages,
      profile?.bio,
      profile?.name,
      saveSemanticMemory,
      sendMessage,
      updateEvent,
      updateOccurrence,
      updateTask,
      updateUserBio,
    ],
  );

  // ---- Sync handler (used by both the sidebar button and TaskPanel) ----
  const handleSync = async () => {
    const syncText = "Sync my workspace.";
    let sessionId = activeSessionId;

    if (!sessionId) {
      sessionId = await createSession({
        title: `Sync - ${new Date().toLocaleDateString()}`,
        workspaceId: activeWorkspaceId,
      });
      setActiveSessionIdAction(sessionId);
    }

    await sendMessage({
      sessionId,
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
        await runLocalLLMForSession(sessionId as Id<"chatSessions">, syncText, {
          brief: true,
        });
      } finally {
        setIsTyping(false);
      }
    }
    // Gemini path: the Convex scheduler handles it automatically via messages.send
  };

  // Expose handleSync to parent via ref (placed after declaration)
  useEffect(() => {
    if (onSyncRef) onSyncRef.current = handleSync;
  });

  // ---- Send handler: receives (text, files, scope) from ChatInput, handles upload + message + LLM ----
  const handleSend = useCallback(
    async (userText: string, files: File[], scope?: Scope | null) => {
      if (!activeSessionId) return;

      try {
        // Parallel uploads
        const uploadPromises = files.map(async (file) => {
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
          text:
            userText ||
            (uploadedAttachments.length > 0
              ? `Attached ${uploadedAttachments.length} files`
              : ""),
          author: "User",
          timezoneOffset: new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          provider,
          attachments:
            uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          scope: scope || undefined,
        });

        setIsTyping(true);

        if (provider === "lmstudio") {
          try {
            await runLocalLLMForSession(activeSessionId, userText, { scope });
          } finally {
            setIsTyping(false);
          }
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        setIsTyping(false);
      }
    },
    [
      activeSessionId,
      provider,
      generateUploadUrl,
      runLocalLLMForSession,
      sendMessage,
    ],
  );

  const handleNewChat = async (
    workspaceOverride?: Id<"workspaces"> | null,
    agentPersonaId?: Id<"agentPersonas">,
    initialMessage?: string,
  ) => {
    const wsId =
      workspaceOverride === null
        ? undefined
        : workspaceOverride || activeWorkspaceId;
    const title = initialMessage
      ? initialMessage.length > 30
        ? initialMessage.substring(0, 30) + "..."
        : initialMessage
      : `Chat ${new Date().toLocaleTimeString()}`;

    const id = await createSession({
      title,
      workspaceId: wsId,
      agentPersonaId:
        agentPersonaId === "default_dialogue" ? undefined : agentPersonaId,
    });
    if (wsId !== activeWorkspaceId && wsId) {
      setActiveWorkspaceIdAction(wsId);
    }
    setActiveSessionIdAction(id);
    if (!isLargeViewport) {
      setShowHistoryAction(false);
    }

    if (initialMessage) {
      try {
        await sendMessage({
          sessionId: id,
          text: initialMessage,
          author: "User",
          timezoneOffset: new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          provider,
        });

        setIsTyping(true);

        if (provider === "lmstudio") {
          try {
            await runLocalLLMForSession(id, initialMessage);
          } finally {
            setIsTyping(false);
          }
        }
      } catch (err) {
        console.error("Failed to send initial message:", err);
        setIsTyping(false);
      }
    }
  };

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
    (w: Doc<"workspaces">) => w._id === activeWorkspaceId,
  );

  const handleDeleteChat = async (
    id: Id<"chatSessions">,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const session = sessions?.find((s: Doc<"chatSessions">) => s._id === id);
    if (session) {
      setConfirmDeleteSession({
        id,
        title: session.title || "Untitled Session",
      });
    }
  };

  const executeDeleteChat = async (id: Id<"chatSessions">) => {
    await deleteSession({ id });
    if (activeSessionId === id) {
      setActiveSessionIdAction(null);
    }
    setConfirmDeleteSession(null);
  };

  const handleTypingDone = useCallback(() => {
    setIsTyping(false);
  }, []);

  // When selecting a session from the Dashboard, switch to its workspace if needed
  const handleDashboardSelectSession = useCallback(
    (id: Id<"chatSessions">) => {
      const session = allSessions?.find(
        (s: Doc<"chatSessions">) => s._id === id,
      );
      if (session?.workspaceId && session.workspaceId !== activeWorkspaceId) {
        setActiveWorkspaceIdAction(session.workspaceId);
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
          <>
            <ChatHeader
              activeSessionTitle={
                activeSessionId
                  ? sessions?.find(
                      (s: Doc<"chatSessions">) => s._id === activeSessionId,
                    )?.title
                  : undefined
              }
              currentWorkspace={currentWorkspace}
              activeWorkspaceId={activeWorkspaceId}
              workspaces={workspaces}
              messageCount={messages?.length || 0}
              provider={provider}
              activeModelName={getActiveModelName()}
              isLargeViewport={isLargeViewport}
              onProviderChange={handleProviderChange}
              onSignOut={() => signOut()}
              onShowHistory={() => setShowHistoryAction(true)}
              onShowTasks={onShowTasksAction}
            />

            <MessageStream
              messages={messages}
              activeSessionId={activeSessionId}
              isTyping={isTyping}
              isSyncing={isSyncing}
              isLargeViewport={isLargeViewport}
              keyboardOffset={keyboardOffset}
              onTypingDone={handleTypingDone}
              agentName={activePersona?.name}
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
          const data = await convex.query(api.reflections.getReflection, { id });
          if (data) await exportReflectionAsImage(data);
        }}
      />
    </div>
  );
}
