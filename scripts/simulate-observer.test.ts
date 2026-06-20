// scripts/simulate-observer.test.ts
//
// Integration simulation of the Background Observer Agent.
// This script simulates a complete conversation session end, triggering the
// Observer Agent to:
//   1. Run Daily Log generation (compiling messages, tasks, events, and habits).
//   2. Run Memory Extraction (parsing transcript to extract user preferences & facts).
//
// Usage:
//   npx vitest run scripts/simulate-observer.test.ts
//

process.env.NODE_ENV = "development";

import { describe, it, expect, vi } from "vitest";
import { join } from "path";
import { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { runObserver } from "../src/lib/jobs/observer";
import { getLocalDateString } from "../src/lib/jobs/dateUtils";

// Pre-define mock LLM responses
const MOCK_SUMMARY = "Discussed compiling Rust parser/typechecker in neovim; user needs to buy coffee.";
const MOCK_FACTS = JSON.stringify([
  "User is writing a compiler in Rust.",
  "User prefers using neovim for development.",
  "User needs to buy coffee."
]);

// Mock AI providers so the script runs instantly without requiring an API key
vi.mock("../src/lib/ai-providers", () => ({
  getTaskProviderAndModel: () => ({ provider: "mock", modelId: "mock-model" }),
  runSimpleTask: async (options: any) => {
    if (options.prompt.includes("discussed, accomplished, or decided in this thread") || options.prompt.includes("daily chat reflections")) {
      return MOCK_SUMMARY;
    }
    return MOCK_FACTS;
  }
}));

// Mock embeddings to return a dummy array
vi.mock("../src/lib/graph/embedding", () => ({
  getLocalEmbedding: async () => new Array(384).fill(0.1)
}));

// =============================================================================
// 1. Mock Data Setup (PocketBase Simulation)
// =============================================================================

const mockWorkspaces = [
  { id: "ws-coding-1", name: "Rust Compiler" }
];

const mockSessions = [
  { id: "sess-compiler-2", workspace: "ws-coding-1", title: "Rust compiler hacking", lastActivity: Date.now() }
];

const mockMessages = [
  { id: "m1", session: "sess-compiler-2", author: "user", text: "I am writing a compiler in Rust today. I prefer using neovim because it's fast.", timestamp: Date.now() - 3000 },
  { id: "m2", session: "sess-compiler-2", author: "companion", text: "Neovim and Rust are a great combination! Let me know if you run into any typecheck errors.", timestamp: Date.now() - 2000 },
  { id: "m3", session: "sess-compiler-2", author: "user", text: "The parser is done, now I'm working on typechecking. I also need to buy coffee later.", timestamp: Date.now() - 1000 }
];

const mockTasks = [
  {
    id: "tsk-rust-99",
    user: "user-1",
    text: "Rust compiler parser",
    workspace: "ws-coding-1",
    completed: true,
    completedAt: Date.now() - 1000,
    notes: "General design notes for Rust compiler parser\nSuccessfully finished AST parser and tokenization.",
    history_logs: JSON.stringify([
      { date: getLocalDateString("Asia/Jakarta"), note: "Successfully finished AST parser and tokenization.\nAll AST unit tests passed." }
    ])
  }
];

const mockEvents = [
  {
    id: "evt-rust-88",
    user: "user-1",
    title: "Neovim config tuning",
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    workspace: "ws-coding-1",
    cancelled: false,
    notes: "Notes on Neovim configurations",
    history_logs: JSON.stringify([
      { date: getLocalDateString("Asia/Jakarta"), note: "Configured telescope plugin and shortcuts for compiler search." }
    ])
  }
];

const mockHabits = [
  { id: "hab-water-77", user: "user-1", name: "Drink 2L Water", frequency: "daily", archived: false }
];

const mockHabitLogs = [
  { id: "log-1", user: "user-1", habit: "hab-water-77", status: "completed", dateString: getLocalDateString("Asia/Jakarta") }
];

const mockSessionSummaries: any[] = [];
const mockMemories: any[] = [];

// Lightweight PocketBase Mock Adapter
const pbMock: any = {
  authStore: {
    record: { id: "user-1", collectionName: "users" }
  },
  collection: (name: string) => {
    return {
      getOne: async (id: string) => {
        if (name === "chat_sessions") return mockSessions.find(s => s.id === id);
        if (name === "workspaces") return mockWorkspaces.find(w => w.id === id);
        if (name === "tasks") return mockTasks.find(t => t.id === id);
        if (name === "events") return mockEvents.find(e => e.id === id);
        throw { status: 404, message: `Record ${id} not found in ${name}` };
      },
      getFirstListItem: async (filter: string) => {
        if (name === "user_profile") return { id: "prof-1", user: "user-1", preferences: {} };
        throw { status: 404 };
      },
      getFullList: async (options: any = {}) => {
        if (name === "messages") return mockMessages;
        if (name === "chat_sessions") return mockSessions;
        if (name === "tasks") return mockTasks;
        if (name === "events") return mockEvents;
        if (name === "habits") return mockHabits;
        if (name === "habit_logs") return mockHabitLogs;
        if (name === "memories") return mockMemories;
        if (name === "workspaces") return mockWorkspaces;
        return [];
      },
      getList: async (page: number, size: number, options: any = {}) => {
        if (name === "memories" && options.filter?.includes("hash")) {
          const hashMatch = options.filter.match(/hash = "([^"]+)"/);
          if (hashMatch) {
            const found = mockMemories.filter(m => m.hash === hashMatch[1]);
            return { items: found, totalItems: found.length };
          }
        }
        return { items: [], totalItems: 0 };
      },
      create: async (record: any) => {
        const item = { id: `mock-id-${Math.random().toString(36).slice(2, 7)}`, ...record };
        if (name === "session_summaries") mockSessionSummaries.push(item);
        if (name === "memories") mockMemories.push(item);
        return item;
      },
       update: async (id: string, record: any) => {
        if (name === "session_summaries") {
          const found = mockSessionSummaries.find(s => s.id === id);
          if (found) Object.assign(found, record);
        }
        return { id, ...record };
      },
      delete: async (id: string) => {
        if (name === "memories") {
          const idx = mockMemories.findIndex(m => m.id === id);
          if (idx !== -1) mockMemories.splice(idx, 1);
        }
        return true;
      }
    };
  }
};

