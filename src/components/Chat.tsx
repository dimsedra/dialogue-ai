"use client";

import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useCallback } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { useAuthActions } from "@convex-dev/auth/react";
import { processLocalLLMRequest } from "../lib/lmstudio";
import { EnrichedToolArgs } from "./chat/types";
import { CreateWorkspaceModal } from "./chat/CreateWorkspaceModal";
import { DeleteSessionModal } from "./chat/DeleteSessionModal";
import { WorkspaceRail } from "./chat/WorkspaceRail";
import { SessionSidebar } from "./chat/SessionSidebar";
import { ChatHeader } from "./chat/ChatHeader";
import { MessageStream } from "./chat/MessageStream";
import { ChatInput } from "./chat/ChatInput";
import { motion } from "framer-motion";





export function Chat({ 
  activeSessionId, 
  setActiveSessionId,
  activeWorkspaceId,
  setActiveWorkspaceId,
  showHistory,
  setShowHistory,
  onSyncRef,
  isLargeViewport,
  keyboardOffset,
  onChatInputResize
}: { 
  activeSessionId: Id<"chatSessions"> | null, 
  setActiveSessionId: (id: Id<"chatSessions"> | null) => void,
  activeWorkspaceId: Id<"workspaces"> | undefined,
  setActiveWorkspaceId: (id: Id<"workspaces"> | undefined, sessionId?: Id<"chatSessions"> | null) => void,
  showHistory: boolean,
  setShowHistory: (show: boolean) => void,
  onSyncRef?: React.MutableRefObject<(() => void) | null>,
  isLargeViewport: boolean,
  keyboardOffset: number,
  onChatInputResize?: (offset: number) => void
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
  const updateMemory = useMutation(api.ai.updateProfile);

  const convex = useConvex();

  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{ id: Id<"chatSessions">; title: string } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [userJustSent, setUserJustSent] = useState(false);
  const isSyncing = !!(activeSessionId && messages === undefined);

  const [provider, setProvider] = useState<"gemini" | "lmstudio">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dialogue_provider") as "gemini" | "lmstudio") || "gemini";
    }
    return "gemini";
  });

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
              if (args.dueDate) taskUpdates.dueDate = parseLocal(args.dueDate as string);

              await updateTask({
                id: args.taskId as Id<"tasks">,
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
              
              await addEvent({ 
                title: (args.title as string) || "Untitled Event",
                location: args.location as string | undefined,
                description: args.description as string | undefined,
                notes: args.notes as string | undefined,
                startTime, 
                endTime, 
                eventType,
                workspaceId: promptCtx.workspaceId ?? undefined,
              });
            } else {
              const oldEvent = await convex.query(api.events.get, { id: args.eventId as Id<"events"> });
              const updates: Record<string, string | number> = {};
              if (args.title) updates.title = args.title as string;
              if (args.location) updates.location = args.location as string;
              if (args.notes) updates.notes = args.notes as string;
              if (args.startTime) updates.startTime = parseLocal(args.startTime as string);
              if (args.endTime) updates.endTime = parseLocal(args.endTime as string);
              if (args.eventType) updates.eventType = args.eventType as string;

              await updateEvent({
                id: args.eventId as Id<"events">,
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
          else if (name === "updateMemory") {
            await updateMemory({ bio: args.bio as string });
            enrichedArgs.oldBio = profile?.bio;
          }

          executedCalls.push({ name, args: enrichedArgs, result: { status: "success" } });
        }

        await sendMessage({
          sessionId,
          text: result.aiText || "Done!",
          author: "AI",
          toolCall: executedCalls[0],
          toolCalls: executedCalls,
        });
      } else {
        await sendMessage({
          sessionId,
          text: result.aiText || "Done!",
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

    setUserJustSent(true);
    setIsTyping(true);

    if (provider === "lmstudio") {
      try {
        await runLocalLLMForSession(sessionId, syncText, { brief: true });
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

  // ---- Send handler: receives (text, files) from ChatInput, handles upload + message + LLM ----
  const handleSend = useCallback(async (userText: string, files: File[]) => {
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
      });

      setUserJustSent(true);
      setIsTyping(true);

      if (provider === "lmstudio") {
        try {
          await runLocalLLMForSession(activeSessionId, userText);
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

  const handleNewChat = async () => {
    const id = await createSession({ 
      title: `Chat ${new Date().toLocaleTimeString()}`,
      workspaceId: activeWorkspaceId
    });
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

  const handleTypingDone = useCallback(() => {
    setIsTyping(false);
  }, []);

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


      {/* Main Chat Area */}
      <motion.div 
        layout
        className="flex-1 flex flex-col h-full min-w-0 relative bg-[#0f0e0c] overflow-hidden"
      >
        <ChatHeader
          activeSessionTitle={activeSessionId ? sessions?.find(s => s._id === activeSessionId)?.title : undefined}
          currentWorkspace={currentWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          messageCount={messages?.length || 0}
          provider={provider}
          isLargeViewport={isLargeViewport}
          onProviderChange={handleProviderChange}
          onSignOut={() => signOut()}
          onShowHistory={() => setShowHistory(true)}
        />

        <MessageStream
          messages={messages}
          activeSessionId={activeSessionId}
          isTyping={isTyping}
          isSyncing={isSyncing}
          isLargeViewport={isLargeViewport}
          keyboardOffset={keyboardOffset}
          userJustSent={userJustSent}
          onUserSentAcknowledged={() => setUserJustSent(false)}
          onTypingDone={handleTypingDone}
        />

        <ChatInput
          activeSessionId={activeSessionId}
          isLargeViewport={isLargeViewport}
          keyboardOffset={keyboardOffset}
          onSend={handleSend}
          onChatInputResize={onChatInputResize}
        />
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
