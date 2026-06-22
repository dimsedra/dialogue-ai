import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const updateWorkspaceContextTool = createTool({
  id: 'updateWorkspaceContext',
  description: 'Updates the workspace CONTEXT.md file with macro-level project focus, active objectives, rules, and major milestones. PREFERRED over saveSemanticMemory when information relates to workspace-level context (project rules, architecture decisions, workspace purpose, behavioral guidelines). CONTEXT.md is loaded into the agent prompt when you are in a workspace — use this to persist information about what this workspace IS and how the AI should behave in it.',
  inputSchema: z.object({
    contextContent: z.string().describe("The full new CONTEXT.md content. Required sections: ## Purpose (always), ## Current State (always), ## User Notes (always, for explicit overrides). Optional sections: ## Behavioral Tuning (tone/style), ## Vibe (atmosphere/energy), ## Milestones (big-picture goals). PRESERVE all existing sections — only update the parts that need to change."),
  }),
  outputSchema: z.object({ success: z.boolean(), path: z.string() }),
  execute: async (input) => {
    const { getPbClient } = await import('../../lib/pb-server');
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { existsSync, writeFileSync } = await import('fs');
    const { join, relative } = await import('path');

    try {
      const pb = getPbClient();
      const { folioRootPath, basePath } = getFolioContext();

      if (!basePath) {
        throw new Error('No active workspace. Update workspace context requires a workspace scope.');
      }

      const contextFilePath = join(basePath, 'CONTEXT.md');
      writeFileSync(contextFilePath, input.contextContent, 'utf8');

      await syncFolioFileToDb(contextFilePath, pb, folioRootPath);

      const relPath = relative(folioRootPath, contextFilePath).replace(/\\/g, '/');

      return { success: true, path: relPath };
    } catch (err) {
      console.error('[updateWorkspaceContext Tool] Error:', err);
      throw err;
    }
  }
});
