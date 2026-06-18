import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const addEventTool = createTool({
  id: 'addEvent',
  description: 'Creates a calendar event. Extract as many fields as possible from the user\'s natural language (title, start/end times, location, recurrence, notes). IMPORTANT: endTime is REQUIRED when eventType is \'interval\'. Only ask the user if information is missing or ambiguous.',
  inputSchema: z.object({
    title: z.string().describe("Event title"),
    description: z.string().optional().describe("Optional description"),
    startTime: z.string().describe("ISO-8601 start time (24-hour format, e.g. '2026-05-15T14:00:00')"),
    endTime: z.string().optional().describe("Required when eventType is 'interval'. ISO-8601 end time (24-hour format)."),
    timezone: z.string().describe("The user\'s IANA timezone ID (e.g. 'Asia/Jakarta', 'UTC') from ## Temporal Context to parse timestamps properly."),
    reminderOffset: z.number().optional().describe("Minutes before startTime to remind the user (e.g. 15)."),
    eventType: z.enum(["interval", "point"]).describe("'interval' for duration events or 'point' for momentary events"),
    location: z.string().optional().describe("Optional location"),
    notes: z.string().optional().describe("Optional notes"),
    outcome: z.string().optional().describe("Post-event summary or outcome"),
    statusHook: z.string().optional().describe("A single punchy sentence summarizing current state"),
    workspaceId: z.string().optional().describe("Optional workspace ID to file under"),
    recurrence: z.object({
      frequency: z.string().describe("'daily' or 'weekly'"),
      interval: z.number().describe("Interval count"),
      daysOfWeek: z.array(z.number()).optional().describe("For weekly recurrence: array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)"),
      until: z.string().optional().describe("Optional ISO-8601 end date for the recurrence series")
    }).optional().describe("Optional recurrence rule if the event repeats")
  }).superRefine((data, ctx) => {
    if (data.eventType === "interval" && !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime is required when eventType is 'interval'",
      });
    }
  }),
  outputSchema: z.object({ eventId: z.string(), title: z.string() }),
  execute: async (input) => {
    const { parseDateTime } = await import('../../lib/jobs/dateUtils');
    const { getPbClient } = await import('../../lib/pb-server');
    const { getFolioContext, syncFolioFileToDb } = await import('../../lib/folio/sync');
    const { serializeMarkdownFile } = await import('../../lib/folio/parser');
    const { existsSync, mkdirSync, statSync, writeFileSync } = await import('fs');
    const { join } = await import('path');

    const startMs = parseDateTime(input.startTime, input.timezone).getTime();
    const endMs = input.endTime ? parseDateTime(input.endTime, input.timezone).getTime() : undefined;
    const recurrence = input.recurrence ? {
      frequency: input.recurrence.frequency as "daily" | "weekly",
      interval: input.recurrence.interval,
      daysOfWeek: input.recurrence.daysOfWeek,
      until: input.recurrence.until ? new Date(input.recurrence.until).getTime() : undefined,
    } : undefined;

    const pb = getPbClient();
    const user = pb.authStore.record?.id;
    if (!user) throw new Error("Unauthorized");

    const { folioRootPath, basePath: contextBasePath } = getFolioContext();

    // 1. Resolve workspace basePath
    const activeWorkspace = input.workspaceId || "";
    let basePath = contextBasePath;
    if (activeWorkspace) {
      const legacyPath = join(folioRootPath, activeWorkspace);
      if (existsSync(legacyPath) && statSync(legacyPath).isDirectory()) {
        basePath = legacyPath;
      } else {
        const workspacesParent = join(folioRootPath, "workspaces");
        let matchedFolder: string | null = null;
        if (existsSync(workspacesParent)) {
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
    if (!existsSync(eventsDir)) {
      mkdirSync(eventsDir, { recursive: true });
    }

    // 2. Generate stable 15-char ID
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    const eventId = Array.from({ length: 15 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

    // 3. Serialize metadata
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
    const filename = `${slug}-${eventId}.md`;
    const filePath = join(eventsDir, filename);

    const metadata = {
      id: eventId,
      title: input.title,
      description: input.description || "",
      startTime: new Date(startMs).toISOString(),
      endTime: endMs ? new Date(endMs).toISOString() : null,
      eventType: input.eventType,
      location: input.location || "",
      statusHook: input.statusHook || "",
      outcome: input.outcome || "",
      cancelled: false,
      recurrence: recurrence || null,
      reminderOffset: input.reminderOffset !== undefined ? input.reminderOffset : null,
      createdAt: new Date().toISOString(),
    };

    const serialized = serializeMarkdownFile(metadata, input.notes || "");
    writeFileSync(filePath, serialized, "utf8");

    // 4. Sync to PB cache database
    await syncFolioFileToDb(filePath, pb, folioRootPath);

    // 5. Schedule reminder
    if (input.reminderOffset !== undefined && input.reminderOffset >= 0) {
      const triggerAt = Math.max(Date.now(), startMs - input.reminderOffset * 60 * 1000);
      try {
        await pb.collection("scheduled_notifications").create({
          user,
          kind: "event_remind",
          targetId: eventId,
          triggerAt,
          delivered: false,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.error("[addEvent Tool] Failed to schedule reminder:", err);
      }
    }

    return { eventId, title: input.title };
  }
});
