import type PocketBase from "pocketbase";
import { join, dirname, relative } from "path";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

import { decrypt } from "../encryption";
import { getTodayBounds, getLocalDateString } from "./dateUtils";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";
import { generateDailySummary } from "./generateDailySummary";
import { getLocalEmbedding } from "../graph/embedding";
import { wireMentionsEdges } from "../graph/edges";
import { syncFolioFileToDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";

export interface RunObserverArgs {
  userId: string;
  timezone: string;
  sessionId?: string;
}

export interface RunObserverResult {
  dailySummaryStatus: string;
  memoriesExtracted: number;
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function getFolioRootPath(): string {
  let devFallbackPath = process.env.NODE_ENV === "development" ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  return devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
}

export async function runObserver(
  pb: PocketBase,
  args: RunObserverArgs,
): Promise<RunObserverResult> {
  const { userId, timezone, sessionId } = args;

  console.log(`[Observer] Starting execution for user ${userId}, timezone: ${timezone}, session: ${sessionId || "none"}`);

  // Stage 1: Daily Log Summary
  let dailySummaryStatus = "skipped";
  try {
    const summaryRes = await generateDailySummary(pb, { userId, timezone });
    dailySummaryStatus = summaryRes.status;
    console.log(`[Observer] Daily Summary Stage completed with status: ${dailySummaryStatus}`);
  } catch (err) {
    console.error("[Observer] Daily Summary Stage failed:", err);
    dailySummaryStatus = "error";
  }

  // Stage 2: Memory Extraction (only if sessionId is provided)
  let memoriesExtractedCount = 0;
  if (sessionId) {
    try {
      memoriesExtractedCount = await runMemoryExtraction(pb, userId, timezone, sessionId);
      console.log(`[Observer] Memory Extraction Stage completed. Extracted ${memoriesExtractedCount} memory/memories.`);
    } catch (err) {
      console.error("[Observer] Memory Extraction Stage failed:", err);
    }
  }

  return {
    dailySummaryStatus,
    memoriesExtracted: memoriesExtractedCount,
  };
}

async function runMemoryExtraction(
  pb: PocketBase,
  userId: string,
  timezone: string,
  sessionId: string,
): Promise<number> {
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const { start: startOfDay } = getTodayBounds(timezone);
  let memoriesExtractedCount = 0;

  // 1. Fetch today's messages in this session
  const messages = await pb.collection("messages").getFullList({
    filter: `session = "${sessionId}" && timestamp >= ${startOfDay}`,
    sort: "timestamp",
  });

  if (messages.length === 0) {
    console.log(`[Observer] No messages found for session ${sessionId} today, skipping memory extraction.`);
    return 0;
  }

  // 2. Format chat transcript
  const transcript = messages
    .map((m) => `${m.author === "user" ? "User" : "Companion"}: ${m.text}`)
    .join("\n");

  // 3. Resolve user profile preferences for AI models
  let provider = "gemini";
  let taskModels: Record<string, string> | undefined;
  let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};

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
            console.error(`[Observer] decrypt failed for "${p}":`, err);
          }
        }
        decrypted[p] = cfg;
      }
      customConfigs = decrypted;
    }
  } catch (err) {
    console.warn("[Observer] profile fetch failed, using default provider config:", err);
  }

  // 4. Resolve the model for memory extraction
  const { runSimpleTask, getTaskProviderAndModel } = await import("../ai-providers");
  const resolved = getTaskProviderAndModel({ preferences: { provider, taskModels } }, "reflection");

  // 5. Run LLM extraction task
  const systemInstruction = `You are the memory extraction module of Dialogue, a relationship-first AI companion. 
Your goal is to parse the conversation transcript and identify new, persistent personal facts, preferences, or life details about the user (e.g. favorite topics, technologies, work conditions, habits, relationship updates) that are NOT temporary feelings, chit-chat, or task progress updates.`;

  const prompt = `Read the following chat transcript between the User and the Companion.
Identify any new, persistent personal facts, background details, or long-term preferences about the user (e.g., job title, family details, favorite technologies, personal habits, food preferences) that are NOT temporary emotions, greeting chit-chat, or task notes/habit log details.

Format your output as a raw JSON array of strings (e.g. ["User is a software engineer.", "User prefers light mode UI."]). If no new facts are found, return an empty array [].
Do NOT include any markdown formatting, backticks, or explanation. Output ONLY the JSON array.

Chat Transcript:
${transcript}`;

  let extractedFacts: string[] = [];
  try {
    const rawResult = await runSimpleTask({
      provider: resolved.provider,
      customConfigs,
      prompt,
      systemInstruction,
      modelId: resolved.modelId,
    });

    const cleanedResult = rawResult.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleanedResult);
    if (Array.isArray(parsed)) {
      extractedFacts = parsed.filter((item) => typeof item === "string");
    }
  } catch (err) {
    console.error("[Observer] Failed to extract or parse memories from LLM:", err);
    return 0;
  }

  if (extractedFacts.length === 0) {
    console.log("[Observer] No facts extracted from this transcript.");
    return 0;
  }

  console.log(`[Observer] Extracted ${extractedFacts.length} facts:`, extractedFacts);

  // 6. Resolve session workspace context to write memories to the right file
  let workspaceId = "";
  try {
    const session = await pb.collection("chat_sessions").getOne(sessionId);
    workspaceId = session.workspace || "";
  } catch (err) {
    console.error("[Observer] Failed to fetch session workspace ID:", err);
  }

  const folioRootPath = getFolioRootPath();
  let targetAbsPath: string;

  if (workspaceId) {
    try {
      const workspace = await pb.collection("workspaces").getOne(workspaceId);
      const slug = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
      targetAbsPath = join(folioRootPath, "workspaces", `${slug}-${workspaceId}`, "MEMORIES.md");
    } catch (err) {
      console.error(`[Observer] Failed to resolve path for workspace ${workspaceId}, falling back to system/MEMORIES.md:`, err);
      targetAbsPath = join(folioRootPath, "system", "MEMORIES.md");
    }
  } else {
    targetAbsPath = join(folioRootPath, "system", "MEMORIES.md");
  }

  const targetRelPath = relative(folioRootPath, targetAbsPath).replace(/\\/g, "/");

  // 7. Save each fact with duplicate checking and file writes
  // Fetch existing memories to check semantic similarity
  let existingMemories: any[] = [];
  try {
    existingMemories = await pb.collection("memories").getFullList({
      filter: `user = "${escapedUser}"`,
    });
  } catch (err) {
    console.error("[Observer] Failed to fetch existing memories:", err);
  }

  for (const text of extractedFacts) {
    try {
      const embedding = await getLocalEmbedding(text);

      let bestMatch: any = null;
      let highestSimilarity = 0;

      for (const m of existingMemories) {
        const emb = Array.isArray(m.embedding) ? m.embedding : [];
        const similarity = dotProduct(emb, embedding);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = m;
        }
      }

      let finalMemoryId: string;

      if (highestSimilarity > 0.85 && bestMatch) {
        if (bestMatch.source_type !== "File") {
          // If it resides in a task or event outcome, we skip saving it as a standalone semantic memory
          console.log(`[Observer] Fact is a duplicate of a non-file memory (similarity ${highestSimilarity.toFixed(2)}): ${bestMatch.text}`);
          continue;
        }

        // It resides in a file, so we update the file content
        const fileAbsPath = join(folioRootPath, bestMatch.source_id);
        let finalSyncPath = fileAbsPath;

        if (existsSync(fileAbsPath)) {
          const content = readFileSync(fileAbsPath, "utf8");
          const { metadata, body } = parseMarkdownFile(content);

          const lines = body.split("\n");
          let lineIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
              const bulletText = trimmed.slice(2).trim();
              if (bulletText === bestMatch.text) {
                lineIndex = i;
                break;
              }
            }
          }

          if (lineIndex !== -1) {
            const bulletPrefix = lines[lineIndex].trim().startsWith("* ") ? "* " : "- ";
            const leadingWhitespace = lines[lineIndex].match(/^\s*/)?.[0] || "";
            lines[lineIndex] = `${leadingWhitespace}${bulletPrefix}${text}`;
            const newBody = lines.join("\n");
            const serialized = serializeMarkdownFile(metadata, newBody);
            writeFileSync(fileAbsPath, serialized, "utf8");
          } else {
            let newBody = body.trimEnd();
            newBody = newBody ? `${newBody}\n- ${text}\n` : `- ${text}\n`;
            const serialized = serializeMarkdownFile(metadata, newBody);
            writeFileSync(fileAbsPath, serialized, "utf8");
          }
        } else {
          // Fallback if the file was deleted, append to current target memories
          mkdirSync(dirname(targetAbsPath), { recursive: true });
          const existingContent = existsSync(targetAbsPath) ? readFileSync(targetAbsPath, "utf8") : "";
          const { metadata, body } = parseMarkdownFile(existingContent);

          let newBody = body.trimEnd();
          newBody = newBody ? `${newBody}\n- ${text}\n` : `- ${text}\n`;
          const serialized = serializeMarkdownFile(metadata, newBody);
          writeFileSync(targetAbsPath, serialized, "utf8");
          finalSyncPath = targetAbsPath;
        }

        await syncFolioFileToDb(finalSyncPath, pb, folioRootPath);

        const newHash = crypto.createHash("sha256").update(text).digest("hex");
        const updatedRecords = await pb.collection("memories").getList(1, 1, {
          filter: `user = "${userId}" && hash = "${newHash}"`,
        });

        finalMemoryId = updatedRecords.items[0]?.id || bestMatch.id;
        console.log(`[Observer] Updated duplicate memory to: ${text}`);
      } else {
        // No duplicate found, write to file
        mkdirSync(dirname(targetAbsPath), { recursive: true });
        const existingContent = existsSync(targetAbsPath) ? readFileSync(targetAbsPath, "utf8") : "";
        const { metadata, body } = parseMarkdownFile(existingContent);

        let newBody = body.trimEnd();
        newBody = newBody ? `${newBody}\n- ${text}\n` : `- ${text}\n`;
        const serialized = serializeMarkdownFile(metadata, newBody);
        writeFileSync(targetAbsPath, serialized, "utf8");

        await syncFolioFileToDb(targetAbsPath, pb, folioRootPath);

        const newHash = crypto.createHash("sha256").update(text).digest("hex");
        const newRecords = await pb.collection("memories").getList(1, 1, {
          filter: `user = "${userId}" && hash = "${newHash}"`,
        });

        finalMemoryId = newRecords.items[0]?.id || crypto.randomUUID();
        console.log(`[Observer] Created new semantic memory: ${text}`);
      }

      // Link graph edges
      await wireMentionsEdges(pb, finalMemoryId, {
        taskIds: [],
        eventIds: [],
        habitIds: [],
      });

      memoriesExtractedCount++;
    } catch (err) {
      console.error(`[Observer] Failed saving memory fact: ${text}`, err);
    }
  }

  return memoriesExtractedCount;
}
