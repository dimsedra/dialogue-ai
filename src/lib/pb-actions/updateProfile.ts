import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface UpdateProfileArgs {
  name?: string;
  bio?: string;
  preferences?: any;
}

export const updateProfile: PbActionHandler<
  UpdateProfileArgs,
  { success: boolean }
> = async (args, ctx) => {
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

  const systemDir = join(folioRootPath, "system");
  const targetAbsPath = join(systemDir, "USER.md");

  // 1. Ensure system directory exists
  if (!fs.existsSync(systemDir)) {
    fs.mkdirSync(systemDir, { recursive: true });
  }

  // 2. Fetch current profile from PocketBase to merge/resolve values
  let nameVal = args.name;
  let bioVal = args.bio;
  let currentPrefs = { theme: "system", sound: true };
  let profileRecord: any = null;

  try {
    profileRecord = await pb
      .collection("user_profile")
      .getFirstListItem(`user = "${ctx.user.id.replace(/"/g, '\\"')}"`);
    if (profileRecord) {
      if (nameVal === undefined) nameVal = profileRecord.name;
      if (bioVal === undefined) bioVal = profileRecord.bio;
      currentPrefs = profileRecord.preferences || currentPrefs;
    }
  } catch (err: any) {
    if (err?.status !== 404) {
      console.error("[updateProfile] Failed to fetch current user profile:", err);
    }
  }

  if (nameVal === undefined) nameVal = "User";
  if (bioVal === undefined) bioVal = "No bio yet.";

  if (args.preferences !== undefined) {
    currentPrefs = { ...currentPrefs, ...args.preferences };
  }

  // 3. Update PocketBase collections
  if (profileRecord) {
    await pb.collection("user_profile").update(profileRecord.id, {
      name: nameVal,
      bio: bioVal,
      preferences: currentPrefs,
    });
  } else {
    profileRecord = await pb.collection("user_profile").create({
      user: ctx.user.id,
      name: nameVal,
      bio: bioVal,
      preferences: currentPrefs,
    });
  }

  try {
    await pb.collection("users").update(ctx.user.id, { name: nameVal });
  } catch (err) {
    console.error("[updateProfile] Failed to update user record name:", err);
  }

  // 4. Update the USER.md file on disk, preserving other sections
  let updatedContent = "";
  const profileSectionContent = `## Profile\n- Name: ${nameVal}\n- Bio/Facts: ${bioVal}\n`;

  if (fs.existsSync(targetAbsPath)) {
    const existingContent = fs.readFileSync(targetAbsPath, "utf8");
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

  fs.writeFileSync(targetAbsPath, updatedContent, "utf8");

  // 5. Trigger sync engine file sync (which parses USER.md and validates correctness)
  await syncFolioFileToDb(targetAbsPath, pb, folioRootPath);

  return { success: true };
};
