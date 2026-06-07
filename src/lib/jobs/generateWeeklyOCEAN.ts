import type PocketBase from "pocketbase";
import { decrypt } from "../../../convex/encryption";
import { compileWeeklyData } from "./compileWeeklyData";

export interface GenerateWeeklyOCEANArgs {
  userId: string;
  timezone: string;
  timezoneOffset: number;
}

export type GenerateWeeklyOCEANResult =
  | { status: "created"; digest: string }
  | { status: "skipped_no_data" }
  | { status: "skipped_already_exists" }
  | { status: "failed_llm"; error: string }
  | { status: "failed_db"; error: string };

export async function generateWeeklyOCEAN(
  pb: PocketBase,
  args: GenerateWeeklyOCEANArgs,
): Promise<GenerateWeeklyOCEANResult> {
  const { userId, timezone, timezoneOffset } = args;
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // 1. Fetch user profile and decrypt customConfigs
  let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};
  let provider = "gemini";
  let taskModels: Record<string, string> | undefined;
  let profileDoc: any = null;

  try {
    profileDoc = await pb
      .collection("user_profile")
      .getFirstListItem(`user = "${escapedUser}"`);

    const prefs = (profileDoc.preferences as Record<string, unknown>) || {};
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
            console.error(`[generateWeeklyOCEAN] decrypt failed for "${p}":`, err);
          }
        }
        decrypted[p] = cfg;
      }
      customConfigs = decrypted;
    }
  } catch (err) {
    console.error("[generateWeeklyOCEAN] profile fetch failed:", err);
  }

  const { runSimpleTask, getTaskProviderAndModel } = await import(
    "../../../convex/ai_providers"
  );
  const resolved = getTaskProviderAndModel(
    { preferences: { provider, taskModels } },
    "reflection",
  );

  // 2. Compute date bounds for local Monday of *previous* week
  const now = new Date();
  const localNow = new Date(now.getTime() - timezoneOffset * 60000);
  const dayOfWeek = localNow.getUTCDay(); // 0=Sun, 1=Mon

  // Calculate Monday of this week (most recent Monday before or on today)
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Sun=6
  const localMonday = new Date(
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate() - daysSinceMonday,
    ),
  );
  const weekStartTime = localMonday.getTime() - timezoneOffset * 60000;

  // Previous week (days 1-7 being analyzed)
  const prevWeekStart = weekStartTime - 7 * 24 * 60 * 60 * 1000;
  const prevWeekEnd = weekStartTime;

  // Check if digest already exists for this week (idempotent)
  try {
    const existing = await pb
      .collection("weekly_digests")
      .getFirstListItem(
        `user = "${escapedUser}" && weekStart = ${prevWeekStart}`,
      );
    if (existing) {
      return { status: "skipped_already_exists" };
    }
  } catch (err) {
    // 404 means it doesn't exist, which is what we want
  }

  // 3. Get shared data payload
  const weeklyData = await compileWeeklyData(pb, {
    userId,
    periodStart: prevWeekStart,
    periodEnd: prevWeekEnd,
  });

  if (!weeklyData) {
    return { status: "skipped_no_data" };
  }

  // 4. Get previous monthly digest for baseline comparison
  const monthlyNotes = profileDoc?.monthlyNotesSummaries;
  const monthlyDigest = Array.isArray(monthlyNotes) && monthlyNotes.length > 0
    ? monthlyNotes[0]
    : "No monthly baseline yet.";

  // Build week label
  const weekLabelDate = new Date(prevWeekStart + timezoneOffset * 60000);
  const weekLabel = `Week of ${weekLabelDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;

  // 5. Generate LLM response
  const prompt = `You are a behavioral analyst using the Big 5 (OCEAN) personality framework. Analyze the user's week and produce a structured OCEAN digest.

## OCEAN Scoring Framework
For each trait, provide a percentile band and bullet-pointed evidence:
- Very Low: 0–10th | Low: 11–24th | Low-Average: 25–39th | True Average: 40–60th
- High-Average: 61–75th | High: 76–89th | Very High: 90–100th

## Traits
- **O — Openness**: Curiosity, new approaches, imagination
- **C — Conscientiousness**: Organization, goal-directed behavior, habit consistency
- **E — Extraversion**: Energy sourcing, social vs solo preference
- **A — Agreeableness**: Prosocial behavior, empathy-driven choices
- **N — Neuroticism**: Stress response, emotional stability

## Previous Month Baseline
${monthlyDigest}

## This Week's Data
${weeklyData.rawDetails}

## Instructions
1. **Retrograde Analysis** (day 7 → 1): Read the week backwards. If behavior dipped at the end, trace back to find the cause (e.g., a late-night work crunch on Thursday explains Friday's low energy). Attribute WHY behavior happened.
2. **Anterograde Analysis** (day 1 → 7): Read forwards. Detect trajectory — is each trait rising, falling, or stable? Note momentum (e.g., "Conscientiousness is in a growth phase, rising from 3→5→6→7").
3. **Score each trait** with percentile band + evidence bullets.
4. **No-Bias Rule**: If data is insufficient for a trait, say "Insufficient behavioral evidence to update [Trait] due to low logging activity" — do NOT penalize inactivity.
5. Compare against the monthly baseline: is this week consistent with the established pattern, or is it a deviation?

## Output Format
Week of [date] — OCEAN Digest:

- **Openness**: [Band] ([percentile]) — [evidence bullet points]
- **Conscientiousness**: [Band] ([percentile]) — [evidence]
  - Retrograde: [why the end-of-week pattern happened]
  - Anterograde: [trajectory description]
- **Extraversion**: [Band] ([percentile]) — [evidence]
- **Agreeableness**: [Band] ([percentile]) — [evidence]
- **Neuroticism**: [Band] ([percentile]) — [evidence]

**Baseline Comparison**: [How this week compares to the monthly baseline]
**Summary**: [2-3 sentence overall assessment]`;

  let digest = "";
  try {
    digest = await runSimpleTask({
      provider: resolved.provider,
      customConfigs,
      prompt,
      modelId: resolved.modelId,
    });
    digest = digest.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateWeeklyOCEAN] LLM generation failed:", msg);
    return { status: "failed_llm", error: msg };
  }

  // Compute weekStartStr
  const weekStartStr = new Date(prevWeekStart).toLocaleDateString("en-CA", {
    timeZone: timezone,
  });

  // 6. Save Reflection
  try {
    await pb.collection("weekly_digests").create({
      user: userId,
      weekStart: prevWeekStart,
      weekStartStr,
      weekLabel,
      digest,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateWeeklyOCEAN] saving digest failed:", msg);
    return { status: "failed_db", error: msg };
  }

  return { status: "created", digest };
}
