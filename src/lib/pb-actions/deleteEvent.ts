import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { pruneFolioFileFromDb } from "../folio/sync";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface DeleteEventArgs {
  eventId: string;
}

export const deleteEvent: PbActionHandler<DeleteEventArgs, { success: boolean }> = async (
  args,
  ctx
) => {
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  // 1. Fetch current DB record to locate the workspace
  let record;
  try {
    record = await pb.collection("events").getOne(args.eventId);
  } catch (err: any) {
    if (err?.status === 404) {
      return { success: true }; // already deleted
    }
    throw err;
  }

  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
  const activeWorkspace = record.workspace || "";

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

  // 3. Locate the file by event ID suffix and delete it
  if (fs.existsSync(eventsDir)) {
    const files = fs.readdirSync(eventsDir);
    const targetFile = files.find((f) => f.endsWith(`-${args.eventId}.md`) || f === `event-${args.eventId}.md`);
    if (targetFile) {
      const filePath = join(eventsDir, targetFile);
      fs.unlinkSync(filePath);
      // Prune from database cache and RAG memories
      await pruneFolioFileFromDb(filePath, pb, folioRootPath);
    }
  }

  // 4. Delete notifications and DB record (pruneFolioFileFromDb already handles deleting DB record, but we do a fallback delete in case the file was not found)
  try {
    await pb.collection("events").delete(args.eventId);
  } catch {}

  try {
    const reminders = await pb.collection("scheduled_notifications").getFullList({
      filter: `targetId = "${args.eventId}"`
    });
    for (const r of reminders) {
      await pb.collection("scheduled_notifications").delete(r.id);
    }
  } catch {}

  return { success: true };
};
