import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbMessages } from "../_generated/dataModel";

export function usePbMessageSend() {
  const { user } = useAuth();
  const mutate = useMutation<PbMessages>({ collection: "messages", kind: "create" });
  return async (args: {
    sessionId: string;
    text: string;
    author: string;
    timezoneOffset?: number;
    timezone?: string;
    toolCall?: { name: string; args: Record<string, unknown>; result?: unknown };
    toolCalls?: { name: string; args: Record<string, unknown>; result?: unknown }[];
    reasoning?: string;
    storageId?: string;
    fileType?: string;
    fileName?: string;
    attachments?: { storageId: string; fileName: string; fileType: string }[];
    files?: File[];
    scope?: { type: "date" | "task" | "event" | "habit"; id: string; title: string };
    provider?: string;
    brief?: boolean;
  }) => {
    if (!user) throw new Error("Unauthorized");
    
    let recordArgs: any;
    
    if (args.files && args.files.length > 0) {
      const formData = new FormData();
      formData.append("session", args.sessionId);
      formData.append("text", args.text);
      formData.append("author", args.author);
      formData.append("timestamp", String(Date.now()));
      if (args.timezoneOffset !== undefined) formData.append("timezoneOffset", String(args.timezoneOffset));
      if (args.toolCall) formData.append("toolCall", JSON.stringify(args.toolCall));
      if (args.toolCalls) formData.append("toolCalls", JSON.stringify(args.toolCalls));
      if (args.reasoning) formData.append("reasoning", args.reasoning);
      if (args.scope) formData.append("scope", JSON.stringify(args.scope));
      
      // Append each file to the 'attachments' key
      for (const file of args.files) {
        formData.append("attachments", file);
      }
      
      recordArgs = formData;
    } else {
      recordArgs = {
        session: args.sessionId,
        text: args.text,
        author: args.author,
        timestamp: Date.now(),
        timezoneOffset: args.timezoneOffset,
        toolCall: args.toolCall || undefined,
        toolCalls: args.toolCalls || undefined,
        reasoning: args.reasoning || undefined,
        storageId: args.storageId || undefined,
        fileType: args.fileType || undefined,
        fileName: args.fileName || undefined,
        attachments: args.attachments || undefined,
        scope: args.scope || undefined,
      };
    }

    const record = await mutate(recordArgs);

    try {
      const pb = getPbClient();
      const patch: Record<string, any> = { lastActivity: Date.now() };
      if (args.author === "User" && args.timezone) {
        patch.timezone = args.timezone;
      }
      await pb.collection("chat_sessions").update(args.sessionId, patch);
    } catch (err) {
      console.error("Failed to update session activity:", err);
    }

    return record.id;
  };
}

export function usePbMessageUpdate() {
  const { user } = useAuth();
  const mutate = useMutation<PbMessages>({ collection: "messages", kind: "update" });
  return async (
    id: string,
    args: {
      text?: string;
      timezoneOffset?: number;
      toolCall?: { name: string; args: Record<string, unknown>; result?: unknown };
      toolCalls?: { name: string; args: Record<string, unknown>; result?: unknown }[];
      reasoning?: string;
      storageId?: string;
      fileType?: string;
      fileName?: string;
      attachments?: { storageId: string; fileName: string; fileType: string }[];
      scope?: { type: "date" | "task" | "event" | "habit"; id: string; title: string };
    },
  ) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      id,
      record: {
        text: args.text,
        timezoneOffset: args.timezoneOffset,
        toolCall: args.toolCall || undefined,
        toolCalls: args.toolCalls || undefined,
        reasoning: args.reasoning || undefined,
        storageId: args.storageId || undefined,
        fileType: args.fileType || undefined,
        fileName: args.fileName || undefined,
        attachments: args.attachments || undefined,
        scope: args.scope || undefined,
      },
    });
    return record.id;
  };
}
