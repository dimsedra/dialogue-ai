import fs from "node:fs";
import { join, dirname, relative } from "node:path";
import crypto from "node:crypto";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface CreateMemoryArgs {
  text: string;
  workspaceId?: string;
}

export const createMemory: PbActionHandler<CreateMemoryArgs, { id: string }> = async (
  args,
  ctx
) => {
  if (!args.text || !args.text.trim()) {
    throw new Error("Memory text cannot be empty");
  }

  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
  const activeWorkspace = args.workspaceId || "";

  let targetAbsPath: string;
  if (activeWorkspace) {
    const legacyPath = join(folioRootPath, activeWorkspace);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) {
      targetAbsPath = join(legacyPath, "workspace_memories.md");
    } else {
      const workspacesParent = join(folioRootPath, "workspaces");
      let matchedFolder: string | null = null;
      if (fs.existsSync(workspacesParent)) {
        const folders = fs.readdirSync(workspacesParent);
        const matched = folders.find((f) => f.endsWith(`-${activeWorkspace}`));
        if (matched) {
          matchedFolder = matched;
        }
      }
      if (matchedFolder) {
        targetAbsPath = join(workspacesParent, matchedFolder, "workspace_memories.md");
      } else {
        targetAbsPath = join(workspacesParent, `workspace-${activeWorkspace}`, "workspace_memories.md");
      }
    }
  } else {
    targetAbsPath = join(folioRootPath, "system", "memories.md");
  }

  // 1. Ensure directory exists
  fs.mkdirSync(dirname(targetAbsPath), { recursive: true });

  // 2. Read, append bullet, and serialize
  const existingContent = fs.existsSync(targetAbsPath) ? fs.readFileSync(targetAbsPath, "utf8") : "";
  const { metadata, body } = parseMarkdownFile(existingContent);
  
  let newBody = body.trimEnd();
  if (newBody) {
    newBody += `\n- ${args.text.trim()}\n`;
  } else {
    newBody = `- ${args.text.trim()}\n`;
  }
  
  const serialized = serializeMarkdownFile(metadata, newBody);
  fs.writeFileSync(targetAbsPath, serialized, "utf8");

  // 3. Sync file back to DB in-process
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);
  
  await syncFolioFileToDb(targetAbsPath, pb, folioRootPath);

  // 4. Retrieve the newly created DB record ID by its hash
  const hash = crypto.createHash("sha256").update(args.text.trim()).digest("hex");
  const records = await pb.collection("memories").getList(1, 1, {
    filter: `user = "${ctx.user.id}" && hash = "${hash}"`,
  });

  const recordId = records.items[0]?.id || "";
  return { id: recordId };
};
