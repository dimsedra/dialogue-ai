import { Agent } from '@mastra/core/agent';
import { TokenLimiter } from '@mastra/core/processors';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createXai } from '@ai-sdk/xai';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq } from '@ai-sdk/groq';
import { createCohere } from '@ai-sdk/cohere';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAlibaba } from '@ai-sdk/alibaba';
import { huggingface } from '@ai-sdk/huggingface';
import { createMinimax } from 'vercel-minimax-ai-provider';
import { ollama } from 'ollama-ai-provider';
import { opencode } from 'ai-sdk-provider-opencode-sdk';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { zhipu } from 'zhipu-ai-provider';
import * as tools from '../tools';
import { filterToolsByScope } from '../tools/categories';

export async function createDialogueAgent(
  provider?: string | null, 
  modelId?: string | null,
  apiKey?: string | null,
  baseUrl?: string | null,
  userName?: string | null,
  userBio?: string | null,
  behavioralProfile?: string | null,
  monthlyDigest?: string | null,
  latestWeeklyDigest?: string | null,
  timezone: string = 'UTC',
  personaName: string = 'Dialogue',
  personaPrompt: string = 'You build relationships through concrete behaviors, not prescribed tones.',
  scope?: { type: string; id: string; title: string } | null,
  mcpToolsets?: Record<string, Record<string, unknown>> | null
) {
  let model;
  const opts = { apiKey: apiKey || undefined, baseURL: baseUrl || undefined };
  
  switch (provider) {
    case 'anthropic':
      model = createAnthropic(opts)(modelId || 'claude-sonnet-4.6');
      break;
    case 'gemini':
      model = createGoogleGenerativeAI(opts)(modelId || 'gemini-3.5-flash');
      break;
    case 'deepseek':
      model = createDeepSeek(opts)(modelId || 'deepseek-chat');
      break;
    case 'xai':
      model = createXai(opts)(modelId || 'grok-2-latest');
      break;
    case 'mistral':
      model = createMistral(opts)(modelId || 'mistral-large-latest');
      break;
    case 'groq':
      model = createGroq(opts)(modelId || 'llama3-8b-8192');
      break;
    case 'cohere':
      model = createCohere(opts)(modelId || 'command-r-plus');
      break;
    case 'moonshotai':
      model = createMoonshotAI(opts)(modelId || 'moonshot-v1-8k');
      break;
    case 'deepinfra':
      model = createDeepInfra(opts)(modelId || 'meta-llama/Meta-Llama-3.3-70B-Instruct');
      break;
    case 'togetherai':
      model = createTogetherAI(opts)(modelId || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
      break;
    case 'fireworks':
      model = createFireworks(opts)(modelId || 'accounts/fireworks/models/llama-v3p3-70b-instruct');
      break;
    case 'alibaba':
      model = createAlibaba(opts)(modelId || 'qwen-turbo');
      break;

    case 'huggingface':
      model = huggingface(modelId || 'meta-llama/Meta-Llama-3.3-70B-Instruct');
      break;
    case 'minimax':
      model = createMinimax(opts)(modelId || 'minimax/minimax-m3');
      break;
    case 'ollama':
      // Ollama's provider doesn't strictly use createOllama with API keys by default, but we'll try to keep consistency
      model = ollama(modelId || 'llama3.3');
      break;
    case 'opencode':
      model = opencode(modelId || 'anthropic/claude-3-5-sonnet-20241022');
      break;
    case 'lmstudio':
      model = createOpenAICompatible({
        name: 'lmstudio',
        baseURL: baseUrl || 'http://localhost:1234/v1',
        apiKey: apiKey || 'lm-studio',
      })(modelId || 'local-model');
      break;
    case 'openrouter':
      model = createOpenRouter(opts)(modelId || 'anthropic/claude-3.5-sonnet:beta');
      break;
    case 'zhipu':
      model = zhipu(modelId || 'glm-4-plus');
      break;
    default:
      model = createOpenAI(opts)(modelId || 'gpt-5.5-pro');
      break;
  }

  let instructions = `You are ${personaName}. ${personaPrompt}`;
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      timeZoneName: 'short'
    });
    instructions += `\n\n## Temporal Context\nThe current date and time is ${formatter.format(new Date())}.\n`;
  } catch (e) {
    console.error("Failed to format timezone:", timezone, e);
    instructions += `\n\n## Temporal Context\nThe current date and time is ${new Date().toISOString()}.\n`;
  }
  
  if (userName || userBio) {
    instructions += `\n\n## User Identity\n`;
    if (userName) instructions += `- Name: ${userName}\n`;
    if (userBio) instructions += `- Bio/Facts: ${userBio}\n`;
  }
  
  if (behavioralProfile || monthlyDigest || latestWeeklyDigest) {
    instructions += `\n\n## Current Behavioral Context (OCEAN)\n`;
    if (behavioralProfile) instructions += `**Stable Baseline Profile:**\n${behavioralProfile}\n\n`;
    if (monthlyDigest) instructions += `**Latest Monthly Synthesis:**\n${monthlyDigest}\n\n`;
    if (latestWeeklyDigest) instructions += `**Latest Weekly Trend:**\n${latestWeeklyDigest}\n`;
  }

  if (scope) {
    instructions += `\n\n## Active Scope (Pinned Context)\nThe user has explicitly pinned the following item to this chat message:\n[${scope.type.toUpperCase()}] ${scope.title} (ID: ${scope.id})\n\nCRITICAL INSTRUCTION: When answering or executing tool calls for this query, ALWAYS prioritize this specific pinned context. If the user says "this", "reschedule this", "mark this done", etc., they are referring directly to this pinned active scope!`;
  }

  const activeCategoryNote = scope && ['task', 'event', 'habit'].includes(scope.type)
    ? `\n\n## Active Tool Scope\nOnly ${scope.type} tools and core utilities are available right now. You cannot create, modify, or delete entities outside the "${scope.type}" category in this turn.`
    : '';

  instructions += activeCategoryNote;

  if (mcpToolsets && Object.keys(mcpToolsets).length > 0) {
    instructions += `\n\n## External MCP Tools\nYou have access to the following MCP servers:\n`;
    for (const [serverName, tools] of Object.entries(mcpToolsets)) {
      const toolNames = Object.keys(tools).join(', ');
      instructions += `- ${serverName}: ${toolNames}\n`;
    }
    instructions += `\nUse these for file system operations, factual lookups, and external data access.`;
  }

  instructions += `

## CRITICAL: Tool Usage Rules

### Priority Decision Tree for Capturing Information
When the user shares information, follow this priority order — information belongs FIRST to its source entity, then to general memory:

**1. Task-related info** → call \`appendTaskNotes\` (or \`updateTask\` with notes)
If the user talks about a task's progress, blockers, thoughts, or context, append it as a chronological journal entry to that task. Task notes auto-index into semantic memory — no separate \`saveSemanticMemory\` call needed.

**2. Event-related info** → call \`appendEventNotes\` (or \`updateEvent\` with notes)
Log preparations, outcomes, or context to the event's journal. Event notes auto-index into semantic memory — no separate \`saveSemanticMemory\` call needed.

**3. Habit execution info** → call \`log_habit\` with the \`notes\` parameter
Always prompt for or deduce daily context to include in notes. Habit log notes auto-index into semantic memory — no separate \`saveSemanticMemory\` call needed.

**4. General user facts (NOT related to any task/event/habit)** → call \`saveSemanticMemory\`
Only for standalone knowledge: preferences, life context, project-level details, personal background. Break compound information into multiple separate tool calls (one fact per call). Examples:
- User says "My dad just got laid off" → call saveSemanticMemory with "User's father was recently laid off from his job after being employed for only half a month, following years of unemployment"
- User says "I prefer React over Vue" → call saveSemanticMemory with "User prefers React over Vue for frontend development"

**IMPORTANT**: Do NOT call \`saveSemanticMemory\` for information that belongs in a task note, event note, or habit log. Those tools auto-generate memories via the ingestion pipeline — calling \`saveSemanticMemory\` in addition creates duplicate, unlinked entries. You MUST actually CALL these tools to save information. Do NOT just say "I'll remember this" or "I've noted this" — those are LIES unless you invoke the tool.

### retrieveGraphContext — MANDATORY
Before answering questions about the user's history, preferences, or past conversations, CALL \`retrieveGraphContext\` first to check what you actually know. Do NOT fabricate memories.

### General Tool Rules
- NEVER claim you performed an action without actually calling the corresponding tool
- NEVER say "I've saved this" or "I've created a task" unless the tool call succeeded
- If a tool call fails, tell the user honestly`;

  const allTools = {
    addTask: tools.addTaskTool,
    updateTask: tools.updateTaskTool,
    completeTask: tools.completeTaskTool,
    deleteTask: tools.deleteTaskTool,
    addEvent: tools.addEventTool,
    updateEvent: tools.updateEventTool,
    updateEventOccurrence: tools.updateEventOccurrenceTool,
    deleteEvent: tools.deleteEventTool,
    saveSemanticMemory: tools.saveSemanticMemoryTool,
    deleteSemanticMemory: tools.deleteSemanticMemoryTool,
    retrieveGraphContext: tools.retrieveGraphContextTool,
    updateUserBio: tools.updateUserBioTool,
    searchWeb: tools.searchWebTool,
    searchHistoricalEntities: tools.searchHistoricalEntitiesTool,
    batchAddTasks: tools.batchAddTasksTool,
    getTaskNotes: tools.getTaskNotesTool,
    fetchUrl: tools.fetchUrlTool,
    getTaskResources: tools.getTaskResourcesTool,
    getEventResources: tools.getEventResourcesTool,
    listWorkspaces: tools.listWorkspacesTool,
    create_habit: tools.createHabitTool,
    log_habit: tools.logHabitTool,
    get_habit_consistency: tools.getHabitConsistencyTool,
    list_unread_notifications: tools.listUnreadNotificationsTool,
    create_custom_reminder: tools.createCustomReminderTool,
    appendTaskNotes: tools.appendTaskNotesTool,
    appendEventNotes: tools.appendEventNotesTool,
  };

  const filteredTools = scope ? filterToolsByScope(allTools, scope) : allTools;

  const agentConfig = {
    id: 'dialogueAgent',
    name: 'Dialogue AI Agent',
    instructions,
    model,
    inputProcessors: [
      new TokenLimiter(127000),
    ],
    hooks: {
      beforeToolCall: ({ toolName, input }: { toolName: string; input: Record<string, unknown> }) => {
        const sanitized = { ...input };
        for (const [key, val] of Object.entries(sanitized)) {
          if (typeof val === 'string' && val.length > 100) {
            sanitized[key] = val.slice(0, 100) + '...';
          }
        }
        delete sanitized.notes;
        delete sanitized.bio;
        delete sanitized.content;
        console.log(`[ToolCall] ${toolName}`, JSON.stringify(sanitized));
      },
      afterToolCall: ({ toolName, output, error }: { toolName: string; output: unknown; error?: Error }) => {
        if (error) {
          console.error(`[ToolCall] ${toolName} FAILED:`, error.message);
        }
      },
    },
    tools: filteredTools,
  };

  return new Agent(agentConfig as any);
}
