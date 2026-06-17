import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import { createMemory } from "./createMemory";
import { updateMemory } from "./updateMemory";
import { deleteMemory } from "./deleteMemory";

// Mock the pocketbase package constructor and instance
let mockItems: any[] = [];

const mockPbInstance = {
  authStore: {
    save: vi.fn(),
    record: { id: "test-user-id" },
  },
  collection: vi.fn().mockImplementation((colName) => {
    return {
      getOne: vi.fn().mockImplementation(async (id) => {
        const item = mockItems.find((i) => i.id === id);
        if (!item) throw { status: 404, message: "Not Found" };
        return item;
      }),
      getList: vi.fn().mockImplementation(async (page, limit, options) => {
        let filtered = [...mockItems];
        if (options?.filter) {
          if (options.filter.includes("hash")) {
            const match = options.filter.match(/hash = "([^"]+)"/);
            if (match) {
              filtered = filtered.filter((i) => i.hash === match[1]);
            }
          }
        }
        return { items: filtered };
      }),
      create: vi.fn().mockImplementation(async (data) => {
        const item = { id: data.id || `test-id-${Math.random().toString(36).substr(2, 9)}`, ...data };
        mockItems.push(item);
        return item;
      }),
      update: vi.fn().mockImplementation(async (id, data) => {
        const item = mockItems.find((i) => i.id === id);
        if (item) Object.assign(item, data);
        return item;
      }),
      delete: vi.fn().mockImplementation(async (id) => {
        const idx = mockItems.findIndex((i) => i.id === id);
        if (idx !== -1) mockItems.splice(idx, 1);
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

// Mock syncFolioFileToDb to update mockItems based on file contents
vi.mock("../folio/sync", () => ({
  syncFolioFileToDb: vi.fn().mockImplementation(async (filePath, pbClient, rootPath) => {
    const content = fs.readFileSync(filePath, "utf8");
    // Parse bullets
    const lines = content.split("\n");
    const bullets: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        bullets.push(trimmed.slice(2).trim());
      }
    }
    
    // Recalculate mockItems (prune and re-create file memories)
    const crypto = await import("crypto");
    
    // Prune deleted ones
    mockItems = mockItems.filter(item => {
      if (item.source_type === "File") {
        const isStillInFile = bullets.includes(item.text);
        return isStillInFile;
      }
      return true;
    });

    // Add new ones
    for (const bullet of bullets) {
      const hash = crypto.createHash("sha256").update(bullet).digest("hex");
      const existing = mockItems.find(i => i.text === bullet && i.source_type === "File");
      if (!existing) {
        mockItems.push({
          id: `mem-${Math.random().toString(36).substr(2, 9)}`,
          text: bullet,
          hash,
          source_type: "File",
          source_id: "system/memories.md",
          user: "test-user-id"
        });
      }
    }
  }),
}));

describe("PocketBase Custom Actions: Memories (Mocked)", () => {
  const ctx = {
    token: "mock-token",
    user: { id: "test-user-id", email: "test@example.com" }
  };
  let folioRootPath: string;
  let targetAbsPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    mockItems = [];
    // Set a test Folio directory
    originalEnv = process.env.DEV_LOCAL_PATH;
    process.env.DEV_LOCAL_PATH = join(process.cwd(), "test-folio-memories");
    folioRootPath = process.env.DEV_LOCAL_PATH;
    targetAbsPath = join(folioRootPath, "system", "memories.md");
    
    // Clean up test folder if it exists
    if (fs.existsSync(folioRootPath)) {
      fs.rmSync(folioRootPath, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    process.env.DEV_LOCAL_PATH = originalEnv;
    if (fs.existsSync(folioRootPath)) {
      fs.rmSync(folioRootPath, { recursive: true, force: true });
    }
  });

  test("createMemory appends to memories.md file and syncs to DB", async () => {
    const text = "Fact one: I prefer dark chocolate.";
    const res = await createMemory({ text }, ctx);
    
    expect(res.id).toBeDefined();
    expect(fs.existsSync(targetAbsPath)).toBe(true);
    
    const fileContent = fs.readFileSync(targetAbsPath, "utf8");
    expect(fileContent).toContain(`- ${text}`);
    
    // Verify it was synced to mockItems
    const synced = mockItems.find(i => i.text === text);
    expect(synced).toBeDefined();
    expect(synced.source_type).toBe("File");
  });

  test("updateMemory modifies matching bullet in file and updates DB", async () => {
    // 1. Create a memory first
    const text = "Fact two: I enjoy hiking.";
    const res = await createMemory({ text }, ctx);
    const dbRecord = mockItems.find(i => i.text === text);
    expect(dbRecord).toBeDefined();

    // 2. Update memory
    const updatedText = "Fact two: I love mountaineering.";
    await updateMemory({ id: dbRecord.id, text: updatedText }, ctx);

    // Verify file changes
    const fileContent = fs.readFileSync(targetAbsPath, "utf8");
    expect(fileContent).toContain(`- ${updatedText}`);
    expect(fileContent).not.toContain(`- ${text}`);

    // Verify DB synced (the old record text is modified, or new record exists)
    const synced = mockItems.find(i => i.text === updatedText);
    expect(synced).toBeDefined();
    expect(synced.source_type).toBe("File");
  });

  test("deleteMemory removes bullet from file and prunes from DB", async () => {
    // 1. Create a memory
    const text = "Fact three: I speak German.";
    const res = await createMemory({ text }, ctx);
    const dbRecord = mockItems.find(i => i.text === text);
    expect(dbRecord).toBeDefined();

    // 2. Delete memory
    await deleteMemory({ id: dbRecord.id }, ctx);

    // Verify file changes
    const fileContent = fs.readFileSync(targetAbsPath, "utf8");
    expect(fileContent).not.toContain(`- ${text}`);

    // Verify DB deleted
    const synced = mockItems.find(i => i.id === dbRecord.id);
    expect(synced).toBeUndefined();
  });
});
