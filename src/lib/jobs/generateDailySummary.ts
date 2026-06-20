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

  // 5. Fetch completed tasks today
  let completedTasks: any[] = [];
  try {
    completedTasks = await pb.collection("tasks").getFullList({
      filter: `user = "${escapedUser}" && completed = true && completedAt >= ${startOfDay} && completedAt <= ${endOfDay}`,
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

  // Check if we have any activity at all
  if (messages.length === 0 && completedTasks.length === 0 && todayEvents.length === 0) {
    // Check if there are active habits. If not, skip daily log generation
    let habitsCount = 0;
    try {
      const activeHabits = await pb.collection("habits").getFullList({
        filter: `user = "${escapedUser}" && archived = false`,
      });
      habitsCount = activeHabits.length;
    } catch {}

    if (habitsCount === 0) {
      return { status: "skipped_no_activity", summary: "No activity." };
    }
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

    const prompt = `You are a helpful AI productivity assistant. Read the following chat transcript from today for a single conversation session. Write a brief, high-density summary (1-2 sentences) of what was discussed, accomplished, or decided in this thread today. Do not include past context, meta-commentary, or introductory phrases. Be direct.

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

  // 8. Group activities into global vs. workspace scopes
  const globalReflections: string[] = [];
  const globalTasks: any[] = [];
  const globalEvents: any[] = [];

  const workspaceReflections = new Map<string, string[]>(); // workspaceId -> reflections
  const workspaceTasks = new Map<string, any[]>(); // workspaceId -> tasks
  const workspaceEvents = new Map<string, any[]>(); // workspaceId -> events

  // Group Reflections
  for (const [sessionId, reflection] of sessionReflections.entries()) {
    const session = sessionMap.get(sessionId);
    const title = session?.title || "Untitled Session";
    const wsId = session?.workspace;
    const bullet = `- **${title}**: ${reflection}`;

    if (wsId) {
      if (!workspaceReflections.has(wsId)) workspaceReflections.set(wsId, []);
      workspaceReflections.get(wsId)!.push(bullet);
    } else {
      globalReflections.push(bullet);
    }
  }

  // Group Completed Tasks
  for (const task of completedTasks) {
    const wsId = task.workspace;
    if (wsId) {
      if (!workspaceTasks.has(wsId)) workspaceTasks.set(wsId, []);
      workspaceTasks.get(wsId)!.push(task);
    } else {
      globalTasks.push(task);
    }
  }

  // Group Events
  for (const event of todayEvents) {
    const wsId = event.workspace;
    if (wsId) {
      if (!workspaceEvents.has(wsId)) workspaceEvents.set(wsId, []);
      workspaceEvents.get(wsId)!.push(event);
    } else {
      globalEvents.push(event);
    }
  }

  const getWorkspaceSlug = (workspaceId?: string): string => {
    if (!workspaceId) return "";
    const ws = workspaceMap.get(workspaceId);
    if (!ws) return "";
    return ws.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "";
  };

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
    const timeStr = task.completedAt ? ` (Completed: ${formatTime(task.completedAt)})` : "";
    const wsSlug = getWorkspaceSlug(task.workspace);
    const wsPart = wsSlug ? ` @${wsSlug}` : "";
    return `- [x] ${task.text}${timeStr} #tsk-${task.id}${wsPart}`;
  };

  const formatEventBullet = (event: any): string => {
    const startStr = formatTime(event.startTime);
    const endStr = event.endTime ? ` - ${formatTime(event.endTime)}` : "";
    const wsSlug = getWorkspaceSlug(event.workspace);
    const wsPart = wsSlug ? ` @${wsSlug}` : "";
    return `- [x] ${event.title} (Time: ${startStr}${endStr}) #evt-${event.id}${wsPart}`;
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

  const globalMarkdown = `---
date: ${dateString}
type: daily-log
---

# Daily Log - ${dateString}

## Today's Habits
${habitsLines.length > 0 ? habitsLines.join("\n") : "No active habits."}

## Journal & Raw Notes
${globalReflections.length > 0 ? globalReflections.join("\n") : "No global chat activity today."}

## Tasks Completed Today
${globalTasks.length > 0 ? globalTasks.map(formatTaskBullet).join("\n") : "No tasks completed today."}

## Events Today
${globalEvents.length > 0 ? globalEvents.map(formatEventBullet).join("\n") : "No events today."}
`;

  try {
    writeFileSync(globalLogPath, globalMarkdown, "utf8");
  } catch (err) {
    console.error("[generateDailySummary] Failed writing global daily log:", err);
  }

  // 10. Generate and Write Workspace Activity Logs
  for (const ws of workspaces) {
    const wsReflections = workspaceReflections.get(ws.id) || [];
    const wsTasks = workspaceTasks.get(ws.id) || [];
    const wsEvents = workspaceEvents.get(ws.id) || [];

    // Skip creating workspace activity log if no activity exists for this workspace today
    if (wsReflections.length === 0 && wsTasks.length === 0 && wsEvents.length === 0) {
      continue;
    }

    const wsPath = resolveWorkspacePath(folioRootPath, ws.id, ws.name);
    const wsActivityDir = join(wsPath, "activity");
    if (!existsSync(wsActivityDir)) {
      mkdirSync(wsActivityDir, { recursive: true });
    }
    const wsActivityPath = join(wsActivityDir, `${dateString}.md`);

    const wsMarkdown = `---
date: ${dateString}
type: workspace-activity
workspace: ${ws.id}
---

# Workspace Activity - ${dateString}

## Journal & Raw Notes
${wsReflections.length > 0 ? wsReflections.join("\n") : "No chat activity today."}

## Tasks Completed Today
${wsTasks.length > 0 ? wsTasks.map(formatTaskBullet).join("\n") : "No tasks completed today."}

## Events Today
${wsEvents.length > 0 ? wsEvents.map(formatEventBullet).join("\n") : "No events today."}
`;

    try {
      writeFileSync(wsActivityPath, wsMarkdown, "utf8");
    } catch (err) {
      console.error(`[generateDailySummary] Failed writing workspace activity log for ${ws.id}:`, err);
    }
  }

  // 11. Compile single overall summary for session_summaries table
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
  } else if (completedTasks.length > 0 || todayEvents.length > 0) {
    finalSummaryText = `Completed ${completedTasks.length} task(s) and scheduled ${todayEvents.length} event(s) today.`;
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
