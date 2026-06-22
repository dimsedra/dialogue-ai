import type PocketBase from "pocketbase";
import { decrypt } from "../encryption";
import { getLocalDateString, getTodayBounds, expandRecurringEventsForWindow } from "./dateUtils";
import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

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

function getFolioRootPath(): string {
  let devFallbackPath = process.env.NODE_ENV === "development" ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  return devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
}

function resolveWorkspacePath(folioRootPath: string, workspaceId: string, workspaceName: string): string {
  const workspacesParent = join(folioRootPath, "workspaces");
  if (existsSync(workspacesParent)) {
    try {
      const folders = readdirSync(workspacesParent);
      const matched = folders.find((f) => f.endsWith(`-${workspaceId}`));
      if (matched) {
        return join(workspacesParent, matched);
      }
    } catch (err) {
      console.error("[generateDailySummary] Failed scanning workspaces directory:", err);
    }
  }
  const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
  const folderName = `${slug}-${workspaceId}`;
  return join(workspacesParent, folderName);
}

function parseHabitsFromMarkdown(content: string): Map<string, boolean> {
  const habitsMap = new Map<string, boolean>();
  const lines = content.split("\n");
  let inHabitsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") && trimmed.toLowerCase().includes("habit")) {
      inHabitsSection = true;
      continue;
    }
    if (inHabitsSection && trimmed.startsWith("#") && !trimmed.toLowerCase().includes("habit")) {
      inHabitsSection = false;
    }

    if (inHabitsSection) {
      const match = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
      if (match) {
        const checked = match[1].toLowerCase() === "x";
        const habitName = match[2].trim();
        habitsMap.set(habitName, checked);
      }
    }
  }
  return habitsMap;
}

