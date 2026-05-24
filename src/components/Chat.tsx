"use client";

import { useQuery, useMutation, useConvex, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useCallback } from "react";
import { Id } from "../../convex/_generated/dataModel";
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
import { ChatInput } from "./chat/ChatInput";
import { motion } from "framer-motion";





export function Chat({ 
  activeSessionId, 
  setActiveSessionId,
  activeWorkspaceId,
  setActiveWorkspaceId,
  activeScope,
  setActiveScope,
  showHistory,
  setShowHistory,
  onSyncRef,
  isLargeViewport,
  keyboardOffset,
  onChatInputResize,
  onShowTasks,
}: { 
  activeSessionId: Id<"chatSessions"> | null, 
  setActiveSessionId: (id: Id<"chatSessions"> | null) => void,
  activeWorkspaceId: Id<"workspaces"> | undefined,
  setActiveWorkspaceId: (id: Id<"workspaces"> | undefined, sessionId?: Id<"chatSessions"> | null) => void,
  activeScope: Scope | null,
  setActiveScope: (scope: Scope | null) => void,
  showHistory: boolean,
  setShowHistory: (show: boolean) => void,
  onSyncRef?: React.MutableRefObject<(() => void) | null>,
  isLargeViewport: boolean,
  keyboardOffset: number,
  onChatInputResize?: (offset: number) => void
  onShowTasks?: () => void,
}) {
  const workspaces = useQuery(api.workspaces.list, {});
  const sessions = useQuery(api.messages.listSessions, { workspaceId: activeWorkspaceId });
  const messages = useQuery(api.messages.list, activeSessionId ? { sessionId: activeSessionId } : "skip");
  const profile = useQuery(api.ai.getProfile, {});
  
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
  const saveReflection = useMutation(api.reflections.saveReflection);
  const updatePreferences = useMutation(api.ai.updatePreferences);

  const convex = useConvex();

  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{ id: Id<"chatSessions">; title: string } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const isSyncing = !!(activeSessionId && messages === undefined);

  type AIProvider = "gemini" | "lmstudio" | "openai" | "anthropic";

  const [provider, setProvider] = useState<AIProvider>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dialogue_provider") as AIProvider) || "gemini";
    }
    return "gemini";
  });

  const [lastSyncedProfileId, setLastSyncedProfileId] = useState<Id<"userProfile"> | null>(null);

  // Sync provider with DB profile during render
  if (profile && profile._id !== lastSyncedProfileId) {
    setLastSyncedProfileId(profile._id);
    if (profile.preferences?.provider && profile.preferences.provider !== provider) {
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
    const customConfigs = profile?.preferences?.customConfigs as Record<string, { apiKey?: string, baseUrl?: string, modelId?: string }> | undefined;
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
    if (sessions && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0]._id);
    }
  }, [sessions, activeSessionId, setActiveSessionId]);

  // ---- Shared helper: run LM Studio logic for a given session + text ----
  const runLocalLLMForSession = async (
    sessionId: Id<"chatSessions">,
    userText: string,
    opts?: { brief?: boolean; scope?: Scope | null }
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
            return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)).getTime();
          }
          return new Date(s).getTime();
        };

        const executedCalls: Array<{ name: string; args: Record<string, unknown>; result?: unknown }> = [];

        for (const tc of result.toolCalls) {
          const { name, args } = tc;
          const enrichedArgs = { ...args } as EnrichedToolArgs;

          if (name === "addTask" || name === "updateTask") {
            if (name === "addTask") {
              await addTask({ 
                text: (args.text as string) || "New Task",
                priority: args.priority as "low" | "medium" | "high" | undefined,
                category: args.category as string | undefined,
                notes: args.notes as string | undefined,
                progress: args.progress !== undefined ? Number(args.progress) : undefined,
                statusHook: args.statusHook as string | undefined,
                dueDate: args.dueDate ? parseLocal(args.dueDate as string) : undefined,
                workspaceId: promptCtx.workspaceId ?? undefined,
              });
            } else {
              const oldTask = await convex.query(api.tasks.get, { id: args.taskId as Id<"tasks"> });
              const taskUpdates: Record<string, string | number | boolean | undefined> = {};
              if (args.text) taskUpdates.text = args.text as string;
              if (args.completed !== undefined) taskUpdates.completed = args.completed as boolean;
              if (args.priority) taskUpdates.priority = args.priority as "low" | "medium" | "high";
              if (args.category) taskUpdates.category = args.category as string;
              if (args.notes) taskUpdates.notes = args.notes as string;
              if (args.progress !== undefined) taskUpdates.progress = Number(args.progress);
              if (args.statusHook !== undefined) taskUpdates.statusHook = args.statusHook as string;
              if (args.dueDate) taskUpdates.dueDate = parseLocal(args.dueDate as string);

              await updateTask({
                id: args.taskId as Id<"tasks">,
                timezoneOffset: promptCtx.timezoneOffset ?? undefined,
                ...taskUpdates
              });

              enrichedArgs.titleHint = oldTask?.text;
              enrichedArgs.oldValues = oldTask ? {
                text: oldTask.text,
                priority: oldTask.priority,
                category: oldTask.category,
                dueDate: oldTask.dueDate,
                completed: oldTask.completed
              } : undefined;
            }
          }
          else if (name === "addEvent" || name === "updateEvent") {
            if (name === "addEvent") {
              const startTime = parseLocal(args.startTime as string);
              const endTime = args.endTime ? parseLocal(args.endTime as string) : undefined;
              const eventType = (args.eventType as "interval" | "point") || (args.endTime ? "interval" : "point");
              const recurrence = args.recurrence ? {
                frequency: (args.recurrence as any).frequency as "daily" | "weekly",
                interval: (args.recurrence as any).interval as number,
                daysOfWeek: (args.recurrence as any).daysOfWeek as number[] | undefined,
                until: (args.recurrence as any).until ? parseLocal((args.recurrence as any).until as string) : undefined,
              } : undefined;
              
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
              const oldEvent = await convex.query(api.events.get, { id: args.eventId as Id<"events"> });
              const updates: Record<string, any> = {};
              if (args.title) updates.title = args.title as string;
              if (args.location) updates.location = args.location as string;
              if (args.notes) updates.notes = args.notes as string;
              if (args.outcome) updates.outcome = args.outcome as string;
              if (args.statusHook) updates.statusHook = args.statusHook as string;
              if (args.startTime) updates.startTime = parseLocal(args.startTime as string);
              if (args.endTime) updates.endTime = parseLocal(args.endTime as string);
              if (args.eventType) updates.eventType = args.eventType as string;
              if (args.recurrence) {
                updates.recurrence = {
                  frequency: (args.recurrence as any).frequency,
                  interval: (args.recurrence as any).interval,
                  daysOfWeek: (args.recurrence as any).daysOfWeek,
                  until: (args.recurrence as any).until ? parseLocal((args.recurrence as any).until as string) : undefined,
                };
              }

              await updateEvent({
                id: args.eventId as Id<"events">,
                timezoneOffset: promptCtx.timezoneOffset ?? undefined,
                ...updates
              });

              enrichedArgs.titleHint = oldEvent?.title;
              enrichedArgs.oldValues = oldEvent ? {
                title: oldEvent.title,
                startTime: oldEvent.startTime,
                endTime: oldEvent.endTime,
                location: oldEvent.location,
              } : undefined;
            }
          }
          else if (name === "deleteEvent") {
            const event = await convex.query(api.events.get, { id: args.eventId as Id<"events"> });
            await deleteEvent({ id: args.eventId as Id<"events"> });
            enrichedArgs.titleHint = event?.title;
          }
          else if (name === "updateEventOccurrence") {
            const oldEvent = await convex.query(api.events.get, { id: args.seriesId as Id<"events"> });
            await updateOccurrence({
              seriesId: args.seriesId as Id<"events">,
              originalStartTime: parseLocal(args.originalStartTime as string),
              startTime: args.startTime ? parseLocal(args.startTime as string) : undefined,
              endTime: args.endTime ? parseLocal(args.endTime as string) : undefined,
              eventType: args.eventType ? (args.eventType as "interval" | "point") : undefined,
              title: args.title as string | undefined,
              location: args.location as string | undefined,
            });
            enrichedArgs.titleHint = (args.title as string | undefined) ?? oldEvent?.title;
          }
          else if (name === "completeTask") {
            const task = await convex.query(api.tasks.get, { id: args.taskId as Id<"tasks"> });
            await completeTask({ id: args.taskId as Id<"tasks"> });
            enrichedArgs.titleHint = task?.text;
          }
          else if (name === "deleteTask") {
            const task = await convex.query(api.tasks.get, { id: args.taskId as Id<"tasks"> });
            await deleteTask({ id: args.taskId as Id<"tasks"> });
            enrichedArgs.titleHint = task?.text;
          }
          else if (name === "updateUserBio") {
            await updateUserBio({ bio: args.bio as string });
            enrichedArgs.oldBio = profile?.bio;
          }
          else if (name === "saveSemanticMemory") {
            await saveSemanticMemory({ text: args.text as string });
          }
          else if (name === "triggerReflection") {
            const reflArgs = args as {
              type: "weekly" | "monthly" | "yearly";
              offsetWeeks?: number;
              offsetMonths?: number;
              offsetYears?: number;
            };

            const type = reflArgs.type;
            const offset = type === "weekly"
              ? (reflArgs.offsetWeeks ?? 0)
              : type === "monthly"
                ? (reflArgs.offsetMonths ?? 0)
                : (reflArgs.offsetYears ?? 0);

            const { startMs, endMs } = getPeriodRange(type, offset, promptCtx.timezoneOffset);
            const periodLabel = getPeriodLabel(type, startMs, promptCtx.timezoneOffset);

            const stats = await convex.query(api.reflections.compileReflectionStats, {
              workspaceId: promptCtx.workspaceId ?? undefined,
              type,
              periodStart: startMs,
              periodEnd: endMs,
            });

            if (stats) {
              const statsText = `
                Type: ${type}
                Period: ${periodLabel}
                Tasks Completed: ${stats.tasksCompleted}
                Tasks Created: ${stats.tasksCreated}
                Events Attended: ${stats.eventsAttended}
                Top Categories: ${stats.topCategories?.join(", ") || "None"}
                Streak Days: ${stats.streakDays || 0}
                
                ${stats.subSummaries ? `SUB-PERIOD SUMMARIES:\n${stats.subSummaries}` : ""}
                ${stats.rawDetails ? `RAW LOGS:\n${stats.rawDetails}` : ""}
              `;

              const summaryPrompt = `
                You are Dialogue, a productivity companion.
                Create a high-fidelity, Spotify-Wrapped style periodic reflection summary.
                Keep it highly engaging, celebratory, motivating, but honest.
                Use bullet points, emojis, bold text, and highlights.
                Draw connections between tasks and events if possible.
                Address the user by name: "${profile?.name || "User"}".
                
                Stats data:
                ${statsText}
                
                CRITICAL INSTRUCTION:
                1. Make it feel extremely personalized and premium.
                2. Write the ENTIRE reflection summary, all bullet points, and the concluding question in the same language as the user's query: "${userText.replace(/"/g, '\\"')}".
                   - Detect the language of the user's query (e.g., English, Indonesian, Japanese, or any other language).
                   - You MUST translate and write everything (headings, stats summaries, list items, and the concluding question) in that exact query language.
                   - Ignore the language of the source tasks or events in the Stats data (which may be in Indonesian). The query's language is the ONLY language allowed for the output.
                3. Conclude with a single open-ended question in that query language inviting the user's feedback/reflection on their progress (e.g., "How do you feel about this week's progress?"). Do NOT output any internal formatting, instructions, or robotic tags.
              `;

              try {
                const response = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.NEXT_PUBLIC_LM_API_TOKEN || "lm-studio"}` 
                  },
                  body: JSON.stringify({
                    model: "local-model",
                    messages: [
                      { role: "user", content: summaryPrompt }
                    ],
                    temperature: 0.7,
                  }),
                });

                if (response.ok) {
                  const data = await response.json();
                  let summaryText = data.choices[0].message.content || "";
                  summaryText = summaryText
                    .replace(/^(?:DO NOT|CRITICAL|NOTE|IMPORTANT|INSTRUCTION|RULE|SYSTEM|MANDATORY):?.*\n+/gi, "")
                    .trim();
                  if (/^[A-Z0-9 _,.\-:"'()]{10,}\n\n/.test(summaryText)) {
                    summaryText = summaryText.replace(/^[A-Z0-9 _,.\-:"'()]{10,}\n\n/, "").trim();
                  }

                  const reflectionId = await saveReflection({
                    workspaceId: promptCtx.workspaceId ?? undefined,
                    type,
                    periodStart: startMs,
                    periodEnd: endMs,
                    periodLabel,
                    summary: summaryText,
                    stats: {
                      tasksCompleted: stats.tasksCompleted,
                      tasksCreated: stats.tasksCreated,
                      eventsAttended: stats.eventsAttended,
                      topCategories: stats.topCategories || [],
                      streakDays: stats.streakDays,
                    },
                  });

                  enrichedArgs.reflectionId = reflectionId;
                  enrichedArgs.periodLabel = periodLabel;
                  enrichedArgs.summary = summaryText;
                  enrichedArgs.stats = {
                    tasksCompleted: stats.tasksCompleted,
                    tasksCreated: stats.tasksCreated,
                    eventsAttended: stats.eventsAttended,
                    topCategories: stats.topCategories || [],
                    streakDays: stats.streakDays,
                  };

                  aiTextOverride = summaryText;
                }
              } catch (err) {
                console.error("Local reflection synthesis failed:", err);
              }
            }
          }
          else if (name === "searchHistoricalEntities") {
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
              results = results.concat(tasks.map((t) => ({
                type: "task" as const,
                id: t._id,
                text: t.text,
                completedAt: t.completedAt,
                category: t.category,
                priority: t.priority,
              })));
            }

            if (histArgs.type === "events" || histArgs.type === "all") {
              const events = await convex.query(api.events.searchHistory, {
                query: histArgs.query,
                startTime: histArgs.startTime,
                endTime: histArgs.endTime,
                limit,
              });
              results = results.concat(events.map((e) => ({
                type: "event",
                id: e._id,
                title: e.title,
                startTime: e.startTime,
                location: e.location,
              })));
            }

            results = results.slice(0, limit);
            enrichedArgs.count = results.length;
            enrichedArgs.results = results;
          }
          else if (name === "batchAddTasks") {
            const batchArgs = args as {
              tasks: Array<{ text: string; priority?: string; category?: string; dueDate?: string; notes?: string }>;
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
          }
          else if (name === "getTaskNotes") {
            const task = await convex.query(api.tasks.get, { id: args.taskId as Id<"tasks"> });
            enrichedArgs.notes = task?.notes || null;
            enrichedArgs.hasNotes = !!task?.notes;
            enrichedArgs.titleHint = task?.text;
          }
          else if (name === "listWorkspaces") {
            const workspaces = await convex.query(api.workspaces.list, {});
            enrichedArgs.workspaces = workspaces;
          }

          const isOnlyContext = (name === "updateTask" && Object.keys(args).every(k => ["taskId", "notes", "progress", "statusHook"].includes(k)) && Object.keys(args).some(k => ["notes", "progress", "statusHook"].includes(k))) ||
            (name === "updateEvent" && Object.keys(args).every(k => ["eventId", "notes", "outcome", "statusHook"].includes(k)) && Object.keys(args).some(k => ["notes", "outcome", "statusHook"].includes(k)));

          if (!isOnlyContext) {
            executedCalls.push({ name, args: enrichedArgs, result: { status: "success" } });
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

    setIsTyping(true);

    if (provider === "lmstudio") {
      try {
        await runLocalLLMForSession(sessionId as Id<"chatSessions">, syncText, { brief: true });
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
  const handleSend = useCallback(async (userText: string, files: File[], scope?: Scope | null) => {
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
        text: userText || (uploadedAttachments.length > 0 ? `Attached ${uploadedAttachments.length} files` : ""),
        author: "User",
        timezoneOffset: new Date().getTimezoneOffset(),
        provider,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, provider, generateUploadUrl, sendMessage]);

  const handleNewChat = async (workspaceOverride?: Id<"workspaces">) => {
    const wsId = workspaceOverride || activeWorkspaceId || (workspaces && workspaces.length > 0 ? workspaces[0]._id : undefined);
    const id = await createSession({
      title: `Chat ${new Date().toLocaleTimeString()}`,
      workspaceId: wsId,
    });
    if (wsId !== activeWorkspaceId && wsId) {
      setActiveWorkspaceId(wsId);
    }
    setActiveSessionId(id);
    if (!isLargeViewport) {
      setShowHistory(false);
    }
  };

  const handleAddWorkspace = async (name: string) => {
    const colors = ["#d4a373", "#8b5cf6", "#ec4899", "#10b981", "#3b82f6"];
    const index = (workspaces?.length || 0) % colors.length;
    
    await createWorkspace({
      name,
      icon: "Briefcase",
      color: colors[index]
    });

    setIsCreatingWorkspace(false);
  };

  const currentWorkspace = workspaces?.find((w: any) => w._id === activeWorkspaceId);

  const handleDeleteChat = async (id: Id<"chatSessions">, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions?.find((s: any) => s._id === id);
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

  const handleTypingDone = useCallback(() => {
    setIsTyping(false);
  }, []);

  // When selecting a session from the Dashboard, switch to its workspace if needed
  const handleDashboardSelectSession = useCallback((id: Id<"chatSessions">) => {
    const session = sessions?.find((s: any) => s._id === id);
    if (session?.workspaceId && session.workspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(session.workspaceId);
    }
    setActiveSessionId(id);
    if (!isLargeViewport) {
      setShowHistory(false);
    }
  }, [sessions, activeWorkspaceId, setActiveWorkspaceId, setActiveSessionId, isLargeViewport, setShowHistory]);

  return (
    <div className="flex-1 flex overflow-hidden h-full relative">
      {/* Workspace Rail (The Focus) - Hidden on Mobile */}
      <WorkspaceRail
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        showHistory={showHistory}
        onSelectWorkspace={(id) => setActiveWorkspaceId(id)}
        onOpenCreateModal={() => setIsCreatingWorkspace(true)}
        onShowHistory={() => setShowHistory(true)}
      />

      {/* Sessions Sidebar */}
      <SessionSidebar
        sessions={sessions}
        workspaces={workspaces}
        activeSessionId={activeSessionId}
        activeWorkspaceId={activeWorkspaceId}
        showHistory={showHistory}
        isLargeViewport={isLargeViewport}
        onSelectSession={(id) => setActiveSessionId(id)}
        onSelectWorkspaceSession={(wsId, sessionId) => setActiveWorkspaceId(wsId, sessionId)}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onSelectWorkspace={(id) => setActiveWorkspaceId(id)}
        onOpenCreateWorkspace={() => setIsCreatingWorkspace(true)}
        onCloseHistory={() => setShowHistory(false)}
      />


      {/* Main Content Area */}
      <motion.div 
        layout
        className="flex-1 flex flex-col h-full min-w-0 relative bg-[#0f0e0c] overflow-hidden"
      >
        {!activeWorkspaceId ? (
          <Dashboard
            workspaces={workspaces}
            sessions={sessions}
            profile={profile}
            isLargeViewport={isLargeViewport}
            onNewChat={(wsId?: Id<"workspaces">) => handleNewChat(wsId)}
            onSelectSession={handleDashboardSelectSession}
            onShowHistory={() => setShowHistory(true)}
            onShowTasks={onShowTasks}
          />
        ) : (
          <>
            <ChatHeader
              activeSessionTitle={activeSessionId ? sessions?.find((s: any) => s._id === activeSessionId)?.title : undefined}
              currentWorkspace={currentWorkspace}
              activeWorkspaceId={activeWorkspaceId}
              workspaces={workspaces}
              messageCount={messages?.length || 0}
              provider={provider}
              activeModelName={getActiveModelName()}
              isLargeViewport={isLargeViewport}
              onProviderChange={handleProviderChange}
              onSignOut={() => signOut()}
              onShowHistory={() => setShowHistory(true)}
              onShowTasks={onShowTasks}
            />

            <MessageStream
              messages={messages}
              activeSessionId={activeSessionId}
              isTyping={isTyping}
              isSyncing={isSyncing}
              isLargeViewport={isLargeViewport}
              keyboardOffset={keyboardOffset}
              onTypingDone={handleTypingDone}
              agentName={currentWorkspace?.agentName}
            />

            <ChatInput
              activeSessionId={activeSessionId}
              isLargeViewport={isLargeViewport}
              keyboardOffset={keyboardOffset}
              activeScope={activeScope}
              setActiveScope={setActiveScope}
              onSend={handleSend}
              onChatInputResize={onChatInputResize}
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
    </div>
  );
}

function getPeriodRange(
  type: "weekly" | "monthly" | "yearly",
  offset: number,
  timezoneOffset?: number
) {
  const now = new Date();
  if (timezoneOffset !== undefined) {
    now.setTime(now.getTime() - timezoneOffset * 60000);
  }

  const periodStart = new Date(now);
  let periodEnd = new Date(now);

  if (type === "weekly") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    periodStart.setDate(now.getDate() + diffToMonday);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setDate(periodStart.getDate() - 7 * offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (type === "monthly") {
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setMonth(periodStart.getMonth() - offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodStart.getMonth() + 1);
    periodEnd.setDate(0);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (type === "yearly") {
    periodStart.setMonth(0, 1);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setFullYear(periodStart.getFullYear() - offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setFullYear(periodStart.getFullYear() + 1);
    periodEnd.setMonth(0, 0);
    periodEnd.setHours(23, 59, 59, 999);
  }

  let startMs = periodStart.getTime();
  let endMs = periodEnd.getTime();

  if (timezoneOffset !== undefined) {
    startMs = startMs + timezoneOffset * 60000;
    endMs = endMs + timezoneOffset * 60000;
  }

  const currentRealTimeMs = Date.now();
  if (endMs > currentRealTimeMs) {
    endMs = currentRealTimeMs;
  }

  return { startMs, endMs };
}

function getPeriodLabel(type: "weekly" | "monthly" | "yearly", startMs: number, timezoneOffset?: number) {
  const d = new Date(startMs);
  if (timezoneOffset !== undefined) {
    d.setTime(d.getTime() - timezoneOffset * 60000);
  }
  
  if (type === "weekly") {
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    return `Week of ${month} ${day}, ${year}`;
  } else if (type === "monthly") {
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();
    return `${month} ${year}`;
  } else {
    return `${d.getFullYear()}`;
  }
}


