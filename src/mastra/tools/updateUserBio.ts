import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const updateUserBioTool = createTool({
  id: 'updateUserBio',
  description: 'Updates the core user profile bio/personality summary and preferences.',
  inputSchema: z.object({
    bio: z.string().describe("The updated bio/personality summary"),
  }),
  execute: async (input) => {
    console.log('[updateUserBio Tool] Executing with input:', input);
    const { getPbClient } = await import('../../lib/pb-server');
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');
    const { join } = await import('path');

    try {
      const pb = getPbClient();
      const user = pb.authStore.record?.id;
      if (!user) throw new Error("Unauthorized");

      const { folioRootPath } = getFolioContext();
      const systemDir = join(folioRootPath, "system");
      const targetAbsPath = join(systemDir, "USER.md");

      if (!existsSync(systemDir)) {
        mkdirSync(systemDir, { recursive: true });
      }

      // Fetch current profile to get name
      let nameVal = "User";
      let profileRecord: any = null;
      try {
        profileRecord = await pb
          .collection("user_profile")
          .getFirstListItem(`user = "${user.replace(/"/g, '\\"')}"`);
        if (profileRecord) {
          nameVal = profileRecord.name;
        }
      } catch (err: any) {
        if (err?.status !== 404) {
          console.error("[updateUserBio Tool] Failed to fetch current user profile:", err);
        }
      }

      const bioVal = input.bio;

      // Update PocketBase collections
      if (profileRecord) {
        await pb.collection("user_profile").update(profileRecord.id, {
          bio: bioVal,
        });
      } else {
        await pb.collection("user_profile").create({
          user: user,
          name: nameVal,
          bio: bioVal,
          preferences: { theme: "system", sound: true },
        });
      }

      // Update the USER.md file on disk, preserving other sections
      let updatedContent = "";
      const profileSectionContent = `## Profile\n- Name: ${nameVal}\n- Bio/Facts: ${bioVal}\n`;

      if (existsSync(targetAbsPath)) {
        const existingContent = readFileSync(targetAbsPath, "utf8");
        const lines = existingContent.split(/\r?\n/);
        let profileHeaderIndex = -1;
        let nextHeaderIndex = -1;

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed.startsWith("## Profile")) {
            profileHeaderIndex = i;
          } else if (
            profileHeaderIndex !== -1 &&
            nextHeaderIndex === -1 &&
            (trimmed.startsWith("##") || (trimmed.startsWith("#") && !trimmed.startsWith("# ")))
          ) {
            nextHeaderIndex = i;
          }
        }

        if (profileHeaderIndex === -1) {
          if (lines.length > 0 && lines[0].trim().startsWith("#")) {
            lines.splice(1, 0, "\n" + profileSectionContent);
          } else {
            lines.push("\n" + profileSectionContent);
          }
          updatedContent = lines.join("\n");
        } else {
          const before = lines.slice(0, profileHeaderIndex);
          const after = nextHeaderIndex !== -1 ? lines.slice(nextHeaderIndex) : [];
          updatedContent = [...before, profileSectionContent.trimEnd(), ...after].join("\n");
        }
      } else {
        updatedContent = `# User Profile\n\n${profileSectionContent}`;
      }

      writeFileSync(targetAbsPath, updatedContent, "utf8");

      // Trigger sync engine file sync
      await syncFolioFileToDb(targetAbsPath, pb, folioRootPath);

      return {
        action: "updateUserBio",
        payload: { bio: input.bio },
        status: "Profile updated."
      };
    } catch (err) {
      console.error('[updateUserBio Tool] Error during execution:', err);
      throw err;
    }
  }
});
