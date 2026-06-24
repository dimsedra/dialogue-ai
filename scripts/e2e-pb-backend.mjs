// e2e-pb-backend.mjs
//
// Phase 9: Unified E2E Backend Testing Suite
// Validates Phase 8 (File Uploads & Public Reflections) and Core Data Mutations.

import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;

const { default: PocketBase } = await import("pocketbase");

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

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
  return 28000 + Math.floor(Math.random() * 1000);
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

const localPbPath = join(process.cwd(), "pocketbase", process.platform === "win32" ? "pocketbase.exe" : "pocketbase");
const PB_BIN = process.env.POCKETBASE_BIN || (existsSync(localPbPath) ? localPbPath : "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe");
if (!existsSync(PB_BIN)) {
  console.error(`smoke: POCKETBASE_BIN not found at ${PB_BIN}. Please set POCKETBASE_BIN env var or place the binary in the local pocketbase folder.`);
  process.exit(2);
}

const tempDir = mkdtempSync(join(tmpdir(), "pb-e2e-"));
const dataDir = join(tempDir, "pb_data");
mkdirSync(dataDir, { recursive: true });

// Copy all migrations
const migrationsDir = join(dataDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });
const sourceMigrationsDir = join(projectRoot, "pb_migrations");
import { readdirSync } from "node:fs";
for (const file of readdirSync(sourceMigrationsDir)) {
  if (file.endsWith(".js")) {
    copyFileSync(join(sourceMigrationsDir, file), join(migrationsDir, file));
  }
}

const adminEmail = `admin-${Date.now()}@smoke.local`;
const adminPassword = "smoke-admin-password-12345";
const port = await findFreePort();
const url = `http://127.0.0.1:${port}`;

console.log("=== Phase 9 E2E: Backend Integrations ===");

let pbProcess = null;
let cleanup = () => {
  try { if (pbProcess) pbProcess.kill("SIGTERM"); } catch {}
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

console.log("\nApplying migrations...");
const migrate = spawnSync(
  PB_BIN,
  ["migrate", "up", "--dir", dataDir, "--migrationsDir", migrationsDir],
  { encoding: "utf8" }
);
if (migrate.status !== 0) {
  console.error("Migration failed:", migrate.stderr);
  process.exit(1);
}
console.log("  Migrations applied successfully.");

const superuser = spawnSync(
  PB_BIN,
  ["superuser", "upsert", adminEmail, adminPassword, "--dir", dataDir],
  { encoding: "utf8" }
);

pbProcess = spawn(PB_BIN, ["serve", "--http", `127.0.0.1:${port}`, "--dir", dataDir], {
  stdio: ["ignore", "pipe", "pipe"],
});

const ready = await waitForPb(url);
if (!ready) {
  console.error("smoke: PB did not become ready in 15s");
  process.exit(1);
}
console.log("  PB ready.");

let userPb, unauthPb, userId, sessionId, workspaceId;
try {
  const adminPb = new PocketBase(url);
  await adminPb.admins.authWithPassword(adminEmail, adminPassword);
  
  const userEmail = `user-${Date.now()}@smoke.local`;
  const userPassword = "smoke-user-password-12345";
  const created = await adminPb.collection("users").create({
    email: userEmail,
    password: userPassword,
    passwordConfirm: userPassword,
    verified: true,
  });
  userId = created.id;

  userPb = new PocketBase(url);
  await userPb.collection("users").authWithPassword(userEmail, userPassword);

  unauthPb = new PocketBase(url);
  
  // Seed workspace and session
  const workspace = await userPb.collection("workspaces").create({
    user: userId,
    name: "Default Workspace",
    icon: "briefcase",
    color: "blue",
    createdAt: Date.now()
  });
  workspaceId = workspace.id;
  
  const session = await userPb.collection("chat_sessions").create({
    user: userId,
    workspace: workspaceId,
    title: "E2E Session",
    createdAt: Date.now(),
    lastActivity: Date.now()
  });
  sessionId = session.id;

} catch (e) {
  console.error("Setup failed:", e);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Test 1: Phase 8 - Public Reflections
// -----------------------------------------------------------------------------
console.log("\n=== T1: Public Reflections ===");
try {
  const reflection = await userPb.collection("reflections").create({
    user: userId,
    workspace: workspaceId,
    type: "weekly",
    summary: "Summary",
    stats: {
      tasksCompleted: 0,
      tasksCreated: 0,
      eventsAttended: 0
    },
    periodStart: Date.now(),
    periodEnd: Date.now(),
    periodLabel: "Today",
    shared: false,
    createdAt: Date.now()
  });

  try {
    await unauthPb.collection("reflections").getOne(reflection.id);
    assert(false, "Unauthenticated fetch of shared=false should fail");
  } catch (e) {
    assert(e.status === 404 || e.status === 403, "Unauthenticated fetch of shared=false blocked");
  }

  await userPb.collection("reflections").update(reflection.id, { shared: true });
  
  const publicReflection = await unauthPb.collection("reflections").getOne(reflection.id);
  assert(publicReflection.id === reflection.id, "Unauthenticated fetch of shared=true succeeds");
} catch (e) {
  failed++;
  console.log(`  FAIL  T1 threw: ${e?.message || e}`);
  if (e?.response) console.log("  " + JSON.stringify(e.response.data));
}

// -----------------------------------------------------------------------------
// Test 2: Phase 8 - File Attachments
// -----------------------------------------------------------------------------
console.log("\n=== T2: File Attachments (FormData) ===");
try {
  // Create a mock file
  const mockFileContent = "Hello PocketBase File!";
  const tempFilePath = join(tempDir, "mock_file.txt");
  writeFileSync(tempFilePath, mockFileContent);
  
  const formData = new FormData();
  formData.append("user", userId);
  formData.append("session", sessionId);
  formData.append("text", "Check out this file!");
  formData.append("author", "User");
  formData.append("timestamp", Date.now().toString());
  formData.append("createdAt", Date.now().toString());
  
  // In Node environment we convert it to a Blob to append to FormData
  const blob = new Blob([mockFileContent], { type: "text/plain" });
  formData.append("attachments", blob, "mock_file.txt");

  const msg = await userPb.collection("messages").create(formData);
  assert(msg.attachments.length === 1, "File successfully attached and saved in array");
  
  const fileUrl = userPb.files.getUrl(msg, msg.attachments[0]);
  assert(fileUrl.includes("/api/files/"), "PocketBase returned valid file URL");
} catch (e) {
  failed++;
  console.log(`  FAIL  T2 threw: ${e?.message || e}`);
  if (e?.response) console.log("  " + JSON.stringify(e.response.data));
}

// -----------------------------------------------------------------------------
// Test 3: Phase 4 - Core Data Mutations
// -----------------------------------------------------------------------------
console.log("\n=== T3: Core Data Mutations ===");
try {
  const task = await userPb.collection("tasks").create({
    user: userId,
    workspace: workspaceId,
    text: "E2E Task",
    completed: false,
    priority: "high",
    createdAt: Date.now()
  });
  assert(task.text === "E2E Task", "Task created successfully");

  const updatedTask = await userPb.collection("tasks").update(task.id, { completed: true, completedAt: Date.now() });
  assert(updatedTask.completed === true, "Task updated successfully");
} catch (e) {
  failed++;
  console.log(`  FAIL  T3 threw: ${e?.message || e}`);
  if (e?.response) console.log("  " + JSON.stringify(e.response.data));
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
cleanup();
process.exit(failed === 0 ? 0 : 1);
