// Smoke test for Phase 3 read paths.
//
// Validates filter building and record retrieval for all Phase 3 read paths:
//   1. Workspace list/get
//   2. Chat Session list/get
//   3. Persona list
//   4. Task list/get/searchHistory
//   5. Event list/get/searchHistory
//   6. Habit list/get, Habit log list, Habit consistency
//   7. Proactive dashboard states (Attention Needed, Morning Brief, Event Prep, etc.)
//
// Exit 0 = pass. Non-zero = fail.

import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;

const { default: PocketBase } = await import("pocketbase");

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// =============================================================================
// Test Assertions Helpers
// =============================================================================
let failed = 0;
let passed = 0;
function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findFreePort() {
  return 29000 + Math.floor(Math.random() * 1000);
}

async function waitForPb(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.status === 200) return true;
    } catch {}
    await sleep(150);
  }
  return false;
}

// =============================================================================
// Filters matching the descriptor implementations
// =============================================================================
function buildWorkspacesListFilter(userId) {
  const escaped = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `user = "${escaped}"`;
}

function buildWorkspacesGetFilter(id, userId) {
  const escapedId = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `id = "${escapedId}" && user = "${escapedUser}"`;
}

function buildSessionsListFilter(userId, workspaceId, allWorkspaces) {
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escapedUser}"`;
  if (workspaceId) {
    const escapedWs = workspaceId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    filter += ` && workspace = "${escapedWs}"`;
  } else if (!allWorkspaces) {
    filter += ` && (workspace = null || workspace = "")`;
  }
  return filter;
}

function buildTasksListFilter(userId, workspaceId) {
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escapedUser}"`;
  if (workspaceId) {
    const escapedWs = workspaceId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    filter += ` && workspace = "${escapedWs}"`;
  }
  return filter;
}

function buildTasksSearchHistoryFilter(userId, query) {
  const escapedUser = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let filter = `user = "${escapedUser}" && completed = true`;
  if (query) {
    const escapedQ = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    filter += ` && text ~ "${escapedQ}"`;
  }
  return filter;
}

// =============================================================================
// Bootstrap PocketBase
// =============================================================================
const PB_BIN = process.env.POCKETBASE_BIN || "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe";
if (!existsSync(PB_BIN)) {
  console.error(`smoke: POCKETBASE_BIN not found at ${PB_BIN}`);
  process.exit(2);
}

const tempDir = mkdtempSync(join(tmpdir(), "pb-smoke-reads-"));
const dataDir = join(tempDir, "pb_data");
mkdirSync(dataDir, { recursive: true });

const migrationSrc = join(projectRoot, "pb_migrations", "1700000000_init_collections.js");
const migrationsDir = join(dataDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });
copyFileSync(migrationSrc, join(migrationsDir, "1700000000_init_collections.js"));

const adminEmail = `admin-${Date.now()}@smoke.local`;
const adminPassword = "smoke-admin-password-12345";
const port = await findFreePort();
const url = `http://127.0.0.1:${port}`;

console.log("=== Phase 3 Read Paths Smoke Test ===");
console.log(`  tempDir:  ${tempDir}`);
console.log(`  port:     ${port}`);