describe("Observer Agent Simulation", () => {
  it("should run the real-time simulation and output readable results", async () => {
    // =============================================================================
    // 2. Setup Temporary Folio Directory
    // =============================================================================
    const tempFolioDir = join(process.cwd(), "dialogue-folio-test");
    process.env.DEV_LOCAL_PATH = tempFolioDir; // Force observer.ts to use this directory

    // Clean up any previous runs
    if (existsSync(tempFolioDir)) {
      rmSync(tempFolioDir, { recursive: true });
    }

    // Create directories and mock workspace structure
    mkdirSync(join(tempFolioDir, "workspaces", "rust-compiler-ws-coding-1"), { recursive: true });
    mkdirSync(join(tempFolioDir, "system"), { recursive: true });

    // Pre-populate default files
    writeFileSync(
      join(tempFolioDir, "workspaces", "rust-compiler-ws-coding-1", ".workspace.yaml"),
      `id: ws-coding-1\nname: Rust Compiler\nicon: Briefcase\ncolor: "#d4a373"\n`
    );
    writeFileSync(
      join(tempFolioDir, "workspaces", "rust-compiler-ws-coding-1", "CONTEXT.md"),
      `# Rust Compiler\n\n## Purpose\nDeveloping a compiled systems programming language in Rust.\n`
    );
    writeFileSync(
      join(tempFolioDir, "workspaces", "rust-compiler-ws-coding-1", "MEMORIES.md"),
      `# Rust Compiler Memories\n\n`
    );
    writeFileSync(
      join(tempFolioDir, "system", "MEMORIES.md"),
      `# Global Memories\n\n`
    );
    writeFileSync(
      join(tempFolioDir, "system", "USER.md"),
      `# User Profile\n\n- Name: User\n- Bio/Facts:\n`
    );

    // =============================================================================
    // 3. Run Simulation & Output Results
    // =============================================================================
    console.log("\n=================================================================");
    console.log("🚀 SIMULATING DIALOGUE OBSERVER AGENT BACKGROUND RUN");
    console.log("=================================================================");

    console.log("\n📋 [MOCK INPUT DATA]");
    console.log("-----------------------------------------------------------------");
    console.log("💬 Conversation Session (Rust compiler hacking):");
    mockMessages.forEach(m => {
      console.log(`  ${m.author === "user" ? "User" : "Companion"}: ${m.text}`);
    });
    console.log("\n✅ Completed Tasks Today:");
    mockTasks.forEach(t => console.log(`  - ${t.text} (Completed) #tsk-rust-99`));
    console.log("\n📅 Today's Events:");
    mockEvents.forEach(e => console.log(`  - ${e.title} #evt-rust-88`));
    console.log("\n🥤 Habits Logged Today:");
    mockHabitLogs.forEach(h => console.log(`  - Drink 2L Water (Completed) #hab-water-77`));

    console.log("\n-----------------------------------------------------------------");
    console.log("⚙️  Running Observer stages...");
    console.log("-----------------------------------------------------------------");

    const result = await runObserver(pbMock, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
      sessionId: "sess-compiler-2"
    });

    console.log("\n🎉 [OBSERVER COMPLETED SUCCESSFULLY]");
    console.log("-----------------------------------------------------------------");
    console.log(`Stage 1: Daily Log status: ${result.dailySummaryStatus}`);
    console.log(`Stage 2: Memories extracted: ${result.memoriesExtracted}`);

    // Assertions to verify correct execution
    expect(result.dailySummaryStatus).toBe("created");
    expect(result.memoriesExtracted).toBe(3);

    // Print generated daily log
    const dateStr = getLocalDateString("Asia/Jakarta");
    const dailyLogPath = join(tempFolioDir, "daily-logs", `${dateStr}.md`);
    expect(existsSync(dailyLogPath)).toBe(true);
    
    const dailyLogContent = readFileSync(dailyLogPath, "utf8");
    console.log(`\n📂 Generated file: daily-logs/${dateStr}.md`);
    console.log("```markdown");
    console.log(dailyLogContent.trim());
    console.log("```");

    expect(dailyLogContent).toContain("## Tasks");
    expect(dailyLogContent).toContain("Rust compiler parser");
    expect(dailyLogContent).toContain("#tsk-tsk-rust-99 @rust-compiler");

    expect(dailyLogContent).toContain("## Events");
    expect(dailyLogContent).toContain("Neovim config tuning");
    expect(dailyLogContent).toContain("#evt-evt-rust-88 @rust-compiler");

    expect(dailyLogContent).toContain("## Journal & Raw Notes");
    expect(dailyLogContent).toContain("- **Rust compiler hacking** @rust-compiler: Discussed compiling Rust parser/typechecker in neovim; user needs to buy coffee.");

    // Print generated workspace activity (should NOT exist)
    const wsActivityPath = join(tempFolioDir, "workspaces", "rust-compiler-ws-coding-1", "activity", `${dateStr}.md`);
    expect(existsSync(wsActivityPath)).toBe(false);

    // Print updated workspace Memories
    const wsMemPath = join(tempFolioDir, "workspaces", "rust-compiler-ws-coding-1", "MEMORIES.md");
    if (existsSync(wsMemPath)) {
      console.log(`\n📂 Updated file: workspaces/rust-compiler-ws-coding-1/MEMORIES.md`);
      console.log("```markdown");
      console.log(readFileSync(wsMemPath, "utf8").trim());
      console.log("```");
    }

    console.log("\n🧠 Saved to database memories collection:");
    console.log(mockMemories);

    console.log("\n🗑️  Cleaning up temporary test folio...");
    rmSync(tempFolioDir, { recursive: true });
    console.log("✨ Done!");
    console.log("=================================================================\n");
  });
});
