import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import { updateWorkspace } from "./updateWorkspace";
import { reconcileFolio } from "../folio/sync";

// Mock embedding
vi.mock("../graph/embedding", () => ({
  getLocalEmbedding: vi.fn().mockResolvedValue(Array(384).fill(0)),
}));
vi.mock("../../lib/graph/embedding", () => ({
  getLocalEmbedding: vi.fn().mockResolvedValue(Array(384).fill(0)),
}));

// Mock PocketBase
let mockCollections: Record<string, any[]> = {};

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
    if (!mockCollections[colName]) {
      mockCollections[colName] = [];
    }
    return {
      getOne: vi.fn().mockImplementation(async (id) => {
        const item = mockCollections[colName].find((i) => i.id === id);
        if (!item) throw { status: 404, message: "Not Found" };
        return item;
      }),
      getList: vi.fn().mockImplementation(async (page, limit, options) => {
        let filtered = [...mockCollections[colName]];
        if (options?.filter) {
          filtered = filtered.filter(item => matchFilter(item, options.filter));
        }
        return {
          items: filtered.slice((page - 1) * limit, page * limit),
          totalItems: filtered.length,
        };
      }),
      getFullList: vi.fn().mockImplementation(async (options) => {
        let filtered = [...mockCollections[colName]];
        if (options?.filter) {
          filtered = filtered.filter(item => matchFilter(item, options.filter));
        }
        return filtered;
      }),
      create: vi.fn().mockImplementation(async (data) => {
        const item = { id: data.id || `id-${Math.random().toString(36).substr(2, 9)}`, ...data };
        mockCollections[colName].push(item);
        return item;
      }),
      update: vi.fn().mockImplementation(async (id, data) => {
        const item = mockCollections[colName].find((i) => i.id === id);
        if (item) Object.assign(item, data);
        return item;
      }),
      delete: vi.fn().mockImplementation(async (id) => {
        const idx = mockCollections[colName].findIndex((i) => i.id === id);
        if (idx !== -1) mockCollections[colName].splice(idx, 1);
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

vi.mock("../pb-server-admin", () => ({
  getPbAdmin: vi.fn().mockResolvedValue(mockPbInstance),
}));

describe("PocketBase Actions: Workspaces & Configuration", () => {
  const ctx = {
    token: "mock-token",
    user: { id: "test-user-id", email: "test@example.com" },
  };
  let folioRootPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    mockCollections = {
      users: [{ id: "test-user-id" }],
      workspaces: [],
      tasks: [],
      events: [],
      chat_sessions: [],
      habits: [],
      reflections: [],
      memories: [],
    };
    originalEnv = process.env.DEV_LOCAL_PATH;
    process.env.DEV_LOCAL_PATH = join(process.cwd(), "test-folio-workspaces");
    folioRootPath = process.env.DEV_LOCAL_PATH;

    if (fs.existsSync(folioRootPath)) {
      fs.rmSync(folioRootPath, { recursive: true, force: true });
    }
    fs.mkdirSync(join(folioRootPath, "workspaces"), { recursive: true });
  });

  afterEach(() => {
    process.env.DEV_LOCAL_PATH = originalEnv;
    if (fs.existsSync(folioRootPath)) {
      fs.rmSync(folioRootPath, { recursive: true, force: true });
    }
  });

  test("updateWorkspace renames directory and updates .workspace.yaml + DB", async () => {
    const wsId = "ws123";
    const oldDir = join(folioRootPath, "workspaces", `my-workspace-${wsId}`);
    fs.mkdirSync(oldDir, { recursive: true });
    
    // Write initial config
    const initialConfig = `id: ws123\nname: My Workspace\nicon: Briefcase\ncolor: '#d4a373'\ncreatedAt: 123456789\n`;
    fs.writeFileSync(join(oldDir, ".workspace.yaml"), initialConfig, "utf8");

    // Add to mock DB
    mockCollections.workspaces.push({
      id: wsId,
      name: "My Workspace",
      icon: "Briefcase",
      color: "#d4a373",
      createdAt: 123456789,
      archived: false,
    });

    // Run action
    const result = await updateWorkspace({
      id: wsId,
      name: "Renamed Workspace",
      color: "#ffffff",
      activeBranchLimit: 4,
    }, ctx);

    expect(result.success).toBe(true);

    // Verify folder rename
    const newDir = join(folioRootPath, "workspaces", `renamed-workspace-${wsId}`);
    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.existsSync(newDir)).toBe(true);

    // Verify .workspace.yaml file contents
    const yamlContent = fs.readFileSync(join(newDir, ".workspace.yaml"), "utf8");
    expect(yamlContent).toContain("name: Renamed Workspace");
    expect(yamlContent).toContain("color: \"#ffffff\"");
    expect(yamlContent).toContain("id: ws123");
    expect(yamlContent).toContain("activeBranchLimit: 4");

    // Verify DB update
    const dbWs = mockCollections.workspaces.find(w => w.id === wsId);
    expect(dbWs.name).toBe("Renamed Workspace");
    expect(dbWs.color).toBe("#ffffff");
    expect(dbWs.activeBranchLimit).toBe(4);
  });

  test("reconcileFolio auto-creates missing .workspace.yaml file from DB cache", async () => {
    const wsId = "ws456";
    const dir = join(folioRootPath, "workspaces", `my-project-${wsId}`);
    fs.mkdirSync(dir, { recursive: true });

    // DB record exists but .workspace.yaml is missing
    mockCollections.workspaces.push({
      id: wsId,
      name: "My Project",
      icon: "Folder",
      color: "#000000",
      createdAt: 987654321,
      archived: false,
    });

    await reconcileFolio(folioRootPath, mockPbInstance as any);

    // Verify .workspace.yaml was generated
    const yamlPath = join(dir, ".workspace.yaml");
    expect(fs.existsSync(yamlPath)).toBe(true);
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    expect(yamlContent).toContain("id: ws456");
    expect(yamlContent).toContain("name: My Project");
    expect(yamlContent).toContain("color: \"#000000\"");
  });

  test("reconcileFolio prunes deleted workspaces and cascades deletes to tasks/events/sessions", async () => {
    const wsId = "ws789";

    // DB has a workspace and associated items
    mockCollections.workspaces.push({
      id: wsId,
      name: "To Be Deleted",
      icon: "Trash",
      color: "#ff0000",
      createdAt: 111111111,
      archived: false,
    });

    mockCollections.tasks.push({
      id: "task1",
      text: "Workspace task",
      workspace: wsId,
      user: "test-user-id",
    });

    mockCollections.events.push({
      id: "event1",
      title: "Workspace event",
      workspace: wsId,
      user: "test-user-id",
    });

    mockCollections.chat_sessions.push({
      id: "session1",
      title: "Workspace session",
      workspace: wsId,
      user: "test-user-id",
    });

    // Run reconciliation on an empty folio (meaning workspace folder doesn't exist)
    await reconcileFolio(folioRootPath, mockPbInstance as any);

    // Verify workspace and all cascades are pruned from DB
    expect(mockCollections.workspaces.find(w => w.id === wsId)).toBeUndefined();
    expect(mockCollections.tasks.find(t => t.workspace === wsId)).toBeUndefined();
    expect(mockCollections.events.find(e => e.workspace === wsId)).toBeUndefined();
    expect(mockCollections.chat_sessions.find(s => s.workspace === wsId)).toBeUndefined();
  });
});
