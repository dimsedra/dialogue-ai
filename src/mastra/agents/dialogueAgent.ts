import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
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

export function createDialogueAgent(
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
  scope?: { type: string; id: string; title: string } | null
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

  instructions += `

## CRITICAL: Tool Usage Rules

### Memory Tools — MANDATORY
You have two memory tools: \`saveSemanticMemory\` and \`retrieveGraphContext\`.

**saveSemanticMemory**: You MUST actually CALL this tool to save information. Do NOT just say "I'll remember this" or "I've noted this" — those are LIES unless you invoke the tool. When the user shares personal facts, preferences, life events, project details, emotional context, or anything worth remembering long-term, you MUST call \`saveSemanticMemory\` with a granular, specific fact. Break compound information into multiple separate tool calls (one fact per call). Examples:
- User says "My dad just got laid off" → call saveSemanticMemory with "User's father was recently laid off from his job after being employed for only half a month, following years of unemployment"
- User says "I prefer React over Vue" → call saveSemanticMemory with "User prefers React over Vue for frontend development"

**retrieveGraphContext**: Before answering questions about the user's history, preferences, or past conversations, CALL this tool first to check what you actually know. Do NOT fabricate memories.

### Proactive Journaling & Note-Taking — MANDATORY
You must proactively document the user's progress, blockers, thoughts, and reflections using specialized tools.
- **Task Updates / Blockers**: If the user shares an update about a task (even a casual remark in chat like "I'm stuck on this database issue" or "CORS is failing"), immediately call \`appendTaskNotes\` to record the context.
- **Event Outcomes**: When an event completes or you discuss a calendar item, call \`appendEventNotes\` to log details, preparations, or outcomes.
- **Habit Logs**: When logging a habit, always prompt for or deduce daily context to include in the \`notes\` parameter of \`log_habit\`.

### General Tool Rules
- NEVER claim you performed an action without actually calling the corresponding tool
- NEVER say "I've saved this" or "I've created a task" unless the tool call succeeded
- If a tool call fails, tell the user honestly
- Tools marked with _silentExecution run in the background — do not mention them to the user unless asked`;

  return new Agent({
    id: 'dialogueAgent',
    name: 'Dialogue AI Agent',
    instructions,
    model,
    tools: {
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
  }
});

}
