// generateSessionTitle — Phase 6.1.1 (POC).
//
// Background job: given a chat session, fetch its messages, ask an LLM to
// generate a short title, and write it back to the session record.
//
// PB equivalent of `internal.background_jobs.generateSessionTitle` from
// `convex/background_jobs.ts:423` (the Convex action).
//
// Why a pure function (PB client injected) and not a class?
//   - Mirrors the Convex shape: the action takes ctx + args and returns
//     void; the route adds HTTP/auth concerns. Keeping the function
//     pure makes the smoke test trivial (construct a PB client, call
//     the function, assert the session was updated).
//   - All 5 Phase 6 background jobs will follow this same shape:
//     `function jobName(pb: PocketBase, args: { userId, ... }) => Promise<...>`.
//
// What this function does NOT do:
//   - Authenticate the user. The HTTP route does that via `verifyPbToken`
//     and constructs a PB client authenticated as the user before calling
//     this function. The smoke test does the same thing with a
//     `pb.authStore.save(token, null)` + `authRefresh()` block.
//   - Encrypt the API keys. The user_profile.preferences.customConfigs
//     is decrypted here using the server-side `ENCRYPTION_KEY`. The
//     Next.js process has it; the browser does not (per Phase 6 Q1=c).

import type PocketBase from "pocketbase";
import { decrypt } from "../../../convex/encryption";

export interface GenerateSessionTitleArgs {
  userId: string;
  sessionId: string;
}

export type GenerateSessionTitleResult =
  | { status: "updated"; title: string }
  | { status: "skipped_non_default"; existingTitle: string }
  | { status: "skipped_no_session" }
  | { status: "skipped_unauthorized" }
  | { status: "skipped_no_messages" }
  | { status: "skipped_short_title" }
  | { status: "failed_llm"; error: string };

const DEFAULT_TITLE_PREFIXES = ["Chat ", "New Chat"];

export async function generateSessionTitle(
  pb: PocketBase,
  args: GenerateSessionTitleArgs,
): Promise<GenerateSessionTitleResult> {
  const { userId, sessionId } = args;

  // 1. Verify the session exists and belongs to the user.
  let session: { id: string; title?: string; user: string };
  try {
    session = await pb.collection("chat_sessions").getOne(sessionId);
  } catch {
    return { status: "skipped_no_session" };
  }
  if (session.user !== userId) {
    return { status: "skipped_unauthorized" };
  }

  // 2. Idempotency: only generate if the title is still a default pattern.
  if (
    session.title &&
    !DEFAULT_TITLE_PREFIXES.some((p) => session.title!.startsWith(p))
  ) {
    return { status: "skipped_non_default", existingTitle: session.title };
  }

  // 3. Fetch the user profile and decrypt customConfigs server-side.
  //    PB listRule is "user = @request.auth.id", so the user-only filter
  //    is enforced by PB itself; we pass the user as a filter arg.
  let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};
  let provider = "gemini";
  let taskModels: Record<string, string> | undefined;
  try {
    const profile = await pb
      .collection("user_profile")
      .getFirstListItem(`user = "${userId.replace(/"/g, '\\"')}"`);
    const prefs = (profile.preferences as Record<string, unknown>) || {};
    provider = (prefs.provider as string) || "gemini";
    taskModels = prefs.taskModels as Record<string, string> | undefined;

    // Decrypt customConfigs using the server-side ENCRYPTION_KEY.
    // Mirrors the Convex `getProfile({ revealKeys: true })` decryption
    // block at `convex/ai.ts:765-780`.
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
            // Surface the error to the caller but continue with the
            // rest of the config. The LLM call will fail with a
            // clearer message downstream.
            console.error(
              `[generateSessionTitle] decrypt failed for provider "${p}":`,
              err,
            );
          }
        }
        decrypted[p] = cfg;
      }
      customConfigs = decrypted;
    }
  } catch (err) {
    // No profile yet, or PB returned 404. Fall back to defaults.
    // (404 is a normal first-run state.)
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 404
    ) {
      // No profile — use defaults below.
    } else {
      console.error("[generateSessionTitle] profile fetch failed:", err);
    }
  }

  // 4. Resolve provider + modelId via the same helper the Convex action uses.
  const { runSimpleTask, getTaskProviderAndModel } = await import(
    "../../../convex/ai_providers"
  );
  const resolved = getTaskProviderAndModel(
    { preferences: { provider, taskModels } },
    "title",
  );

  // 5. Fetch messages for the session, oldest first (natural transcript order).
  let messages: { author: string; text: string }[];
  try {
    const list = await pb.collection("messages").getList(1, 200, {
      filter: `session = "${sessionId.replace(/"/g, '\\"')}"`,
      sort: "timestamp",
    });
    messages = list.items as unknown as { author: string; text: string }[];
  } catch (err) {
    console.error("[generateSessionTitle] messages fetch failed:", err);
    return { status: "skipped_no_messages" };
  }
  if (messages.length === 0) {
    return { status: "skipped_no_messages" };
  }

  // 6. Build the prompt (verbatim from the Convex action).
  const transcript = messages.map((m) => `${m.author}: ${m.text}`).join("\n");
  const prompt = `Based on the following conversation transcript, detect the primary language used and generate a very short, creative, and descriptive title in that exact same language (maximum 3-4 words). Output ONLY the title without any introductory text.
    Do not use quotes, punctuation, or special characters.
    Transcript:
    ${transcript}`;

  // 7. Run the LLM call. Catch all errors and return `failed_llm` so the
  //    caller can decide whether to log/alert.
  let title: string;
  try {
    const raw = await runSimpleTask({
      provider: resolved.provider,
      customConfigs,
      prompt,
      modelId: resolved.modelId,
    });
    title = raw.trim().replace(/["']/g, "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateSessionTitle] LLM call failed:", msg);
    return { status: "failed_llm", error: msg };
  }

  // 8. Write back. Mirrors the Convex `if (title && title.length > 2)` guard.
  if (!title || title.length <= 2) {
    return { status: "skipped_short_title" };
  }
  try {
    await pb.collection("chat_sessions").update(sessionId, { title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateSessionTitle] session update failed:", msg);
    return { status: "failed_llm", error: `update failed: ${msg}` };
  }
  return { status: "updated", title };
}
