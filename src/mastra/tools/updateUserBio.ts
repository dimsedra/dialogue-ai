import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const updateUserBioTool = createTool({
  id: 'updateUserBio',
  description: 'Updates the core user profile bio/personality summary and preferences.',
  inputSchema: z.object({
    bio: z.string().describe("The updated bio/personality summary"),
  }),
  execute: async (input) => {
    // Bio updates happen silently as part of the agent's core identity alignment
    return {
      action: "updateUserBio",
      payload: { bio: input.bio },
      status: "Profile updated."
    };
  }
});
