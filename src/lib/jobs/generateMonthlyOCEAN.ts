import type PocketBase from "pocketbase";
import { decrypt } from "../../../convex/encryption";

export interface GenerateMonthlyOCEANArgs {
  userId: string;
  timezone?: string;
}

export type GenerateMonthlyOCEANResult =
  | { status: "created"; digest: string }
  | { status: "skipped_no_data" }
  | { status: "failed_llm"; error: string }
  | { status: "failed_db"; error: string };

export async function generateMonthlyOCEAN(
  pb: PocketBase,
  args: GenerateMonthlyOCEANArgs,
): Promise<GenerateMonthlyOCEANResult> {
  const { userId, timezone = "UTC" } = args;
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
            console.error(`[generateMonthlyOCEAN] decrypt failed for "${p}":`, err);
          }
        }
        decrypted[p] = cfg;
      }
      customConfigs = decrypted;
    }
  } catch (err) {
    console.error("[generateMonthlyOCEAN] profile fetch failed:", err);
    // If we fail to fetch profile, we can't save it later, so abort.
    return { status: "failed_db", error: "User profile not found" };
  }

  // 2. Fetch the 4 most recent weekly digests
  let weeklies: any[] = [];
  try {
    const listResult = await pb.collection("weekly_digests").getList(1, 4, {
      filter: `user = "${escapedUser}"`,
      sort: "-weekStart",
    });
    weeklies = listResult.items;
  } catch (err) {
    console.error("[generateMonthlyOCEAN] fetch weekly_digests failed:", err);
  }

  if (weeklies.length === 0) {
    return { status: "skipped_no_data" };
  }

  // 3. Prepare AI run
  const { runSimpleTask, getTaskProviderAndModel } = await import(
    "../../../convex/ai_providers"
  );
  const resolved = getTaskProviderAndModel(
    { preferences: { provider, taskModels } },
    "reflection",
  );

  const existingProfile =
    profileDoc?.behavioralProfile || "No existing behavioral profile.";

  // Weeklies are fetched descending. Reverse them for chronological order in prompt.
  const chronologicalWeeklies = [...weeklies].reverse();
  const weeklyDigestsText = chronologicalWeeklies
    .map((w) => `--- ${w.weekLabel} ---\n${w.digest}`)
    .join("\n\n");

  const prompt = `You are a behavioral analyst using the Big 5 (OCEAN) personality framework. Synthesize ${chronologicalWeeklies.length} weekly OCEAN digests into a monthly behavioral profile.

## Existing Behavioral Profile
${existingProfile}

## Weekly OCEAN Digests (chronological order)
${weeklyDigestsText}

## Instructions
1. **Cross-week pattern analysis**: Identify which OCEAN traits are consistent across all weeks vs which are volatile. A trait that scores similarly in 3+ weeks is a stable pattern.
2. **Trait evolution**: Note if any trait shows a clear trend across the month (e.g., Neuroticism declining from High to High-Average = positive trajectory).
3. **Refine the behavioral profile**: Compare the pattern against the existing profile. If traits are consistent, keep them. If a trait has shifted consistently, update it. If only 1-2 weeks show deviation, it's situational — keep the old trait.
4. **No-Bias Rule**: Inactivity across weeks does NOT lower scores. Only sustained behavioral change updates the profile.

## Output Format
Monthly OCEAN Profile — [Month Year]:

- **Openness**: [Band] ([percentile]) — [stable/volatile] — [evidence from weeks]
- **Conscientiousness**: [Band] ([percentile]) — [stable/volatile] — [evidence]
- **Extraversion**: [Band] ([percentile]) — [stable/volatile] — [evidence]
- **Agreeableness**: [Band] ([percentile]) — [stable/volatile] — [evidence]
- **Neuroticism**: [Band] ([percentile]) — [stable/volatile] — [evidence]

**Profile Changes**: [What changed from the existing profile, or "No changes — consistent with established pattern"]
**Summary**: [3-4 sentence overall monthly assessment]`;

  let monthlyDigest = "";
  try {
    monthlyDigest = await runSimpleTask({
      provider: resolved.provider,
      customConfigs,
      prompt,
      modelId: resolved.modelId,
    });
    monthlyDigest = monthlyDigest.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateMonthlyOCEAN] LLM generation failed:", msg);
    return { status: "failed_llm", error: msg };
  }

  // 4. Archive old weeklies and delete them
  try {
    for (const w of weeklies) {
      const dateStr = w.weekStartStr || new Date(w.weekStart).toLocaleDateString("en-CA", { timeZone: timezone });
      await pb.collection("archived_summaries").create({
        user: userId,
        type: "weekly",
        originalDate: w.weekStart,
        originalDateStr: dateStr,
        content: w.digest,
      });
      await pb.collection("weekly_digests").delete(w.id);
    }

    // 5. Archive previous monthly digest if exists
    const monthlyNotes = profileDoc?.monthlyNotesSummaries;
    if (Array.isArray(monthlyNotes) && monthlyNotes.length > 0) {
      const now = Date.now();
      await pb.collection("archived_summaries").create({
        user: userId,
        type: "monthly",
        originalDate: now,
        originalDateStr: new Date(now).toLocaleDateString("en-CA", { timeZone: timezone }),
        content: monthlyNotes[0],
      });
    }

    // 6. Update user profile
    await pb.collection("user_profile").update(profileDoc.id, {
      monthlyNotesSummaries: [monthlyDigest],
      behavioralProfile: monthlyDigest,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateMonthlyOCEAN] archiving / profile update failed:", msg);
    return { status: "failed_db", error: msg };
  }

  return { status: "created", digest: monthlyDigest };
}
