import fs from "node:fs";
import { join, basename } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb, pruneFolioFileFromDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface UpdateEventArgs {
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  startTime?: number;
  endTime?: number;
  eventType?: "interval" | "point";
  recurrence?: any;
  reminderOffset?: number | null;
  cancelled?: boolean;
  notes?: string | null;
  outcome?: string | null;
  statusHook?: string | null;
}

export const updateEvent: PbActionHandler<UpdateEventArgs, { success: boolean }> = async (
  args,
  ctx
) => {
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  // 1. Fetch current DB record to locate the workspace
  const record = await pb.collection("events").getOne(args.eventId);
  if (!record) throw new Error(`Event not found: ${args.eventId}`);

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

  // 3. Locate the file by event ID suffix
  if (!fs.existsSync(eventsDir)) {
    throw new Error(`Events directory does not exist: ${eventsDir}`);
  }

  const files = fs.readdirSync(eventsDir);
  const targetFile = files.find((f) => f.endsWith(`-${args.eventId}.md`) || f === `event-${args.eventId}.md`);
  if (!targetFile) {
    throw new Error(`Event file not found on disk for ID: ${args.eventId}`);
  }

  const oldFilePath = join(eventsDir, targetFile);
  const fileContent = fs.readFileSync(oldFilePath, "utf8");
  const { metadata, body } = parseMarkdownFile(fileContent);

  // 4. Apply patches to metadata
  const newMetadata = { ...metadata };
  if (args.title !== undefined) newMetadata.title = args.title;
  if (args.description !== undefined) newMetadata.description = args.description;
  if (args.location !== undefined) newMetadata.location = args.location;
  if (args.startTime !== undefined) newMetadata.startTime = new Date(args.startTime).toISOString();
  if (args.endTime !== undefined) newMetadata.endTime = args.endTime ? new Date(args.endTime).toISOString() : null;
  if (args.eventType !== undefined) newMetadata.eventType = args.eventType;
  if (args.recurrence !== undefined) newMetadata.recurrence = args.recurrence;
  if (args.reminderOffset !== undefined) newMetadata.reminderOffset = args.reminderOffset;
  if (args.cancelled !== undefined) newMetadata.cancelled = args.cancelled;
  if (args.statusHook !== undefined) newMetadata.statusHook = args.statusHook || "";

  let newBody = body;
  if (args.notes !== undefined) {
    newBody = args.notes === null ? "" : args.notes;
  }
  if (args.outcome !== undefined) {
    newMetadata.outcome = args.outcome || "";
  }

  const serialized = serializeMarkdownFile(newMetadata, newBody);

  // 5. Check if title (and therefore slug) changed
  const newSlug = (newMetadata.title || args.eventId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
  const newFilename = `${newSlug}-${args.eventId}.md`;
  const newFilePath = join(eventsDir, newFilename);

  let renamed = false;
  if (newFilePath !== oldFilePath) {
    renamed = true;
    fs.writeFileSync(newFilePath, serialized, "utf8");
    try {
      fs.unlinkSync(oldFilePath);
    } catch (err) {
      console.warn(`[updateEvent Action] Failed to delete old file: ${oldFilePath}`, err);
    }
  } else {
    fs.writeFileSync(oldFilePath, serialized, "utf8");
  }

  if (renamed) {
    await pruneFolioFileFromDb(oldFilePath, pb, folioRootPath);
  }

  // 6. Sync changes back to PB cache
  await syncFolioFileToDb(newFilePath, pb, folioRootPath);

  // 7. Reschedule reminders
  try {
    const existingReminders = await pb.collection("scheduled_notifications").getFullList({
      filter: `targetId = "${args.eventId}" && kind = "event_remind" && delivered = false`
    });
    for (const er of existingReminders) {
      await pb.collection("scheduled_notifications").delete(er.id);
    }

    const finalStartTime = args.startTime ?? (record.startTime ? Number(record.startTime) : null);
    const finalReminderOffset = args.reminderOffset !== undefined ? args.reminderOffset : record.reminderOffset;
    const isCancelled = newMetadata.cancelled;

    if (!isCancelled && finalStartTime && finalReminderOffset !== null && finalReminderOffset >= 0) {
      const triggerAt = Math.max(Date.now(), finalStartTime - finalReminderOffset * 60 * 1000);
      await pb.collection("scheduled_notifications").create({
        user: ctx.user.id,
        kind: "event_remind",
        targetId: args.eventId,
        triggerAt,
        delivered: false,
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    console.error("[updateEvent Action] Failed to reschedule reminders:", err);
  }

  return { success: true };
};
