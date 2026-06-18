import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface CancelEventOccurrenceArgs {
  seriesId: string;
  originalStartTime: number;
  timezone?: string;
}

export const cancelEventOccurrence: PbActionHandler<
  CancelEventOccurrenceArgs,
  { success: boolean }
> = async (args, ctx) => {
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  // 1. Fetch parent record to resolve workspace
  const parentRecord = await pb.collection("events").getOne(args.seriesId);
  if (!parentRecord) throw new Error(`Parent event series not found: ${args.seriesId}`);

  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
  const activeWorkspace = parentRecord.workspace || "";

  // 2. Resolve events directory
  let basePath = folioRootPath;
  if (activeWorkspace) {
    const legacyPath = join(folioRootPath, activeWorkspace);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) {
      basePath = legacyPath;
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
        basePath = join(workspacesParent, matchedFolder);
      } else {
        basePath = join(workspacesParent, `workspace-${activeWorkspace}`);
      }
    }
  }

  const eventsDir = join(basePath, "events");

  // 3. Locate parent event file on disk
  if (!fs.existsSync(eventsDir)) {
    throw new Error(`Events directory does not exist: ${eventsDir}`);
  }

  const files = fs.readdirSync(eventsDir);
  const parentFile = files.find((f) => f.endsWith(`-${args.seriesId}.md`) || f === `event-${args.seriesId}.md`);
  if (!parentFile) {
    throw new Error(`Parent event file not found on disk for ID: ${args.seriesId}`);
  }

  const parentPath = join(eventsDir, parentFile);
  const parentContent = fs.readFileSync(parentPath, "utf8");
  const { metadata: parentMetadata, body: parentBody } = parseMarkdownFile(parentContent);

  // 4. Add exception to parent metadata
  if (!parentMetadata.recurrence) {
    throw new Error("Parent event is not a recurring event series");
  }

  const rec = { ...parentMetadata.recurrence };
  const exceptions = rec.exceptions ? [...rec.exceptions] : [];
  const exceptionsStr = rec.exceptionsStr ? [...rec.exceptionsStr] : [];

  const dateStr = new Date(args.originalStartTime).toLocaleDateString("en-CA", {
    timeZone: args.timezone || "UTC",
  });

  if (!exceptions.includes(args.originalStartTime)) {
    exceptions.push(args.originalStartTime);
  }
  if (!exceptionsStr.includes(dateStr)) {
    exceptionsStr.push(dateStr);
  }

  parentMetadata.recurrence = {
    ...rec,
    exceptions,
    exceptionsStr,
  };

  // Write parent series update back to disk
  fs.writeFileSync(parentPath, serializeMarkdownFile(parentMetadata, parentBody), "utf8");

  // 5. Sync parent file back to PB cache
  await syncFolioFileToDb(parentPath, pb, folioRootPath);

  return { success: true };
};
