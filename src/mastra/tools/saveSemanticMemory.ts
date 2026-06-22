import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs';
import { join, dirname, relative } from 'path';
import { getLocalEmbedding } from '../../lib/graph/embedding';
import { wireMentionsEdges } from '../../lib/graph/edges';
import { folioRequestContext, syncFolioFileToDb } from '../../lib/folio/sync';
import { parseMarkdownFile, serializeMarkdownFile } from '../../lib/folio/parser';
import { DEFAULT_FOLIO_DIR } from '../../lib/folio/constants';

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export const saveSemanticMemoryTool = createTool({
  id: 'saveSemanticMemory',
  description: 'Saves an ATOMIC semantic memory fact about the user. Each call = EXACTLY ONE indivisible fact (e.g. "User prefers React over Vue"). Do NOT combine multiple facts. For daily activity / "what happened" info, use queryDailyLogs instead. For task/event/habit info, use their respective tools — those auto-index into memory.',
  inputSchema: z.object({
    text: z.string().describe("The granular fact or preference to remember"),
    taskIds: z.array(z.string()).optional().describe("Optional: Task node IDs this memory mentions. Creates MENTIONS_TASK edges in the graph."),
    eventIds: z.array(z.string()).optional().describe("Optional: Event node IDs this memory mentions. Creates MENTIONS_EVENT edges in the graph."),
    habitIds: z.array(z.string()).optional().describe("Optional: Habit node IDs this memory mentions. Creates MENTIONS_HABIT edges in the graph."),
  }),
  execute: async (input) => {
    // Memory tools are strictly EXEMPT from the consent gate. They run silently.
    
    // 1. Generate local 384-dimensional embedding
    const truncatedEmbedding = await getLocalEmbedding(input.text);

    const { getPbClient } = await import('../../lib/pb-server');
    const pbClient = getPbClient();
    const userId = pbClient.authStore.record?.id;
    if (!userId) {
      console.warn("No user ID found in PB store, skipping memory save");
      return {
        action: "saveSemanticMemory",
        payload: { id: crypto.randomUUID(), text: input.text },
        status: "skipped_no_user"
      };
    }

    // Resolve workspace and folio context
    const ctx = folioRequestContext.getStore();
    let devFallbackPath = process.env.NODE_ENV === 'development' ? process.env.DEV_LOCAL_PATH : null;
    if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
      devFallbackPath = devFallbackPath.slice(1, -1);
    }
    const folioRootPath = ctx?.folioRootPath || devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
    const activeWorkspace = ctx?.activeWorkspace || '';

    let targetAbsPath: string;
    if (activeWorkspace) {
      if (ctx?.basePath) {
        targetAbsPath = join(ctx.basePath, 'MEMORIES.md');
      } else {
        const legacyPath = join(folioRootPath, activeWorkspace);
        if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) {
          targetAbsPath = join(legacyPath, 'MEMORIES.md');
        } else {
          const workspacesParent = join(folioRootPath, 'workspaces');
          let matchedFolder: string | null = null;
          if (fs.existsSync(workspacesParent)) {
            const folders = fs.readdirSync(workspacesParent);
            const matched = folders.find((f) => f.endsWith(`-${activeWorkspace}`));
            if (matched) {
              matchedFolder = matched;
            }
          }
          if (matchedFolder) {
            targetAbsPath = join(workspacesParent, matchedFolder, 'MEMORIES.md');
          } else {
            targetAbsPath = join(workspacesParent, `workspace-${activeWorkspace}`, 'MEMORIES.md');
          }
        }
      }
    } else {
      targetAbsPath = join(folioRootPath, 'system', 'MEMORIES.md');
    }
    const targetRelPath = relative(folioRootPath, targetAbsPath).replace(/\\/g, '/');

    // Fetch all existing memories for this user to check similarity
    const memories = await pbClient.collection('memories').getFullList({
      filter: `user = "${userId}"`,
    });

    let bestMatch: any = null;
    let highestSimilarity = 0;

    for (const m of memories) {
      const emb = Array.isArray(m.embedding) ? m.embedding : [];
      const similarity = dotProduct(emb, truncatedEmbedding);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = m;
      }
    }

    let finalMemoryId: string;

    if (highestSimilarity > 0.85 && bestMatch) {
      // We found a semantic duplicate!
      if (bestMatch.source_type !== 'File') {
        // It resides in Task, Event, HabitLog, etc.
        // Return skipped_duplicate, but still wire mentions
        await wireMentionsEdges(pbClient, bestMatch.id, {
          taskIds: input.taskIds,
          eventIds: input.eventIds,
          habitIds: input.habitIds,
        });

        return {
          action: "saveSemanticMemory",
          payload: { id: bestMatch.id, text: bestMatch.text },
          status: "skipped_duplicate"
        };
      } else {
        // It resides in a File source, so we update the line in that file
        const fileRelativePath = bestMatch.source_id;
        const fileAbsPath = join(folioRootPath, fileRelativePath);
        let finalSyncPath = fileAbsPath;

        if (fs.existsSync(fileAbsPath)) {
          const content = fs.readFileSync(fileAbsPath, 'utf8');
          const { metadata, body } = parseMarkdownFile(content);
          
          const lines = body.split('\n');
          let lineIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              const bulletText = trimmed.slice(2).trim();
              if (bulletText === bestMatch.text) {
                lineIndex = i;
                break;
              }
            }
          }

          if (lineIndex !== -1) {
            const bulletPrefix = lines[lineIndex].trim().startsWith('* ') ? '* ' : '- ';
            const leadingWhitespace = lines[lineIndex].match(/^\s*/)?.[0] || '';
            lines[lineIndex] = `${leadingWhitespace}${bulletPrefix}${input.text}`;
            const newBody = lines.join('\n');
            const serialized = serializeMarkdownFile(metadata, newBody);
            fs.writeFileSync(fileAbsPath, serialized, 'utf8');
          } else {
            // Bullet not found in file body, let's append it
            let newBody = body.trimEnd();
            if (newBody) {
              newBody += `\n- ${input.text}\n`;
            } else {
              newBody = `- ${input.text}\n`;
            }
            const serialized = serializeMarkdownFile(metadata, newBody);
            fs.writeFileSync(fileAbsPath, serialized, 'utf8');
          }
        } else {
          // File not found (e.g. deleted), we write to the current target file instead
          fs.mkdirSync(dirname(targetAbsPath), { recursive: true });
          
          const existingContent = fs.existsSync(targetAbsPath) ? fs.readFileSync(targetAbsPath, 'utf8') : '';
          const { metadata, body } = parseMarkdownFile(existingContent);
          
          let newBody = body.trimEnd();
          if (newBody) {
            newBody += `\n- ${input.text}\n`;
          } else {
            newBody = `- ${input.text}\n`;
          }
          const serialized = serializeMarkdownFile(metadata, newBody);
          fs.writeFileSync(targetAbsPath, serialized, 'utf8');
          finalSyncPath = targetAbsPath;
        }

        // Re-sync file to DB
        await syncFolioFileToDb(finalSyncPath, pbClient, folioRootPath);

        // Fetch the new/updated record ID via its hash
        const newHash = crypto.createHash('sha256').update(input.text).digest('hex');
        const updatedRecords = await pbClient.collection('memories').getList(1, 1, {
          filter: `user = "${userId}" && hash = "${newHash}"`,
        });

        finalMemoryId = updatedRecords.items[0]?.id || bestMatch.id;
      }
    } else {
      // No duplicate found, we append to the current context's memory file
      fs.mkdirSync(dirname(targetAbsPath), { recursive: true });
      const existingContent = fs.existsSync(targetAbsPath) ? fs.readFileSync(targetAbsPath, 'utf8') : '';
      const { metadata, body } = parseMarkdownFile(existingContent);
      
      let newBody = body.trimEnd();
      if (newBody) {
        newBody += `\n- ${input.text}\n`;
      } else {
        newBody = `- ${input.text}\n`;
      }
      
      const serialized = serializeMarkdownFile(metadata, newBody);
      fs.writeFileSync(targetAbsPath, serialized, 'utf8');

      // Re-sync file to DB
      await syncFolioFileToDb(targetAbsPath, pbClient, folioRootPath);

      // Fetch the newly created record ID
      const newHash = crypto.createHash('sha256').update(input.text).digest('hex');
      const newRecords = await pbClient.collection('memories').getList(1, 1, {
        filter: `user = "${userId}" && hash = "${newHash}"`,
      });

      finalMemoryId = newRecords.items[0]?.id || crypto.randomUUID();
    }

    // Link any new mentions (tasks, events, habits) to that record
    await wireMentionsEdges(pbClient, finalMemoryId, {
      taskIds: input.taskIds,
      eventIds: input.eventIds,
      habitIds: input.habitIds,
    });

    return {
      action: "saveSemanticMemory",
      payload: { id: finalMemoryId, text: input.text },
      status: "Memory saved."
    };
  }
});

