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
  }
});

}
