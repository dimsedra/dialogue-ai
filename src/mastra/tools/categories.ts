/**
 * Tool category registry for scope-based tool filtering.
 * 
 * Every tool registered in the agent MUST have an entry here.
 * When adding a new tool, add the tool's key (as it appears in the
 * Agent's `tools:` object in dialogueAgent.ts) to this map.
 * 
 * Categories:
 *   core   — always available regardless of scope
 *   task   — available when a task is scope-pinned
 *   event  — available when an event is scope-pinned
 *   habit  — available when a habit is scope-pinned
 */
export type ToolCategory = 'core' | 'task' | 'event' | 'habit';

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  saveSemanticMemory: 'core',
  deleteSemanticMemory: 'core',
  retrieveGraphContext: 'core',
  updateUserBio: 'core',
  searchWeb: 'core',
  searchHistoricalEntities: 'core',
  fetchUrl: 'core',
  listWorkspaces: 'core',
  list_unread_notifications: 'core',
  create_custom_reminder: 'core',
  getTaskNotes: 'core',
  getTaskResources: 'core',
  getEventResources: 'core',
  checkUpcomingSchedule: 'core',

  addTask: 'task',
  updateTask: 'task',
  completeTask: 'task',
  deleteTask: 'task',
  appendTaskNotes: 'task',
  batchAddTasks: 'task',

  addEvent: 'event',
  updateEvent: 'event',
  updateEventOccurrence: 'event',
  deleteEvent: 'event',
  appendEventNotes: 'event',

  create_habit: 'habit',
  log_habit: 'habit',
  get_habit_consistency: 'habit',
};

const SCOPE_TO_CATEGORY: Record<string, ToolCategory> = {
  task: 'task',
  event: 'event',
  habit: 'habit',
};

export function filterToolsByScope<T extends Record<string, unknown>>(
  allTools: T,
  scope: { type: string } | null,
): Partial<T> {
  if (!scope) return allTools;
  const category = SCOPE_TO_CATEGORY[scope.type];
  if (!category) return allTools;

  return Object.fromEntries(
    Object.entries(allTools).filter(
      ([key]) => TOOL_CATEGORIES[key] === 'core' || TOOL_CATEGORIES[key] === category,
    ),
  ) as Partial<T>;
}