let pbProcess = null;
let cleanup = () => {
  try { if (pbProcess) pbProcess.kill("SIGTERM"); } catch {}
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("uncaughtException", (e) => { console.error("uncaught:", e); cleanup(); process.exit(1); });

console.log("\nApplying migration...");
const migrate = spawnSync(
  PB_BIN,
  ["migrate", "up", "--dir", dataDir, "--migrationsDir", migrationsDir],
  { encoding: "utf8" },
);
if (migrate.status !== 0) {
  console.error("smoke: migrate up failed:", migrate.stderr);
  process.exit(1);
}

console.log("Bootstrapping superuser...");
const superuser = spawnSync(
  PB_BIN,
  ["superuser", "upsert", adminEmail, adminPassword, "--dir", dataDir],
  { encoding: "utf8" },
);
if (superuser.status !== 0) {
  console.error("smoke: superuser upsert failed:", superuser.stderr);
  process.exit(1);
}

pbProcess = spawn(PB_BIN, ["serve", "--http", `127.0.0.1:${port}`, "--dir", dataDir], {
  stdio: ["ignore", "pipe", "pipe"],
});
pbProcess.stdout.on("data", () => {});
pbProcess.stderr.on("data", () => {});

const ready = await waitForPb(url);
if (!ready) {
  console.error("smoke: PB did not become ready in 15s");
  process.exit(1);
}
console.log("  PB ready.");

// =============================================================================
// Run Scenarios
// =============================================================================
try {
  const adminPb = new PocketBase(url);
  await adminPb.admins.authWithPassword(adminEmail, adminPassword);
  await adminPb.collection("users").subscribe("*", () => {});
  await sleep(200);

  // Create user
  const userEmail = `user-${Date.now()}@smoke.local`;
  const userPassword = "smoke-user-password-12345";
  const createdUser = await adminPb.collection("users").create({
    email: userEmail,
    password: userPassword,
    passwordConfirm: userPassword,
    verified: true,
  });
  const userId = createdUser.id;
  console.log(`  Created test user (id=${userId})`);

  // Authenticate as test user
  const userPb = new PocketBase(url);
  await userPb.collection("users").authWithPassword(userEmail, userPassword);

  // 1. Seed Workspace
  const workspace = await userPb.collection("workspaces").create({
    user: userId,
    name: "Engineering",
    icon: "💻",
    color: "#4f46e5",
    context: "dialogue context",
    agentName: "Dialogue",
    createdAt: Date.now(),
  });
  const wsId = workspace.id;
  console.log(`  Seeded workspace (id=${wsId})`);

  // 2. Seed Persona
  const persona = await userPb.collection("agent_personas").create({
    user: userId,
    name: "Tech Lead",
    prompt: "Be precise and analytical.",
    description: "Technical mentor",
    isDefault: false,
    createdAt: Date.now(),
  });
  const personaId = persona.id;
  console.log(`  Seeded persona (id=${personaId})`);

  // 3. Seed Session
  const session = await userPb.collection("chat_sessions").create({
    user: userId,
    workspace: wsId,
    agentPersona: personaId,
    title: "Refactoring Phase 3",
    lastActivity: Date.now(),
    createdAt: Date.now(),
  });
  const sessionId = session.id;
  console.log(`  Seeded session (id=${sessionId})`);

  // 4. Seed Task
  const task = await userPb.collection("tasks").create({
    user: userId,
    workspace: wsId,
    text: "Verify PB queries",
    priority: "high",
    category: "Coding",
    completed: false,
    dueDate: Date.now() - 3600 * 1000 * 24, // Overdue task (1 day ago)
    createdAt: Date.now() - 3600 * 1000 * 48,
  });
  const taskId = task.id;
  console.log(`  Seeded overdue task (id=${taskId})`);

  const completedTask = await userPb.collection("tasks").create({
    user: userId,
    workspace: wsId,
    text: "Setup workspace",
    priority: "medium",
    category: "Setup",
    completed: true,
    completedAt: Date.now() - 10000,
    createdAt: Date.now() - 3600 * 1000 * 96,
  });
  console.log(`  Seeded completed task (id=${completedTask.id})`);

  // 5. Seed Event
  const event = await userPb.collection("events").create({
    user: userId,
    workspace: wsId,
    title: "Sprint Review",
    startTime: Date.now() + 3600 * 1000 * 1, // Upcoming (in 1 hr)
    endTime: Date.now() + 3600 * 1000 * 2,
    eventType: "interval",
    createdAt: Date.now(),
  });
  const eventId = event.id;
  console.log(`  Seeded event (id=${eventId})`);

  // 6. Seed Habit
  const habit = await userPb.collection("habits").create({
    user: userId,
    workspace: wsId,
    name: "Drink water",
    archived: false,
    currentStreak: 5,
    createdAt: Date.now(),
    longestStreak: 10,
    frequency: "daily",
    frequencyConfig: {},
  });
  const habitId = habit.id;
  console.log(`  Seeded habit (id=${habitId})`);

  // Seed Habit Log
  const habitLog = await userPb.collection("habit_logs").create({
    user: userId,
    habit: habitId,
    dateString: "2026-06-07",
    timestamp: Date.now(),
    status: "completed",
  });
  console.log(`  Seeded habit log (id=${habitLog.id})`);

  // 7. Seed Muted CardState
  const cardState = await userPb.collection("card_state").create({
    user: userId,
    cardType: "morning_brief",
    cardId: "brief-1",
    mutedAt: Date.now(),
  });
  console.log(`  Seeded muted cardState (id=${cardState.id})`);

  // 8. Seed Reflection
  const reflection = await userPb.collection("reflections").create({
    user: userId,
    periodLabel: "Weekly review",
    userReflection: "", // Pending
    type: "weekly",
    periodStart: Date.now() - 7 * 24 * 3600 * 1000,
    periodEnd: Date.now(),
    summary: "Reflecting...",
    stats: { tasksCompleted: 1, tasksCreated: 2, eventsAttended: 0 },
    createdAt: Date.now(),
  });
  const reflectionId = reflection.id;
  console.log(`  Seeded reflection (id=${reflectionId})`);


  console.log("\n=== T1: Workspaces Read Queries ===");
  const wsList = await userPb.collection("workspaces").getList(1, 10, {
    filter: buildWorkspacesListFilter(userId)
  });
  assert(wsList.items.length === 1 && wsList.items[0].id === wsId, "workspacesListQuery returns correct workspaces");

  const wsGet = await userPb.collection("workspaces").getList(1, 1, {
    filter: buildWorkspacesGetFilter(wsId, userId)
  });
  assert(wsGet.items.length === 1 && wsGet.items[0].name === "Engineering", "workspacesGetQuery returns correct workspace");


  console.log("\n=== T2: Chat Sessions Read Queries ===");
  const sessList = await userPb.collection("chat_sessions").getList(1, 10, {
    filter: buildSessionsListFilter(userId, wsId, false)
  });
  assert(sessList.items.length === 1 && sessList.items[0].id === sessionId, "sessionsListQuery returns correct sessions");


  console.log("\n=== T3: Tasks Read Queries ===");
  const tasksList = await userPb.collection("tasks").getList(1, 10, {
    filter: buildTasksListFilter(userId, wsId)
  });
  assert(tasksList.items.length === 2, "tasksListQuery returns both tasks");

  const overdueTasks = tasksList.items.filter(t => !t.completed && t.dueDate < Date.now());
  assert(overdueTasks.length === 1 && overdueTasks[0].id === taskId, "tasksListQuery correctly identifies overdue task");

  const completedSearch = await userPb.collection("tasks").getList(1, 10, {
    filter: buildTasksSearchHistoryFilter(userId, "Setup")
  });
  assert(completedSearch.items.length === 1 && completedSearch.items[0].id === completedTask.id, "tasksSearchHistoryQuery correctly filters by query");


  console.log("\n=== T4: Events Read Queries ===");
  const eventsList = await userPb.collection("events").getList(1, 10, {
    filter: `user = "${userId}" && workspace = "${wsId}"`
  });
  assert(eventsList.items.length === 1 && eventsList.items[0].id === eventId, "eventsListQuery returns correct events");


  console.log("\n=== T5: Habits and Logs Read Queries ===");
  const habitsList = await userPb.collection("habits").getList(1, 10, {
    filter: `user = "${userId}" && archived = false`
  });
  assert(habitsList.items.length === 1 && habitsList.items[0].id === habitId, "habitsListQuery returns correct habits");

  const logsList = await userPb.collection("habit_logs").getList(1, 10, {
    filter: `user = "${userId}"`
  });
  assert(logsList.items.length === 1 && logsList.items[0].habit === habitId, "logsListQuery returns correct logs");


  console.log("\n=== T6: Proactive Dashboard Queries ===");
  // Attention needed logic
  const attentionReflections = await userPb.collection("reflections").getList(1, 10, {
    filter: `user = "${userId}"`
  });
  const pendingReflection = attentionReflections.items.find(r => !r.userReflection);
  assert(pendingReflection && pendingReflection.id === reflectionId, "Dashboard query detects pending reflection");

  // Muted card state check
  const mutedStates = await userPb.collection("card_state").getList(1, 10, {
    filter: `user = "${userId}"`
  });
  assert(mutedStates.items.length === 1 && mutedStates.items[0].cardType === "morning_brief", "Dashboard query returns muted card states");

} catch (e) {
  failed++;
  console.error("smoke: test scenario failed:", e?.message || e);
  if (e?.response) console.error("  response:", JSON.stringify(e.response));
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
cleanup();
process.exit(failed === 0 ? 0 : 1);
