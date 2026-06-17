import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface DeleteMemoryArgs {
  id: string;
}

export const deleteMemory: PbActionHandler<DeleteMemoryArgs, { success: boolean }> = async (
  args,
  ctx
) => {
  if (!args.id) throw new Error("Missing memory ID");

  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  // 1. Fetch the memory from DB cache to resolve its text and file path
  let record: any = null;
  try {
    record = await pb.collection("memories").getOne(args.id);
  } catch (err) {
    // If it's already gone from the DB, return success
    return { success: true };
  }

  if (!record) {
    return { success: true };
  }

  const textToDelete = record.text;
  const sourceId = record.source_id;

  if (record.source_type !== "File" || !sourceId) {
    // If it's not a file-sourced memory, delete from DB directly
    await pb.collection("memories").delete(args.id);
    return { success: true };
  }

  // Resolve absolute path
  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
  const fileAbsPath = join(folioRootPath, sourceId);

  if (!fs.existsSync(fileAbsPath)) {
    // If file is gone, clean up the DB record directly
    await pb.collection("memories").delete(args.id);
    return { success: true };
  }

  // 2. Read file, find and remove the matching bullet line
  const content = fs.readFileSync(fileAbsPath, "utf8");
  const { metadata, body } = parseMarkdownFile(content);

  const lines = body.split("\n");
  let lineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.slice(2).trim();
      if (bulletText === textToDelete) {
        lineIndex = i;
        break;
      }
    }
  }

  if (lineIndex !== -1) {
    lines.splice(lineIndex, 1);
  }

  const serialized = serializeMarkdownFile(metadata, lines.join("\n"));
  fs.writeFileSync(fileAbsPath, serialized, "utf8");

  // 3. Sync file back to DB in-process (this will prune/delete the memory record)
  await syncFolioFileToDb(fileAbsPath, pb, folioRootPath);

  // 4. Double check if the memory was deleted, if not delete manually
  try {
    await pb.collection("memories").delete(args.id);
  } catch {
    // Expecting it to fail if already pruned by sync
  }

  return { success: true };
};
