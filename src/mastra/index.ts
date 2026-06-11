import { Mastra } from '@mastra/core/mastra';

let _mastra: Mastra | null = null;

export async function getMastra(): Promise<Mastra> {
  if (!_mastra) {
    const { createDialogueAgent } = await import('./agents/dialogueAgent');
    _mastra = new Mastra({
      agents: { dialogueAgent: await createDialogueAgent() },
    });
  }
  return _mastra;
}
