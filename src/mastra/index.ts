import { Mastra } from '@mastra/core/mastra';
import { createDialogueAgent } from './agents/dialogueAgent';

export const mastra = new Mastra({
  agents: { dialogueAgent: createDialogueAgent() },
});
