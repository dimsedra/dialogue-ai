import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import { createEvent } from "./createEvent";
import { updateEvent } from "./updateEvent";
import { deleteEvent } from "./deleteEvent";
import { updateEventOccurrence } from "./updateEventOccurrence";
import { cancelEventOccurrence } from "./cancelEventOccurrence";

// Mock embedding
vi.mock("../graph/embedding", () => ({
  getLocalEmbedding: vi.fn().mockResolvedValue(Array(384).fill(0)),
}));
vi.mock("../../lib/graph/embedding", () => ({
  getLocalEmbedding: vi.fn().mockResolvedValue(Array(384).fill(0)),
}));

// Mock PocketBase
let mockItems: any[] = [];
let mockReminders: any[] = [];

function matchSimpleCondition(item: any, cond: string): boolean {
  const match = cond.match(/^([\w_]+)\s*=\s*(.+)$/);
  if (!match) return false;
  const key = match[1];
  let val = match[2].trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.substring(1, val.length - 1);
  }
  const itemVal = item[key];
  return String(itemVal) === String(val);
}

function matchFilter(item: any, filter: string): boolean {
  const parts = filter.split("&&").map(p => p.trim());
  for (const part of parts) {
    if (part.includes("||")) {
      const groupStr = part.replace(/[()]/g, "");
      const subParts = groupStr.split("||").map(sp => sp.trim());
      let anyMatch = false;
      for (const subPart of subParts) {
        if (matchSimpleCondition(item, subPart)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) return false;
    } else {
      if (!matchSimpleCondition(item, part)) return false;
    }
  }
  return true;
}

const mockPbInstance = {
  authStore: {
    save: vi.fn(),
    record: { id: "test-user-id", collectionName: "users" },
    token: "mock-token",
  },
  collection: vi.fn().mockImplementation((colName) => {
    return {
      getOne: vi.fn().mockImplementation(async (id) => {
        const item = mockItems.find((i) => i.id === id);
        if (!item) throw { status: 404, message: "Not Found" };
        return item;
      }),
      getList: vi.fn().mockImplementation(async (page, limit, options) => {
        let filtered = colName === "scheduled_notifications" ? [...mockReminders] : [...mockItems];
        if (options?.filter) {
          filtered = filtered.filter(item => matchFilter(item, options.filter));
        }
        return {
          items: filtered.slice((page - 1) * limit, page * limit),
          totalItems: filtered.length,
        };
      }),
      getFullList: vi.fn().mockImplementation(async (options) => {
        let filtered = colName === "scheduled_notifications" ? [...mockReminders] : [...mockItems];
        if (options?.filter) {
          filtered = filtered.filter(item => matchFilter(item, options.filter));
        }
        return filtered;
      }),
      create: vi.fn().mockImplementation(async (data) => {
        const item = { id: data.id || `evt-${Math.random().toString(36).substr(2, 9)}`, ...data };
        if (colName === "scheduled_notifications") {
          mockReminders.push(item);
        } else {
          mockItems.push(item);
        }
        return item;
      }),
      update: vi.fn().mockImplementation(async (id, data) => {
        const item = mockItems.find((i) => i.id === id);
        if (item) Object.assign(item, data);
        return item;
      }),
      delete: vi.fn().mockImplementation(async (id) => {
        if (colName === "scheduled_notifications") {
          const idx = mockReminders.findIndex((i) => i.id === id);
          if (idx !== -1) mockReminders.splice(idx, 1);
        } else {
          const idx = mockItems.findIndex((i) => i.id === id);
          if (idx !== -1) mockItems.splice(idx, 1);
        }
        return true;
      }),
    };
  }),
};

vi.mock("pocketbase", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockPbInstance;
    }),
  };
});

