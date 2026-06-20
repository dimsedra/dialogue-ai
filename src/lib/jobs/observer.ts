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
import { syncFolioFileToDb, folioRequestContext } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";

export interface RunObserverArgs {
  userId: string;
  timezone: string;
  sessionId?: string;
}

export interface RunObserverResult {
  dailySummaryStatus: string;
  memoriesExtracted: number;
  cognitiveInertia?: {
    userMdUpdated: boolean;
    contextMdUpdated: boolean;
  };
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

  // Stage 3: Cognitive Inertia & Personalization Synthesis
  let userMdUpdated = false;
  let contextMdUpdated = false;
  try {
    const synthesisResult = await runCognitiveInertiaSynthesis(pb, userId, timezone, sessionId);
    userMdUpdated = synthesisResult.userMdUpdated;
    contextMdUpdated = synthesisResult.contextMdUpdated;
    console.log(`[Observer] Cognitive Inertia Synthesis completed: USER.md updated: ${userMdUpdated}, CONTEXT.md updated: ${contextMdUpdated}`);
  } catch (err) {
    console.error("[Observer] Cognitive Inertia Synthesis Stage failed:", err);
  }

  return {
    dailySummaryStatus,
    memoriesExtracted: memoriesExtractedCount,
    cognitiveInertia: {
      userMdUpdated,
      contextMdUpdated,
    },
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

async function runCognitiveInertiaSynthesis(
  pb: PocketBase,
  userId: string,
  timezone: string,
  sessionId?: string,
): Promise<{ userMdUpdated: boolean; contextMdUpdated: boolean }> {
  let userMdUpdated = false;
  let contextMdUpdated = false;

  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const folioRootPath = getFolioRootPath();
  const nowMs = Date.now();

  // --- Part 1: Weekly USER.md Synthesis ---
  try {
    const profileDoc = await pb
      .collection("user_profile")
      .getFirstListItem(`user = "${escapedUser}"`);

    const prefs = (profileDoc.preferences as Record<string, unknown>) || {};
    const lastSynthesis = Number(prefs.lastUserMdSynthesis || 0);
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    // Trigger weekly synthesis if never run before, if 7 days elapsed, or if digests list is empty
    const shouldRunWeekly = !lastSynthesis || (nowMs - lastSynthesis >= SEVEN_DAYS_MS) || !profileDoc.weeklyNotesSummaries || profileDoc.weeklyNotesSummaries.length === 0;

    if (shouldRunWeekly) {
      console.log(`[Observer] Triggering weekly USER.md profiling/synthesis for user ${userId}...`);

      const dateSevenDaysAgo = getLocalDateString(timezone, new Date(nowMs - SEVEN_DAYS_MS));
      const dailySummaries = await pb.collection("session_summaries").getFullList({
        filter: `user = "${escapedUser}" && date >= "${dateSevenDaysAgo}"`,
        sort: "date",
      });

      if (dailySummaries.length > 0) {
        const summariesText = dailySummaries.map((s) => `[${s.date}] ${s.summary}`).join("\n");

        let provider = (prefs.provider as string) || "gemini";
        let taskModels = prefs.taskModels as Record<string, string> | undefined;
        let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};

        if (prefs.customConfigs && typeof prefs.customConfigs === "object") {
          const raw = prefs.customConfigs as Record<string, { apiKey?: string; baseUrl?: string }>;
          for (const p of Object.keys(raw)) {
            const cfg = { ...raw[p] };
            if (cfg.apiKey && cfg.apiKey.includes(":")) {
              try {
                cfg.apiKey = await decrypt(cfg.apiKey);
              } catch (err) {
                console.error(`[Observer Weekly USER] decrypt failed for "${p}":`, err);
              }
            }
            customConfigs[p] = cfg;
          }
        }

        const { runSimpleTask, getTaskProviderAndModel } = await import("../ai-providers");
        const resolved = getTaskProviderAndModel({ preferences: { provider, taskModels } }, "reflection");

        const userMdPath = join(folioRootPath, "system", "USER.md");
        let currentBio = "";
        let userNameVal = profileDoc.name || "User";
        if (existsSync(userMdPath)) {
          const userMdContent = readFileSync(userMdPath, "utf8");
          const match = userMdContent.match(/[-*]\s*Bio\/Facts:\s*([\s\S]*?)(?:##|$)/i);
          if (match && match[1]) {
            currentBio = match[1].trim();
          }
        }

        const systemInstruction = "You are the personality profiling engine of Dialogue. Your job is to analyze daily summaries to extract the user's focus themes, recurring behavioral patterns, energy levels, and preferred work or casual styles. Output a updated personality biography.";
        
        const prompt = `Below are the daily summaries of the user's activities and thoughts for the past week:
${summariesText}

Current User Biography:
"${currentBio || "None yet."}"

Tasks:
1. Revise the User Biography to reflect newly observed patterns, focus themes, or preferences, while retaining important historical details. Keep the length under 1500 characters.
2. Summarize the past week's trajectory in a single brief, high-density 2-line sentence (this will be stored as the weekly digest).

Return your output EXACTLY as a JSON object with two fields: "updatedBio" (string) and "weeklyDigest" (string). Output ONLY raw JSON. No markdown wrapper, backticks, or explanation.`;

        const rawResult = await runSimpleTask({
          provider: resolved.provider,
          customConfigs,
          prompt,
          systemInstruction,
          modelId: resolved.modelId,
        });

        const cleanedResult = rawResult.trim().replace(/^```json/, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleanedResult);

        if (parsed && typeof parsed.updatedBio === "string" && typeof parsed.weeklyDigest === "string") {
          const updatedBio = parsed.updatedBio.trim();
          const weeklyDigest = parsed.weeklyDigest.trim();

          // Wrap in pbRequestContext and folioRequestContext so it gets PocketBase and path context
          const { pbRequestContext } = await import("../pb-server");
          await pbRequestContext.run(pb, async () => {
            await folioRequestContext.run({ folioRootPath, activeWorkspace: "", basePath: folioRootPath }, async () => {
              const { updateUserBioTool } = await import("../../mastra/tools/updateUserBio");
              await updateUserBioTool.execute({ bio: updatedBio });
            });
          });

          const currentWeeklySummaries = Array.isArray(profileDoc.weeklyNotesSummaries) ? profileDoc.weeklyNotesSummaries : [];
          const updatedWeeklySummaries = [...currentWeeklySummaries, weeklyDigest];

          const updatedPrefs = {
            ...prefs,
            lastUserMdSynthesis: nowMs,
          };

          await pb.collection("user_profile").update(profileDoc.id, {
            weeklyNotesSummaries: updatedWeeklySummaries,
            preferences: updatedPrefs,
          });

          userMdUpdated = true;
          console.log("[Observer] Weekly USER.md profiling successfully completed.");
        }
      }
    }
  } catch (err) {
    console.error("[Observer] Weekly USER.md profiling/synthesis stage failed:", err);
  }

  // --- Part 2: Milestone CONTEXT.md Synthesis ---
  try {
    if (sessionId) {
      const session = await pb.collection("chat_sessions").getOne(sessionId);
      const workspaceId = session.workspace || "";

      if (workspaceId) {
        const workspace = await pb.collection("workspaces").getOne(workspaceId);
        const wsSlug = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
        const wsFolder = `${wsSlug}-${workspaceId}`;
        const contextMdPath = join(folioRootPath, "workspaces", wsFolder, "CONTEXT.md");

        if (existsSync(contextMdPath)) {
          const todayBounds = getTodayBounds(timezone);
          const completedTasks = await pb.collection("tasks").getFullList({
            filter: `user = "${escapedUser}" && workspace = "${workspaceId}" && completed = true && completedAt >= ${todayBounds.start} && completedAt <= ${todayBounds.end}`,
          });
          const wsMessages = await pb.collection("messages").getFullList({
            filter: `session = "${sessionId}" && timestamp >= ${todayBounds.start} && timestamp <= ${todayBounds.end}`,
          });

          if (completedTasks.length > 0 || wsMessages.length > 0) {
            console.log(`[Observer] Triggering CONTEXT.md milestone review for workspace ${workspace.name}...`);

            const currentContext = readFileSync(contextMdPath, "utf8");
            const completedText = completedTasks.map((t) => `- ${t.text}`).join("\n");
            const transcript = wsMessages.map((m) => `${m.author === "user" ? "User" : "Companion"}: ${m.text}`).join("\n");

            const profileDoc = await pb
              .collection("user_profile")
              .getFirstListItem(`user = "${escapedUser}"`);
            const prefs = (profileDoc.preferences as Record<string, unknown>) || {};
            let provider = (prefs.provider as string) || "gemini";
            let taskModels = prefs.taskModels as Record<string, string> | undefined;
            let customConfigs: Record<string, { apiKey?: string; baseUrl?: string }> = {};

            if (prefs.customConfigs && typeof prefs.customConfigs === "object") {
              const raw = prefs.customConfigs as Record<string, { apiKey?: string; baseUrl?: string }>;
              for (const p of Object.keys(raw)) {
                const cfg = { ...raw[p] };
                if (cfg.apiKey && cfg.apiKey.includes(":")) {
                  try {
                    cfg.apiKey = await decrypt(cfg.apiKey);
                  } catch (err) {
                    console.error(`[Observer Milestone] decrypt failed for "${p}":`, err);
                  }
                }
                customConfigs[p] = cfg;
              }
            }

            const { runSimpleTask, getTaskProviderAndModel } = await import("../ai-providers");
            const resolved = getTaskProviderAndModel({ preferences: { provider, taskModels } }, "reflection");

            const systemInstruction = "You are the workspace context architect of Dialogue. Your job is to maintain the CONTEXT.md file for a workspace, ensuring it acts as a macro-level focus guide, NOT a daily diary.";

            const prompt = `Current CONTEXT.md Content:
\`\`\`markdown
${currentContext}
\`\`\`

Today's Completed Tasks in this Workspace:
${completedText || "None"}

Today's Workspace Conversations:
${transcript || "None"}

Task:
Review and potentially update the CONTEXT.md file. 

CRITICAL RULES FOR CONTEXT.MD:
1. CONTEXT.md is for MACRO-level project focus, active objectives, rules, and major milestones.
2. It is NOT a daily diary or log. Never add transient updates, transient user moods, or specific conversation details.
3. Do NOT create or maintain a "Recent Activity" diary block. Daily chitchat and reflections belong in the daily log, not here.
4. Only update the "Milestones / Current Focus" section if a major structural goal or milestone has actually been achieved or changed (e.g. "Completed Database setup").
5. For workspaces without a formal objective (e.g., casual workspaces or "chill zones"):
   - CONTEXT.md should focus on:
     - **Behavioral Tuning** (how the AI companion should adapt its tone, style, and responses specifically for this workspace, e.g., friendly, humorous, concise, relaxed, etc.).
     - **Vibe** (the overall atmosphere and emotional energy of the workspace, e.g., low-pressure, supportive, brain-dump, encouraging, etc.).
     - **Topic Affinities** (the core subjects, essence, and topics that the user frequently discusses or prefers to discuss here, e.g., sharing project updates, venting, talking about music, coding, etc.).
   - Update these sections when new persistent patterns in the user's topics of interest, conversational vibe, or requested AI behavior emerge from the conversations.
   - Keep it at a macro-level description of behavioral and topic preferences; do not list chronological session summaries or specific conversations.
6. Never add global user personality traits, general user biography details, or specific user preferences/facts to CONTEXT.md. These must reside in USER.md (global profile) or MEMORIES.md (semantic memories) to avoid redundancy and prompt collisions.
7. Enforce a strict budget of 3000 characters. Prioritize high-impact behavioral guidelines, core vibe rules, and active goals. Condense or merge overlapping sections.
8. If no structural changes or behavioral/vibe tuning updates are warranted, return the EXACT original CONTEXT.md content.

Return the final updated CONTEXT.md file content. Do NOT include markdown blocks, backticks, or introduction outside the file content. Return ONLY the markdown file.`;

            const rawResult = await runSimpleTask({
              provider: resolved.provider,
              customConfigs,
              prompt,
              systemInstruction,
              modelId: resolved.modelId,
            });

            let finalResult = rawResult.trim();

            if (finalResult && finalResult !== currentContext.trim() && finalResult.length > 3000) {
              console.log(`[Observer] CONTEXT.md generated length (${finalResult.length}) exceeds 3000 characters. Running refinement loop...`);
              const compressPrompt = `The following markdown content for a workspace CONTEXT.md exceeds our strict budget of 3000 characters (it is currently ${finalResult.length} characters).
Please condense, simplify, and merge sections to bring it under 3000 characters, while retaining the core behavioral tuning guidelines, workspace vibe, active objectives, and major milestones. 

CRITICAL RULES:
- Do NOT omit critical rules, active objectives, or core vibe descriptions, but express them with extreme brevity.
- Never add global user personality traits, general user biography details, or specific user preferences/facts (keep those in USER.md/MEMORIES.md).
- Return ONLY the final condensed markdown file content. Do NOT include markdown blocks, backticks, or introduction outside the file content.

Content to compress:
${finalResult}`;

              const compressedResult = await runSimpleTask({
                provider: resolved.provider,
                customConfigs,
                prompt: compressPrompt,
                systemInstruction,
                modelId: resolved.modelId,
              });
              finalResult = compressedResult.trim();
              console.log(`[Observer] Refinement completed. New length: ${finalResult.length}`);
            }

            if (finalResult && finalResult !== currentContext.trim()) {
              writeFileSync(contextMdPath, finalResult, "utf8");
              await syncFolioFileToDb(contextMdPath, pb, folioRootPath);
              contextMdUpdated = true;
              console.log("[Observer] CONTEXT.md workspace milestone synthesis successfully completed.");
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[Observer] Workspace CONTEXT.md milestone synthesis stage failed:", err);
  }

  return { userMdUpdated, contextMdUpdated };
}
