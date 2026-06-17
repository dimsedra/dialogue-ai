import type PocketBase from "pocketbase";
import { decrypt } from "../encryption";
import { getLocalDateString, getTodayBounds } from "./dateUtils";

export interface GenerateDailySummaryArgs {
  userId: string;
  timezone: string;
}

export type GenerateDailySummaryResult =
  | { status: "created"; summary: string }
  | { status: "skipped_no_activity"; summary: string }
  | { status: "skipped_already_exists" }
  | { status: "failed_llm"; error: string }
  | { status: "failed_db"; error: string };

export async function generateDailySummary(
  pb: PocketBase,
  args: GenerateDailySummaryArgs,
): Promise<GenerateDailySummaryResult> {
  const { userId, timezone } = args;
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const dateString = getLocalDateString(timezone);
  const { start: startOfDay, end: endOfDay } = getTodayBounds(timezone);

  // 1. Check idempotency
  try {
    const existing = await pb
      .collection("session_summaries")
      .getFirstListItem(`user = "${escapedUser}" && date = "${dateString}"`);
    if (existing) {
      return { status: "skipped_already_exists" };
    }
  } catch (err) {
    // 404 means it doesn't exist, which is expected
  }

  // 2. Fetch all sessions for this user
  let sessions: any[] = [];
  try {
    const sessionsList = await pb.collection("chat_sessions").getFullList({
      filter: `user = "${escapedUser}"`,
    });
    sessions = sessionsList;
  } catch (err) {
    console.error("[generateDailySummary] fetch sessions failed:", err);
  }

  // 3. Fetch messages for these sessions within today's bounds
  const userMessages: { text: string; timestamp: number }[] = [];
  for (const session of sessions) {
    try {
      const messages = await pb.collection("messages").getFullList({
        filter: `session = "${session.id}" && role = "user" && timestamp >= ${startOfDay} && timestamp <= ${endOfDay}`,
      });
      for (const msg of messages) {
        userMessages.push({ text: msg.content, timestamp: msg.timestamp });
      }
    } catch (err) {
      console.error(`[generateDailySummary] fetch msgs for ${session.id} failed:`, err);
    }
  }

  userMessages.sort((a, b) => a.timestamp - b.timestamp);

  if (userMessages.length === 0) {
    const emptySummary = "No activity.";
    try {
      await pb.collection("session_summaries").create({
        user: userId,
        date: dateString,
        summary: emptySummary,
      });
      return { status: "skipped_no_activity", summary: emptySummary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "failed_db", error: msg };
    }
  }

  // 4. Decrypt configs and prepare AI
  let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};
  let provider = "gemini";
  let taskModels: Record<string, string> | undefined;

  try {
    const profileDoc = await pb
      .collection("user_profile")
      .getFirstListItem(`user = "${escapedUser}"`);

    const prefs = (profileDoc.preferences as Record<string, unknown>) || {};
    provider = (prefs.provider as string) || "gemini";
    taskModels = prefs.taskModels as Record<string, string> | undefined;

    if (prefs.customConfigs && typeof prefs.customConfigs === "object") {
      const raw = prefs.customConfigs as Record<string, { apiKey?: string; baseUrl?: string }>;
      const decrypted: Record<string, { apiKey?: string; baseUrl?: string }> = {};
      for (const p of Object.keys(raw)) {
        const cfg = { ...raw[p] };
        if (cfg.apiKey && cfg.apiKey.includes(":")) {
          try {
            cfg.apiKey = await decrypt(cfg.apiKey);
          } catch (err) {
            console.error(`[generateDailySummary] decrypt failed for "${p}":`, err);
          }
        }
        decrypted[p] = cfg;
      }
      customConfigs = decrypted;
    }
  } catch (err) {
    console.error("[generateDailySummary] profile fetch failed:", err);
  }

  const { runSimpleTask, getTaskProviderAndModel } = await import(
    "../ai-providers"
  );
  const resolved = getTaskProviderAndModel(
    { preferences: { provider, taskModels } },
    "reflection",
  );

  const messagesText = userMessages.map((m) => m.text).join("\n---\n");

  const prompt = `You are a helpful AI productivity assistant. Read the user's messages from today and write a 2-line session summary that captures the main topics discussed, tasks accomplished, or plans made. Do not explain the reasoning, just output the summary.

Messages:
${messagesText}`;

  let summary = "";
  try {
    summary = await runSimpleTask({
      provider: resolved.provider,
      customConfigs,
      prompt,
      modelId: resolved.modelId,
    });
    summary = summary.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateDailySummary] LLM generation failed:", msg);
    return { status: "failed_llm", error: msg };
  }

  // 5. Save Summary
  try {
    await pb.collection("session_summaries").create({
      user: userId,
      date: dateString,
      summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateDailySummary] saving summary failed:", msg);
    return { status: "failed_db", error: msg };
  }

  return { status: "created", summary };
}