describe("PocketBase Actions: Events & JIT Detachment", () => {
  const ctx = {
    token: "mock-token",
    user: { id: "test-user-id", email: "test@example.com" },
  };
  let folioRootPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    mockItems = [];
    mockReminders = [];
    originalEnv = process.env.DEV_LOCAL_PATH;
    process.env.DEV_LOCAL_PATH = join(process.cwd(), "test-folio-events");
    folioRootPath = process.env.DEV_LOCAL_PATH;

    if (fs.existsSync(folioRootPath)) {
      fs.rmSync(folioRootPath, { recursive: true, force: true });
    }
    fs.mkdirSync(join(folioRootPath, "events"), { recursive: true });
  });

  afterEach(() => {
    process.env.DEV_LOCAL_PATH = originalEnv;
    if (fs.existsSync(folioRootPath)) {
      fs.rmSync(folioRootPath, { recursive: true, force: true });
    }
  });

  test("createEvent creates slugged markdown file and syncs to DB", async () => {
    const res = await createEvent(
      {
        title: "Team Meeting",
        description: "Weekly sync",
        startTime: new Date("2026-06-20T10:00:00Z").getTime(),
        eventType: "point",
        reminderOffset: 15,
        notes: "Remember agenda",
      },
      ctx
    );

    expect(res.id).toBeDefined();

    // Check file on disk
    const eventsDir = join(folioRootPath, "events");
    const files = fs.readdirSync(eventsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(`team-meeting-${res.id}.md`);

    // Verify DB cache record
    const record = mockItems.find((i) => i.id === res.id);
    expect(record).toBeDefined();
    expect(record.title).toBe("Team Meeting");
    expect(record.notes).toBe("Remember agenda");

    // Verify scheduled reminder
    expect(mockReminders).toHaveLength(1);
    expect(mockReminders[0].targetId).toBe(res.id);
  });

  test("updateEvent updates title, renames file, and prunes old cache", async () => {
    const res = await createEvent(
      {
        title: "Old Title",
        startTime: new Date("2026-06-20T10:00:00Z").getTime(),
        eventType: "point",
      },
      ctx
    );

    const oldFilename = `old-title-${res.id}.md`;
    expect(fs.existsSync(join(folioRootPath, "events", oldFilename))).toBe(true);

    // Perform title update
    await updateEvent(
      {
        eventId: res.id,
        title: "New Title",
      },
      ctx
    );

    const newFilename = `new-title-${res.id}.md`;
    expect(fs.existsSync(join(folioRootPath, "events", newFilename))).toBe(true);
    expect(fs.existsSync(join(folioRootPath, "events", oldFilename))).toBe(false);

    // Verify DB cache updated
    const record = mockItems.find((i) => i.id === res.id);
    expect(record).toBeDefined();
    expect(record.title).toBe("New Title");
  });

  test("deleteEvent deletes markdown file and prunes DB cache & reminders", async () => {
    const res = await createEvent(
      {
        title: "To Be Deleted",
        startTime: new Date("2026-06-20T10:00:00Z").getTime(),
        eventType: "point",
        reminderOffset: 10,
      },
      ctx
    );

    expect(mockItems).toHaveLength(1);
    expect(mockReminders).toHaveLength(1);

    // Delete
    await deleteEvent({ eventId: res.id }, ctx);

    // Verify file deleted
    const files = fs.readdirSync(join(folioRootPath, "events"));
    expect(files).toHaveLength(0);

    // Verify DB pruned
    const record = mockItems.find((i) => i.id === res.id);
    expect(record).toBeUndefined();
    expect(mockReminders).toHaveLength(0);
  });

  test("updateEventOccurrence performs JIT detachment on recurring series", async () => {
    // 1. Setup parent series event
    const parentRes = await createEvent(
      {
        title: "Weekly Workout",
        startTime: new Date("2026-06-15T08:00:00Z").getTime(),
        eventType: "point",
        recurrence: {
          frequency: "weekly",
          interval: 1,
        },
      },
      ctx
    );

    const parentId = parentRes.id;
    const originalTime = new Date("2026-06-22T08:00:00Z").getTime();

    // 2. Perform JIT update on one occurrence
    const detachRes = await updateEventOccurrence(
      {
        seriesId: parentId,
        originalStartTime: originalTime,
        title: "Special Gym Day",
        startTime: new Date("2026-06-22T10:00:00Z").getTime(),
        eventType: "point",
      },
      ctx
    );

    const detachedId = detachRes.detachedEventId;
    expect(detachedId).toBeDefined();
    expect(detachedId).not.toBe(parentId);

    // Verify parent file has exceptions added
    const parentFileContent = fs.readFileSync(join(folioRootPath, "events", `weekly-workout-${parentId}.md`), "utf8");
    expect(parentFileContent).toContain("exceptions");
    expect(parentFileContent).toContain(String(originalTime));

    // Verify detached occurrence file created with series link
    const detachedFileContent = fs.readFileSync(join(folioRootPath, "events", `special-gym-day-${detachedId}.md`), "utf8");
    expect(detachedFileContent).toContain(`series: ${parentId}`);

    // Verify DB cache has both events
    const parentRecord = mockItems.find((i) => i.id === parentId);
    expect(parentRecord).toBeDefined();
    expect(parentRecord.recurrence.exceptions).toContain(originalTime);

    const detachedRecord = mockItems.find((i) => i.id === detachedId);
    expect(detachedRecord).toBeDefined();
    expect(detachedRecord.title).toBe("Special Gym Day");
    expect(detachedRecord.series).toBe(parentId);
  });

  test("cancelEventOccurrence cancels a specific occurrence in recurring series", async () => {
    // 1. Setup parent series event
    const parentRes = await createEvent(
      {
        title: "Weekly Class",
        startTime: new Date("2026-06-15T09:00:00Z").getTime(),
        eventType: "point",
        recurrence: {
          frequency: "weekly",
          interval: 1,
        },
      },
      ctx
    );

    const parentId = parentRes.id;
    const originalTime = new Date("2026-06-22T09:00:00Z").getTime();

    // 2. Cancel occurrence
    await cancelEventOccurrence(
      {
        seriesId: parentId,
        originalStartTime: originalTime,
      },
      ctx
    );

    // Verify parent file has exception added
    const parentFileContent = fs.readFileSync(join(folioRootPath, "events", `weekly-class-${parentId}.md`), "utf8");
    expect(parentFileContent).toContain(String(originalTime));

    // Verify no new files created (only parent remains)
    const files = fs.readdirSync(join(folioRootPath, "events"));
    expect(files).toHaveLength(1);

    // Verify DB updated
    const parentRecord = mockItems.find((i) => i.id === parentId);
    expect(parentRecord).toBeDefined();
    expect(parentRecord.recurrence.exceptions).toContain(originalTime);
  });
});
