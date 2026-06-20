import type PocketBase from "pocketbase";
import { decrypt } from "../encryption";
import { updateDiskFileForEntity } from "../folio/sync";

export interface MergeSessionArgs {
  userId: string;
  sessionId: string;
  folioRootPath: string;
}

export interface MergeSessionResult {
  status: "merged" | "failed";
  summary?: string;
  error?: string;
}

export async function mergeSession(
  pb: PocketBase,
  args: MergeSessionArgs,
): Promise<MergeSessionResult> {
  const { userId, sessionId, folioRootPath } = args;

  try {
    // 1. Verify the session exists, is a branch, and belongs to the user
    let session;
    try {
      session = await pb.collection("chat_sessions").getOne(sessionId);
    } catch {
      return { status: "failed", error: "Session not found" };
    }
    if (session.user !== userId) {
      return { status: "failed", error: "Unauthorized" };
    }
    if (session.sessionType !== "branch") {
      return { status: "failed", error: "Only topic branches can be merged" };
    }
    if (session.archived) {
      return { status: "failed", error: "Branch is already merged and archived" };
    }

    const parentSessionId = session.parentSession;
    if (!parentSessionId) {
      return { status: "failed", error: "Parent trunk session not found on branch" };
    }

    // 2. Fetch messages in this branch (oldest first)
    const list = await pb.collection("messages").getList(1, 500, {
      filter: `session = "${sessionId}"`,
      sort: "timestamp",
    });
    const messages = list.items;

    let summary = "No discussion or messages occurred in this branch.";

    if (messages.length > 0) {
      // 3. Resolve LLM provider and credentials
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
                console.error(`[mergeSession] Decrypt failed for provider "${p}":`, err);
              }
            }
            decrypted[p] = cfg;
          }
          customConfigs = decrypted;
        }
      } catch (err) {
        // Fall back to defaults
      }

      const { runSimpleTask, getTaskProviderAndModel } = await import("../ai-providers");
      const resolved = getTaskProviderAndModel(
        { preferences: { provider, taskModels } },
        "title", // Reuse title generation model settings for consolidation tasks
      );

      // 4. Compile branch transcript
      const transcript = messages.map((m) => `${m.author}: ${m.text}`).join("\n");
      const prompt = `You are consolidating a specialized sub-conversation (topic branch) that is about to be merged back into the main timeline.
      
Review the following transcript of the topic branch:
${transcript}

Please write a high-density, structured summary of the outcomes, key decisions made, and actions taken during this branch. Focus on concrete facts and results. Keep it concise but detailed (maximum 2 paragraphs).
Output ONLY the summary itself. Do not include any introductory remarks.`;

      // 5. Run LLM
      try {
        const raw = await runSimpleTask({
          provider: resolved.provider,
          customConfigs,
          prompt,
          modelId: resolved.modelId,
        });
        summary = raw.trim();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[mergeSession] LLM consolidation failed:", msg);
        return { status: "failed", error: `LLM consolidation failed: ${msg}` };
      }
    }

    // 6. Post system narrated "Merge Commit" back in parent Trunk Session
    await pb.collection("messages").create({
      session: parentSessionId,
      text: `[Merge Commit] Topic branch "${session.title || "Untitled Branch"}" was merged:\n\n${summary}`,
      author: "System",
      timestamp: Date.now(),
    });

    // 7. Find and update associated tasks/events (on disk and DB)
    const todayStr = new Date().toISOString().slice(0, 10);
    const newLogEntry = { date: todayStr, note: `[Merged Branch: ${session.title || "Untitled Branch"}] ${summary}` };

    const tasksList = await pb.collection("tasks").getList(1, 200, {
      filter: `origin_branch = "${sessionId}"`,
    });
    for (const t of tasksList.items) {
      // Update disk file body
      await updateDiskFileForEntity("tasks", t.id, pb, folioRootPath, {
        appendNotes: `[Merged Branch: ${session.title || "Untitled Branch"}] ${summary}`,
      });

      // Update DB record history_logs
      const existingLogs = Array.isArray(t.history_logs) ? t.history_logs : [];
      await pb.collection("tasks").update(t.id, {
        history_logs: [...existingLogs, newLogEntry],
      });
    }

    const eventsList = await pb.collection("events").getList(1, 200, {
      filter: `origin_branch = "${sessionId}"`,
    });
    for (const e of eventsList.items) {
      // Update disk file body
      await updateDiskFileForEntity("events", e.id, pb, folioRootPath, {
        appendNotes: `[Merged Branch: ${session.title || "Untitled Branch"}] ${summary}`,
      });

      // Update DB record history_logs
      const existingLogs = Array.isArray(e.history_logs) ? e.history_logs : [];
      await pb.collection("events").update(e.id, {
        history_logs: [...existingLogs, newLogEntry],
      });
    }

    // 8. Archive the branch and update activities timestamps
    const now = Date.now();
    await pb.collection("chat_sessions").update(sessionId, {
      archived: true,
      lastActivity: now,
    });
    await pb.collection("chat_sessions").update(parentSessionId, {
      lastActivity: now,
    });

    return { status: "merged", summary };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mergeSession] Merge failed:", msg);
    return { status: "failed", error: msg };
  }
}