export async function generateDailySummary(
  pb: PocketBase,
  args: GenerateDailySummaryArgs,
): Promise<GenerateDailySummaryResult> {
  const { userId, timezone } = args;
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const dateString = getLocalDateString(timezone);
  const { start: startOfDay, end: endOfDay } = getTodayBounds(timezone);
  const folioRootPath = getFolioRootPath();

  // 1. Fetch user preferences / profile for AI provider config
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

  // 2. Fetch all workspaces for this user
  let workspaces: any[] = [];
  try {
    workspaces = await pb.collection("workspaces").getFullList({
      filter: `user = "${escapedUser}"`,
    });
  } catch (err) {
    console.error("[generateDailySummary] fetch workspaces failed:", err);
  }
  const workspaceMap = new Map<string, any>(workspaces.map((w) => [w.id, w]));

  // 3. Fetch all chat sessions for this user
  let sessions: any[] = [];
  try {
    sessions = await pb.collection("chat_sessions").getFullList({
      filter: `user = "${escapedUser}"`,
    });
  } catch (err) {
    console.error("[generateDailySummary] fetch sessions failed:", err);
  }
  const sessionMap = new Map<string, any>(sessions.map((s) => [s.id, s]));

  // 4. Fetch today's messages for the user
  let messages: any[] = [];
  try {
    messages = await pb.collection("messages").getFullList({
      filter: `session.user = "${escapedUser}" && timestamp >= ${startOfDay} && timestamp <= ${endOfDay}`,
    });
  } catch (err) {
    console.error("[generateDailySummary] fetch messages failed:", err);
  }

  // 5. Fetch tasks for the daily log (completed today + all incomplete tasks)
  let activeTasks: any[] = [];
  try {
    activeTasks = await pb.collection("tasks").getFullList({
      filter: `user = "${escapedUser}" && (completed = false || (completed = true && completedAt >= ${startOfDay} && completedAt <= ${endOfDay}))`,
    });
  } catch (err) {
    console.error("[generateDailySummary] fetch tasks failed:", err);
  }

  // 6. Fetch events today (expand recurring)
  let todayEvents: any[] = [];
  try {
    const eventsList = await pb.collection("events").getFullList({
      filter: `user = "${escapedUser}"`,
    });
    todayEvents = expandRecurringEventsForWindow(eventsList, startOfDay, endOfDay).filter((e) => !e.cancelled);
  } catch (err) {
    console.error("[generateDailySummary] fetch events failed:", err);
  }

  // 7. Group messages by session and generate session reflections
  const { runSimpleTask, getTaskProviderAndModel } = await import("../ai-providers");
  const resolved = getTaskProviderAndModel({ preferences: { provider, taskModels } }, "reflection");

  const sessionReflections = new Map<string, string>();
  const messagesBySession = new Map<string, any[]>();
  for (const msg of messages) {
    if (!msg.session) continue;
    if (!messagesBySession.has(msg.session)) {
      messagesBySession.set(msg.session, []);
    }
    messagesBySession.get(msg.session)!.push(msg);
  }

  for (const [sessionId, sessionMsgs] of messagesBySession.entries()) {
    sessionMsgs.sort((a, b) => a.timestamp - b.timestamp);
    const transcript = sessionMsgs
        .map((m) => `${m.author === "user" ? "User" : "Companion"}: ${m.text}`)
        .join("\n");

    const prompt = `You are the journaling engine of Dialogue. Read the following chat transcript from today for a single conversation session.
Write a brief, high-density summary (1-2 sentences) of what the user discussed, accomplished, decided, or felt in this thread today.

CRITICAL RULES:
1. Focus 100% on the user (their thoughts, actions, mood, and decisions).
2. NEVER mention the assistant, companion, or what the assistant did/said (e.g. do NOT write "the assistant acknowledged", "the companion invited").
3. Write from a direct, user-focused third-person perspective (e.g., "User shared a positive, productive mood and discussed casual updates").
4. Do not include meta-commentary or introductory phrases. Be direct.

Chat Transcript:
${transcript}`;

    try {
      const summary = await runSimpleTask({
        provider: resolved.provider,
        customConfigs,
        prompt,
        modelId: resolved.modelId,
      });
      sessionReflections.set(sessionId, summary.trim());
    } catch (err) {
      console.error(`[generateDailySummary] LLM reflection failed for session ${sessionId}:`, err);
      sessionReflections.set(sessionId, "Activity occurred in this session.");
    }
  }

  const getWorkspaceSlug = (workspaceId?: string): string => {
    if (!workspaceId) return "";
    const ws = workspaceMap.get(workspaceId);
    if (!ws) return "";
    return ws.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "";
  };

  // Compile flat reflections
  const reflectionsLines: string[] = [];
  for (const [sessionId, reflection] of sessionReflections.entries()) {
    const session = sessionMap.get(sessionId);
    const title = session?.title || "Untitled Session";
    const wsId = session?.workspace;
    const wsSlug = getWorkspaceSlug(wsId);
    const wsPart = wsSlug ? ` @${wsSlug}` : "";
    reflectionsLines.push(`- **${title}**${wsPart}: ${reflection}`);
  }

  // Helper to format time in user timezone
  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatTaskBullet = (task: any): string => {
    const checkbox = task.completed ? "[x]" : "[ ]";
    const timeStr = (task.completed && task.completedAt) ? ` (Completed: ${formatTime(task.completedAt)})` : "";
    const wsSlug = getWorkspaceSlug(task.workspace);
    const wsPart = wsSlug ? ` @${wsSlug}` : "";
    let bullet = `- ${checkbox} ${task.text}${timeStr} #tsk-${task.id}${wsPart}`;

    const noteLines: string[] = [];
    const seen = new Set<string>();

    const addLines = (rawText: string) => {
      if (!rawText) return;
      const lines = rawText
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);
      for (const line of lines) {
        if (!seen.has(line)) {
          seen.add(line);
          noteLines.push(line);
        }
      }
    };

    // 1. Add static task notes
    addLines(task.notes);

    // 2. Add history logs for today
    let historyLogs: any[] = [];
    if (task.history_logs) {
      try {
        historyLogs = typeof task.history_logs === "string" ? JSON.parse(task.history_logs) : task.history_logs;
      } catch {}
    }

    if (Array.isArray(historyLogs)) {
      const todayLog = historyLogs.find((h: any) => h.date === dateString);
      if (todayLog && todayLog.note) {
        addLines(todayLog.note);
      }
    }

    for (const line of noteLines) {
      bullet += `\n  * ${line}`;
    }
    return bullet;
  };

  const formatEventBullet = (event: any): string => {
    const startStr = formatTime(event.startTime);
    const timeRange = event.endTime ? `${startStr}-${formatTime(event.endTime)}` : startStr;
    const wsSlug = getWorkspaceSlug(event.workspace);
    const wsPart = wsSlug ? ` @${wsSlug}` : "";
    let bullet = `- ${timeRange} - ${event.title} #evt-${event.id}${wsPart}`;

    const noteLines: string[] = [];
    const seen = new Set<string>();

    const addLines = (rawText: string) => {
      if (!rawText) return;
      const lines = rawText
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);
      for (const line of lines) {
        if (!seen.has(line)) {
          seen.add(line);
          noteLines.push(line);
        }
      }
    };

    // 1. Add static event notes
    addLines(event.notes);

    // 2. Add history logs for today
    let historyLogs: any[] = [];
    if (event.history_logs) {
      try {
        historyLogs = typeof event.history_logs === "string" ? JSON.parse(event.history_logs) : event.history_logs;
      } catch {}
    }

    if (Array.isArray(historyLogs)) {
      const todayLog = historyLogs.find((h: any) => h.date === dateString);
      if (todayLog && todayLog.note) {
        addLines(todayLog.note);
      }
    }

    for (const line of noteLines) {
      bullet += `\n  * ${line}`;
    }
    return bullet;
  };

  // 9. Generate and Write Global Daily Log
  const globalLogDir = join(folioRootPath, "daily-logs");
  if (!existsSync(globalLogDir)) {
    mkdirSync(globalLogDir, { recursive: true });
  }
  const globalLogPath = join(globalLogDir, `${dateString}.md`);

  // Preserve existing habits checkbox state from file if it exists
  let existingHabitChecks = new Map<string, boolean>();
  if (existsSync(globalLogPath)) {
    try {
      const content = readFileSync(globalLogPath, "utf8");
      existingHabitChecks = parseHabitsFromMarkdown(content);
    } catch (err) {
      console.warn("[generateDailySummary] Failed reading existing daily log:", err);
    }
  }

  // Fetch active habits from DB
  let activeHabits: any[] = [];
  try {
    activeHabits = await pb.collection("habits").getFullList({
      filter: `user = "${escapedUser}" && archived = false`,
    });
  } catch (err) {
    console.error("[generateDailySummary] Failed fetching habits:", err);
  }

  // Fetch habit logs for today to fallback to DB state
  const todayHabitLogs = new Map<string, string>();
  try {
    const logs = await pb.collection("habit_logs").getFullList({
      filter: `user = "${escapedUser}" && dateString = "${dateString}"`,
    });
    for (const log of logs) {
      todayHabitLogs.set(log.habit, log.status);
    }
  } catch (err) {
    console.error("[generateDailySummary] Failed fetching today's habit logs:", err);
  }

  // Construct Habits Checklist section
  const [y, m, d] = dateString.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dateObj.getUTCDay();

  const habitsLines: string[] = [];
  for (const habit of activeHabits) {
    const isScheduledToday =
      habit.frequency !== "custom" ||
      !!habit.frequencyConfig?.daysOfWeek?.includes(dayOfWeek);

    // Keep it if it is scheduled today, OR if the file already contains it (to avoid deleting user edits)
    if (!isScheduledToday && !existingHabitChecks.has(habit.name)) {
      continue;
    }

    let checked = false;
    if (existingHabitChecks.has(habit.name)) {
      checked = existingHabitChecks.get(habit.name)!;
    } else {
      const dbStatus = todayHabitLogs.get(habit.id);
      checked = dbStatus === "completed";
    }
    habitsLines.push(`- [${checked ? "x" : " "}] ${habit.name} #hab-${habit.id}`);
  }

  // Format human-friendly header date
  const friendlyDate = dateObj.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const taskLines = activeTasks.map(formatTaskBullet);
  const eventLines = todayEvents.map(formatEventBullet);

  const globalMarkdown = `---
date: ${dateString}
type: daily-log
---

# ${friendlyDate}

## Habits
${habitsLines.length > 0 ? habitsLines.join("\n") : "No active habits."}

## Tasks
${taskLines.length > 0 ? taskLines.join("\n") : "No tasks."}

## Events
${eventLines.length > 0 ? eventLines.join("\n") : "No events."}

## Journal & Raw Notes
${reflectionsLines.length > 0 ? reflectionsLines.join("\n") : "No chat activity today."}
`;

  try {
    writeFileSync(globalLogPath, globalMarkdown, "utf8");
  } catch (err) {
    console.error("[generateDailySummary] Failed writing global daily log:", err);
  }

  // Trigger immediate sync so PB daily_logs record is created without waiting for watcher
  try {
    const { syncFolioFileToDb } = await import('../folio/sync');
    const folioRoot = getFolioRootPath();
    await syncFolioFileToDb(globalLogPath, pb, folioRoot);
  } catch (err) {
    console.error("[generateDailySummary] Failed syncing daily log to DB:", err);
  }

  // 10. Compile single overall summary for session_summaries table
  const allReflections = [...sessionReflections.values()];
  let finalSummaryText = "No activity.";
  if (allReflections.length > 0) {
    const prompt = `You are a helpful AI productivity assistant. Summarize the following daily chat reflections into a single high-level 2-line reflection of today. Do not include past context or meta-commentary.

Reflections:
${allReflections.join("\n")}`;

    try {
      const summary = await runSimpleTask({
        provider: resolved.provider,
        customConfigs,
        prompt,
        modelId: resolved.modelId,
      });
      finalSummaryText = summary.trim();
    } catch (err) {
      console.error("[generateDailySummary] Failed compiling overall summary:", err);
      finalSummaryText = allReflections.slice(0, 2).join(" ");
    }
  } else if (activeTasks.length > 0 || todayEvents.length > 0) {
    const completedCount = activeTasks.filter((t) => t.completed).length;
    finalSummaryText = `Completed ${completedCount} task(s) and scheduled ${todayEvents.length} event(s) today.`;
  }

  // Save/Update in PB cache
  try {
    let existingSummary: any = null;
    try {
      existingSummary = await pb
        .collection("session_summaries")
        .getFirstListItem(`user = "${escapedUser}" && date = "${dateString}"`);
    } catch {}

    if (existingSummary) {
      await pb.collection("session_summaries").update(existingSummary.id, {
        summary: finalSummaryText,
      });
    } else {
      await pb.collection("session_summaries").create({
        user: userId,
        date: dateString,
        summary: finalSummaryText,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateDailySummary] Failed saving overall summary to DB:", msg);
    return { status: "failed_db", error: msg };
  }

  return { status: "created", summary: finalSummaryText };
}
