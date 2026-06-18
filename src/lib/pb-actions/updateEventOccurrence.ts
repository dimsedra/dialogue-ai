import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { parseMarkdownFile, serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface UpdateEventOccurrenceArgs {
  seriesId: string;
  originalStartTime: number;
  title?: string;
  description?: string;
  location?: string;
  startTime?: number;
  endTime?: number;
  eventType?: "interval" | "point";
  cancelled?: boolean;
  timezone?: string;
  notes?: string;
  outcome?: string;
  statusHook?: string;
}

export const updateEventOccurrence: PbActionHandler<
  UpdateEventOccurrenceArgs,
  { detachedEventId: string }
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

  // 5. Create new detached occurrence file
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const eventId = Array.from({ length: 15 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  const duration = parentRecord.endTime ? Number(parentRecord.endTime) - Number(parentRecord.startTime) : 0;
  const finalStartTime = args.startTime ?? args.originalStartTime;
  const finalEndTime = parentRecord.endTime ? (args.endTime ?? finalStartTime + duration) : null;

  const newMetadata = {
    id: eventId,
    title: args.title ?? parentRecord.title,
    description: args.description ?? (parentRecord.description || ""),
    location: args.location ?? (parentRecord.location || ""),
    startTime: new Date(finalStartTime).toISOString(),
    endTime: finalEndTime ? new Date(finalEndTime).toISOString() : null,
    eventType: args.eventType ?? (parentRecord.eventType || "point"),
    cancelled: args.cancelled ?? false,
    series: args.seriesId,
    reminderOffset: parentRecord.reminderOffset !== undefined ? parentRecord.reminderOffset : null,
    statusHook: args.statusHook ?? (parentRecord.statusHook || ""),
    outcome: args.outcome ?? (parentRecord.outcome || ""),
    createdAt: new Date().toISOString(),
  };

  const slug = newMetadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
  const newFilename = `${slug}-${eventId}.md`;
  const newFilePath = join(eventsDir, newFilename);

  const serialized = serializeMarkdownFile(newMetadata, args.notes ?? parentRecord.notes ?? "");
  fs.writeFileSync(newFilePath, serialized, "utf8");

  // 6. Sync both parent and detached files back to PB cache
  await syncFolioFileToDb(parentPath, pb, folioRootPath);
  await syncFolioFileToDb(newFilePath, pb, folioRootPath);

  // 7. Schedule reminder if needed
  if (!newMetadata.cancelled && newMetadata.reminderOffset !== null && newMetadata.reminderOffset >= 0) {
    const triggerAt = Math.max(Date.now(), finalStartTime - newMetadata.reminderOffset * 60 * 1000);
    try {
      await pb.collection("scheduled_notifications").create({
        user: ctx.user.id,
        kind: "event_remind",
        targetId: eventId,
        triggerAt,
        delivered: false,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error("[updateEventOccurrence Action] Failed to schedule reminder:", err);
    }
  }

  return { detachedEventId: eventId };
};
