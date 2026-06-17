import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface UpdateMemoryArgs {
  id: string;
  text: string;
}

export const updateMemory: PbActionHandler<UpdateMemoryArgs, { success: boolean }> = async (
  args,
  ctx
) => {
  if (!args.id) throw new Error("Missing memory ID");
  if (!args.text || !args.text.trim()) throw new Error("Memory text cannot be empty");

  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  // 1. Fetch the memory from DB cache to resolve its old text and file path
  const record = await pb.collection("memories").getOne(args.id);
  if (!record) {
    throw new Error(`Memory record not found for ID: ${args.id}`);
  }

  const oldText = record.text;
  const sourceId = record.source_id;

  if (record.source_type !== "File" || !sourceId) {
    // If it's a legacy or structured source, update DB directly as fallback
    await pb.collection("memories").update(args.id, {
      text: args.text.trim(),
      updatedAt: Date.now(),
    });
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
    throw new Error(`Memory source file does not exist on disk: ${sourceId}`);
  }

  // 2. Read file and modify the line
  const content = fs.readFileSync(fileAbsPath, "utf8");
  const { metadata, body } = parseMarkdownFile(content);

  const lines = body.split("\n");
  let lineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.slice(2).trim();
      if (bulletText === oldText) {
        lineIndex = i;
        break;
      }
    }
  }

  let updatedBody: string;
  if (lineIndex !== -1) {
    const bulletPrefix = lines[lineIndex].trim().startsWith("* ") ? "* " : "- ";
    const leadingWhitespace = lines[lineIndex].match(/^\s*/)?.[0] || "";
    lines[lineIndex] = `${leadingWhitespace}${bulletPrefix}${args.text.trim()}`;
    updatedBody = lines.join("\n");
  } else {
    // Fallback: append if not found in the file
    let newBody = body.trimEnd();
    if (newBody) {
      newBody += `\n- ${args.text.trim()}\n`;
    } else {
      newBody = `- ${args.text.trim()}\n`;
    }
    updatedBody = newBody;
  }

  const serialized = serializeMarkdownFile(metadata, updatedBody);
  fs.writeFileSync(fileAbsPath, serialized, "utf8");

  // 3. Sync file back to DB in-process
  await syncFolioFileToDb(fileAbsPath, pb, folioRootPath);

  return { success: true };
};
