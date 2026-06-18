import fs from "node:fs";
import { join, dirname } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb } from "../folio/sync";
import { serializeMarkdownFile } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface CreateEventArgs {
  title: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime?: number;
  eventType: "interval" | "point";
  recurrence?: any;
  reminderOffset?: number;
  notes?: string;
  outcome?: string;
  statusHook?: string;
  workspaceId?: string;
}

export const createEvent: PbActionHandler<CreateEventArgs, { id: string }> = async (
  args,
  ctx
) => {
  if (!args.title || !args.title.trim()) {
    throw new Error("Event title cannot be empty");
  }

  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);
  const activeWorkspace = args.workspaceId || "";

  // 1. Resolve workspace basePath
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
  fs.mkdirSync(eventsDir, { recursive: true });

  // 2. Generate stable 15-char alphanumeric ID
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const eventId = Array.from({ length: 15 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  // 3. Serialize metadata
  const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
  const filename = `${slug}-${eventId}.md`;
  const filePath = join(eventsDir, filename);

  const metadata = {
    id: eventId,
    title: args.title,
    description: args.description || "",
    startTime: new Date(args.startTime).toISOString(),
    endTime: args.endTime ? new Date(args.endTime).toISOString() : null,
    eventType: args.eventType,
    location: args.location || "",
    statusHook: args.statusHook || "",
    outcome: args.outcome || "",
    cancelled: false,
    recurrence: args.recurrence || null,
    reminderOffset: args.reminderOffset !== undefined ? args.reminderOffset : null,
    createdAt: new Date().toISOString(),
  };

  const serialized = serializeMarkdownFile(metadata, args.notes || "");
  fs.writeFileSync(filePath, serialized, "utf8");

  // 4. Sync to PB cache database
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  await syncFolioFileToDb(filePath, pb, folioRootPath);

  // 5. Schedule notification if needed
  if (!metadata.cancelled && args.startTime && args.reminderOffset !== undefined && args.reminderOffset >= 0) {
    const triggerAt = Math.max(Date.now(), args.startTime - args.reminderOffset * 60 * 1000);
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
      console.error("[createEvent Action] Failed to schedule notification:", err);
    }
  }

  return { id: eventId };
};
