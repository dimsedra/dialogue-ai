import type PocketBase from "pocketbase";
import { decrypt } from "../../../convex/encryption";
import { getPeriodRange, getPeriodLabel } from "./dateUtils";
import { compileReflectionStats } from "./compileReflectionStats";

export interface GenerateCronReflectionArgs {
  userId: string;
  type: "weekly" | "monthly" | "yearly";
  timezone?: string;
}

export type GenerateCronReflectionResult =
  | { status: "created"; summary: string }
  | { status: "skipped_no_stats" }
  | { status: "failed_llm"; error: string }
  | { status: "failed_db"; error: string };

export async function generateCronReflection(
  pb: PocketBase,
  args: GenerateCronReflectionArgs,
): Promise<GenerateCronReflectionResult> {
  const { userId, type } = args;
  const tz = args.timezone || "UTC";

  // 1. Fetch user profile and decrypt customConfigs
  let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};
  let provider = "gemini";
  let taskModels: Record<string, string> | undefined;
  let profileName = "User";

  try {
    const profile = await pb
      .collection("user_profile")
      .getFirstListItem(`user = "${userId.replace(/"/g, '\\"')}"`);
    
    profileName = profile.name || "User";
    const prefs = (profile.preferences as Record<string, unknown>) || {};
    provider = (prefs.provider as string) || "gemini";
    taskModels = prefs.taskModels as Record<string, string> | undefined;

    if (prefs.customConfigs && typeof prefs.customConfigs === "object") {
      const raw = prefs.customConfigs as Record<
        string,
        { apiKey?: string; baseUrl?: string }
      >;
      const decrypted: Record<string, { apiKey?: string; baseUrl?: string }> = {};
      for (const p of Object.keys(raw)) {
        const cfg = { ...raw[p] };
        if (cfg.apiKey && cfg.apiKey.includes(":")) {
          try {
            cfg.apiKey = await decrypt(cfg.apiKey);
          } catch (err) {
            console.error(
              `[generateCronReflection] decrypt failed for provider "${p}":`,
              err,
            );
          }
        }
        decrypted[p] = cfg;
      }
      customConfigs = decrypted;
    }
  } catch (err) {
    console.error("[generateCronReflection] profile fetch failed:", err);
  }

  const { runSimpleTask, getTaskProviderAndModel } = await import(
    "../../../convex/ai_providers"
  );
  const resolved = getTaskProviderAndModel(
    { preferences: { provider, taskModels } },
    "reflection",
  );

  // 2. Determine last session and timezone/language context
  let lastUserText = profileName || "Hello";
  let timezoneOffset = 0;

  try {
    const lastSession = await pb
      .collection("chat_sessions")
      .getFirstListItem(`user = "${userId.replace(/"/g, '\\"')}"`, {
        sort: "-created",
      });
    
    if (lastSession) {
      const messages = await pb.collection("messages").getList(1, 100, {
        filter: `session = "${lastSession.id}"`,
        sort: "-timestamp",
      });
      
      const userMsg = messages.items.find((m: any) => m.author === "User");
      if (userMsg) {
        lastUserText = userMsg.text || lastUserText;
      }
      const tzMsg = messages.items.find(
        (m: any) => m.timezoneOffset !== undefined && m.timezoneOffset !== null,
      );
      if (tzMsg) {
        timezoneOffset = tzMsg.timezoneOffset;
      }
    }
  } catch (err) {
    // No sessions or messages
  }

  // 3. Compute dates and compile stats
  const offset = type === "weekly" || type === "monthly" ? 1 : 0;
  const { startMs, endMs } = getPeriodRange(type, offset, timezoneOffset);
  const periodLabel = getPeriodLabel(type, startMs, timezoneOffset);

  const stats = await compileReflectionStats(pb, {
    userId,
    type,
    periodStart: startMs,
    periodEnd: endMs,
  });

  if (!stats) return { status: "skipped_no_stats" };

  const statsText = `
    Type: ${type}
    Period: ${periodLabel}
    Tasks Completed: ${stats.tasksCompleted}
    Tasks Created: ${stats.tasksCreated}
    Events Attended: ${stats.eventsAttended}
    Habits Completed: ${stats.habitLogsCompleted ?? 0}
    Habits Skipped: ${stats.habitLogsSkipped ?? 0}
    Best Habit Streak: ${stats.habitStreakDays ?? 0} day(s)
    Top Categories: ${stats.topCategories?.join(", ") || "None"}
    Streak Days: ${stats.streakDays || 0}
    
    ${stats.subSummaries ? "SUB-PERIOD SUMMARIES:\\n" + stats.subSummaries : ""}
    ${stats.rawDetails ? "RAW LOGS:\\n" + stats.rawDetails : ""}
  `;

  const summaryPrompt = `
    You are Dialogue, a productivity companion.
    Create a high-fidelity, Spotify-Wrapped style periodic reflection summary.
    Keep it highly engaging, celebratory, motivating, but honest.
    Use bullet points, emojis, bold text, and highlights.
    Draw connections between tasks, events, and habits if possible.
    Address the user by name: "${profileName}".
    
    Stats data:
    ${statsText}
    
    CRITICAL INSTRUCTION:
    1. Make it feel extremely personalized and premium.
    2. Write the ENTIRE reflection summary, all bullet points, and the concluding question in the same language as the user's last message: "${lastUserText.replace(/"/g, '\\"')}".
       - Detect the language of the user's last message (e.g., English, Indonesian, Japanese, or any other language).
       - You MUST translate and write everything (headings, stats summaries, list items, and the concluding question) in that exact query language.
       - Ignore the language of the source tasks or events in the Stats data (which may be in Indonesian). The last message's language is the ONLY language allowed for the output.
    3. Conclude with a single open-ended question in that query language inviting the user's feedback/reflection on their progress (e.g., "How do you feel about this week's progress?"). Do NOT output any internal formatting, instructions, or robotic tags.
  `;

  let summaryText = "";
  try {
    summaryText = await runSimpleTask({
      provider: resolved.provider,
      customConfigs,
      prompt: summaryPrompt,
      modelId: resolved.modelId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateCronReflection] LLM generation failed:", msg);
    return { status: "failed_llm", error: msg };
  }

  // 4. Save Reflection
  try {
    await pb.collection("reflections").create({
      user: userId,
      type,
      periodStart: startMs,
      periodStartStr: new Date(startMs).toLocaleDateString("en-CA", { timeZone: tz }),
      periodEnd: endMs,
      periodEndStr: new Date(endMs).toLocaleDateString("en-CA", { timeZone: tz }),
      periodLabel,
      summary: summaryText,
      stats: {
        tasksCompleted: stats.tasksCompleted,
        tasksCreated: stats.tasksCreated,
        eventsAttended: stats.eventsAttended,
        topCategories: stats.topCategories || [],
        streakDays: stats.streakDays,
        habitLogsCompleted: stats.habitLogsCompleted,
        habitLogsSkipped: stats.habitLogsSkipped,
        habitStreakDays: stats.habitStreakDays,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateCronReflection] saving reflection failed:", msg);
    return { status: "failed_db", error: msg };
  }

  return { status: "created", summary: summaryText };
}
