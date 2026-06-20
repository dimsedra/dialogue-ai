import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { createDialogueAgent } from '@/mastra/agents/dialogueAgent';
import { isPbBackend } from '@/pb-compat/env';
import PocketBase from 'pocketbase';
import { pbRequestContext } from '@/lib/pb-server';
import { verifyPbToken } from '@/lib/pb-actions/auth';
import { mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parseMcpServers, createMcpClient, getToolsets } from '@/mastra/mcp/client';
import { reconcileFolio, folioRequestContext } from '@/lib/folio/sync';
import { DEFAULT_FOLIO_DIR } from '@/lib/folio/constants';
import { runObserver } from '@/lib/jobs/observer';


export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');
    const modelId = url.searchParams.get('modelId');
    const sessionId = url.searchParams.get('sessionId');
    
    const apiKey = req.headers.get('x-api-key');
    const baseUrl = req.headers.get('x-base-url');
    const timezone = req.headers.get('x-timezone') || 'UTC';
    const authToken = req.headers.get('x-auth-token') || req.headers.get('x-convex-auth-token') || undefined;
    const scopeHeader = req.headers.get('x-active-scope');
    let scope: { type: string; id: string; title: string } | null = null;
    if (scopeHeader) {
      try { scope = JSON.parse(scopeHeader); } catch {}
    }

    const isPb = isPbBackend();

    // Create an authenticated PB client
    let pbClient: PocketBase | null = null;
    if (isPb) {
      pbClient = new PocketBase(process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090");
      pbClient.autoCancellation(false);
      if (authToken) {
        const verifiedUser = await verifyPbToken(authToken);
        if (verifiedUser) {
          pbClient.authStore.save(authToken, verifiedUser as any);
        } else {
          pbClient.authStore.save(authToken, null);
        }
      }
    }

    // Fetch user profile from the active backend
    let userName = null;
    let userBio = null;
    let userPreferences = null;
    let monthlyDigest = null;
    let latestWeeklyDigest = null;
    let todaySummary = null;
    let timeFormat: "auto" | "12h" | "24h" = "auto";
    let folioName: string | null = null;
    
    try {
      if (isPb && pbClient?.authStore.isValid) {
        const userId = pbClient.authStore.record?.id;
        if (userId) {
          try {
            const userRecord = await pbClient.collection('users').getOne(userId);
            userName = userRecord.name;
          } catch (e) {
            console.warn("Could not fetch user record from users collection:", e);
          }

          try {
            const profile = await pbClient.collection('user_profile').getFirstListItem(`user = "${userId.replace(/"/g, '\\"')}"`);
            if (profile) {
              if (!userName) userName = profile.name;
              userBio = profile.bio;
              userPreferences = profile.preferences;

              if (userPreferences && typeof userPreferences === 'object') {
                const prefs = userPreferences as any;
                if (prefs.timeFormat) {
                  timeFormat = prefs.timeFormat;
                }
                if (typeof prefs.folioName === 'string') {
                  folioName = prefs.folioName;
                }
              }

              if (Array.isArray(profile.weeklyNotesSummaries) && profile.weeklyNotesSummaries.length > 0) {
                latestWeeklyDigest = profile.weeklyNotesSummaries[profile.weeklyNotesSummaries.length - 1];
              }
              if (Array.isArray(profile.monthlyNotesSummaries) && profile.monthlyNotesSummaries.length > 0) {
                monthlyDigest = profile.monthlyNotesSummaries[profile.monthlyNotesSummaries.length - 1];
              }

              try {
                const { getLocalDateString } = await import('@/lib/jobs/dateUtils');
                const dateString = getLocalDateString(timezone);
                const summaryRecord = await pbClient
                  .collection('session_summaries')
                  .getFirstListItem(`user = "${userId.replace(/"/g, '\\"')}" && date = "${dateString}"`);
                if (summaryRecord && summaryRecord.summary) {
                  todaySummary = summaryRecord.summary;
                }
              } catch (e) {
                // Expected if no sessions have run or compiled yet today
                console.log(`[Chat API] Checked today's summary, none found yet.`);
              }
            }
          } catch (e) {
            console.warn("Could not fetch user_profile record for agent context:", e);
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch user profile for agent context", err);
    }


    // Load MCP server config from user preferences and create toolsets
    const mcpServerDefs = parseMcpServers(userPreferences as Record<string, unknown> | null);
    const mcpClient = createMcpClient(mcpServerDefs);
    const mcpToolsets = await getToolsets(mcpClient);

    // Resolve user folio path or use DEV_LOCAL_PATH fallback
    let devFallbackPath = process.env.NODE_ENV === 'development' ? process.env.DEV_LOCAL_PATH : null;
    if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
      devFallbackPath = devFallbackPath.slice(1, -1);
    }
    const folioRootPath = req.headers.get('x-folio-path') || devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

    // Make sure the root directory exists
    if (!existsSync(folioRootPath)) {
      mkdirSync(folioRootPath, { recursive: true });
    }

    const activeWorkspace = req.headers.get('x-active-workspace') || '';
    let basePath = folioRootPath;
    if (activeWorkspace) {
      const legacyPath = join(folioRootPath, activeWorkspace);
      if (existsSync(legacyPath) && statSync(legacyPath).isDirectory()) {
        basePath = legacyPath;
      } else {
        const workspacesParent = join(folioRootPath, 'workspaces');
        let matchedFolder: string | null = null;
        if (existsSync(workspacesParent)) {
          const folders = readdirSync(workspacesParent);
          const matched = folders.find((f) => f.endsWith(`-${activeWorkspace}`));
          if (matched) {
            matchedFolder = matched;
          }
        }

        if (matchedFolder) {
          basePath = join(workspacesParent, matchedFolder);
        } else {
          let slug = 'workspace';
          if (isPb && pbClient) {
            try {
              const wsRec = await pbClient.collection('workspaces').getOne(activeWorkspace);
              if (wsRec && wsRec.name) {
                slug = wsRec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
              }
            } catch (err) {
              console.warn(`[Chat API] Could not fetch workspace record for ${activeWorkspace}:`, err);
            }
          }
          const folderName = `${slug}-${activeWorkspace}`;
          basePath = join(workspacesParent, folderName);
        }
      }
    }

    // Make sure the active workspace folder exists
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }

    const filesystem = new LocalFilesystem({
      basePath,
      contained: true,
      allowedPaths: [folioRootPath],
    });

    const userWorkspace = new Workspace({
      id: `dialogue-workspace-${sessionId || 'default'}`,
      filesystem,
      tools: {
        mastra_workspace_read_file: { name: 'readFolioFile' },
        mastra_workspace_write_file: { 
          name: 'writeFolioFile', 
          requireApproval: true,
          requireReadBeforeWrite: true,
        },
        mastra_workspace_list_files: { name: 'listFolioDirectory' },
        mastra_workspace_grep: { name: 'searchFolioContent' },
      }
    });

    // Auto-load local GGUF model if provider is local-gguf and model is not ready
    if (provider === 'local-gguf') {
      const localGguf = (userPreferences as any)?.localGguf || {};
      const modelPath = localGguf.modelPath;
      if (!modelPath) {
        return new Response(JSON.stringify({ error: "Local GGUF model path is not configured. Please go to Settings to select your local GGUF model." }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const RUNNER_URL = "http://127.0.0.1:11430";
        const statusRes = await fetch(`${RUNNER_URL}/status`, { cache: 'no-store' });
        const statusData = await statusRes.json();
        
        const normalizePath = (p: string) => p ? p.replace(/\\/g, '/').toLowerCase() : '';
        const isAlreadyLoaded = statusData.status === 'ready' && normalizePath(statusData.modelPath) === normalizePath(modelPath);
        const isCurrentlyLoading = statusData.status === 'loading' && normalizePath(statusData.modelPath) === normalizePath(modelPath);
        
        console.log(`[Chat API] GGUF status check:`, {
          status: statusData.status,
          runnerPath: statusData.modelPath,
          targetPath: modelPath,
          isAlreadyLoaded,
          isCurrentlyLoading
        });
        
        if (!isAlreadyLoaded) {
          if (!isCurrentlyLoading) {
            console.log(`[Chat API] Local GGUF model needs loading. Path: ${modelPath}`);
            // Trigger load on the runner
            await fetch(`${RUNNER_URL}/load`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                modelPath: modelPath,
                contextSize: Number(localGguf.contextSize || 4096),
                gpuLayers: Number(localGguf.gpuLayers ?? 99),
                threads: Number(localGguf.threads || 4)
              })
            });
          } else {
            console.log(`[Chat API] Local GGUF model is already loading by another request. Waiting...`);
          }

          // Poll until ready (up to 30 seconds)
          let loaded = false;
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 500));
            const checkRes = await fetch(`${RUNNER_URL}/status`, { cache: 'no-store' });
            const checkData = await checkRes.json();
            if (checkData.status === 'ready') {
              loaded = true;
              break;
            }
            if (checkData.status === 'error') {
              throw new Error(`Runner loading error: ${checkData.error}`);
            }
          }
          if (!loaded) {
            throw new Error("Timeout waiting for local model to load.");
          }
          console.log('[Chat API] Local GGUF model loaded successfully.');
        }
      } catch (err: any) {
        console.error("[Chat API] Local model load failed:", err);
        return new Response(JSON.stringify({ error: `Local LLM Engine failed to initialize: ${err.message}` }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Resolve session branching state
    let isBranch = false;
    let overdueTriagePrompt = '';
    if (isPb && pbClient && sessionId) {
      try {
        const sessionRecord = await pbClient.collection('chat_sessions').getOne(sessionId);
        if (sessionRecord) {
          if (sessionRecord.sessionType === 'branch') {
            isBranch = true;
          } else {
            // Trunk session. Fetch overdue tasks in this session's workspace.
            const wsId = sessionRecord.workspace;
            if (wsId) {
              const nowMs = Date.now();
              const userId = pbClient.authStore.record?.id;
              if (userId) {
                const tasksList = await pbClient.collection('tasks').getList(1, 100, {
                  filter: `user = "${userId.replace(/"/g, '\\"')}" && workspace = "${wsId.replace(/"/g, '\\"')}" && completed = false && dueDate > 0 && dueDate < ${nowMs}`,
                  sort: '+dueDate',
                });
                const overdueTasks = tasksList.items;
                if (overdueTasks.length > 0) {
                  overdueTriagePrompt = `\n\n## Overdue Task Alert\nThere are currently ${overdueTasks.length} overdue task(s) in this workspace:\n`;
                  overdueTasks.slice(0, 5).forEach((t: any) => {
                    const days = Math.max(1, Math.floor((nowMs - t.dueDate) / (24 * 60 * 60 * 1000)));
                    overdueTriagePrompt += `- "${t.text}" (due ${new Date(t.dueDate).toLocaleDateString()}, ${days} day(s) overdue)\n`;
                  });
                  if (overdueTasks.length > 5) {
                    overdueTriagePrompt += `- ... and ${overdueTasks.length - 5} more.\n`;
                  }
                  overdueTriagePrompt += `\nINSTRUCTION: Direct the user to address these overdue tasks. Suggest creating a specialized topic branch to triage them. Mention that they can click the branch icon on your response to start a branch for this.`;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Chat API] Could not fetch session record for ${sessionId} to determine branch state:`, err);
      }
    }

    // Create a dynamic agent configured with the user's provider settings and profile
    const dynamicAgent = await createDialogueAgent(
      provider, 
      modelId, 
      apiKey, 
      baseUrl, 
      userName, 
      userBio,
      monthlyDigest,
      latestWeeklyDigest,
      timezone,
      scope,
      mcpToolsets,
      timeFormat,
      userWorkspace,
      folioName,
      folioRootPath,
      isBranch,
      todaySummary,
      overdueTriagePrompt,
    );
    
    // File-based LibSQL ensures approval snapshots survive across HTTP requests
    const dbDir = join(process.cwd(), '.dialogue');
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    const tempMastra = new Mastra({
      agents: { dialogueAgent: dynamicAgent },
      storage: new LibSQLStore({
        id: 'approval-snapshots',
        url: 'file:.dialogue/approval.db',
      }),
      backgroundTasks: { enabled: true, defaultTimeoutMs: 30_000 },
    });

    // Vercel AI SDK 'useChat' sends the body payload here automatically
    const params = await req.json();
    
    // Inject scope as a system message so the model sees it prominently
    // in the conversation, not just buried in the agent instructions
    if (scope) {
      const scopeMsg = {
        role: 'system' as const,
        content: `[Active Scope Pin]\nThe user has pinned a specific item to this message. When they say "this", "it", "that task", "reschedule it", "mark it done", "add a note to it", etc., they are referring to:\nType: ${scope.type.toUpperCase()}\nTitle: ${scope.title}\nID: ${scope.id}\n\nUse the above ID directly in any tool calls (e.g. updateTask({ taskId: "${scope.id}", ... }), completeTask({ taskId: "${scope.id}" }), deleteTask({ taskId: "${scope.id}" })).`
      };
      params.messages = [scopeMsg, ...(params.messages || [])];
    }
    
    // Trigger background reconciliation on boot/API hit
    if (isPb && pbClient) {
      reconcileFolio(folioRootPath, pbClient).catch((err) => {
        console.error('[Sync Engine] Background reconciliation failed:', err);
      });
    }

    // Run agent execution within the PB authenticated context
    const executeStream = async () => {
      return folioRequestContext.run({ folioRootPath, activeWorkspace, basePath, activeSessionId: sessionId || undefined }, () => {
        return handleChatStream({
          mastra: tempMastra,
          agentId: 'dialogueAgent',
          sendReasoning: true,
          version: 'v6',
          params: {
            ...params,
            toolsets: mcpToolsets || undefined,
            maxSteps: 20,
          },
        });
      });
    };


    let stream;
    if (isPb && pbClient) {
      stream = await pbRequestContext.run(pbClient, executeStream);
    } else {
      stream = await executeStream();
    }
    
    // Return the response back in Vercel AI SDK UI streaming format
    const response = createUIMessageStreamResponse({ stream: stream as any });

    // Wrap response body to run Observer and disconnect MCPClient after streaming completes
    if (response.body) {
      const reader = response.body.getReader();
      const wrappedStream = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              if (mcpClient) {
                await mcpClient.disconnect();
              }

              // Trigger Observer asynchronously in the background
              if (isPb && pbClient && pbClient.authStore.record?.id) {
                const userId = pbClient.authStore.record.id;
                runObserver(pbClient, {
                  userId,
                  timezone,
                  sessionId: sessionId || undefined,
                }).catch((err) => {
                  console.error("[Observer] Background execution failed:", err);
                });
              }

              return;
            }
            controller.enqueue(value);
          } catch (e) {
            controller.error(e);
            if (mcpClient) {
              await mcpClient.disconnect();
            }
          }
        },
        cancel() {
          reader.cancel();
          if (mcpClient) {
            mcpClient.disconnect();
          }
        },
      });
      return new Response(wrappedStream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return response;
  } catch (error) {
    console.error("Chat API Routing Error:", error);
    return new Response(JSON.stringify({ error: "Agent Orchestration Failed" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
