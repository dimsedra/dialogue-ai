// smoke-pb-jobs.mjs
//
// Phase 6.1.1: validate the PB data-layer integration that the
// `generateSessionTitle` background job depends on.
//
// What this smoke test does:
//   1. Spawn a real PocketBase server with the project's real
//      migration applied.
//   2. Create a superuser + a regular test user (signUp).
//   3. Create a user_profile with a preferences blob (schema sanity).
//   4. Create a chat_session + 3 messages for that user.
//   5. Read the data back with the right filters/sorting to confirm the
//      index `idx_messages_session_timestamp` works correctly.
//   6. Validate the `listRule`/`viewRule` for `user = @request.auth.id`
//      prevents cross-user reads.
//
// What it does NOT validate:
//   - The function's logic (branches, LLM call, title update). That is
//     covered by the vitest unit test `generateSessionTitle.test.ts`
//     which mocks the PB client + LLM imports.
//   - The HTTP route. That is a thin auth+JSON wrapper; the B.4
//     dispatcher pattern is covered by other tests.
//
// Why opt-in (via `npm run test:smoke:jobs`):
//   - Spawns a real PocketBase server process.
//   - ~5-10s depending on hardware.
//
// Usage:
//   POCKETBASE_BIN=/path/to/pocketbase node scripts/smoke-pb-jobs.mjs
//   npm run test:smoke:jobs   (uses the default Windows path)

import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

// =============================================================================
// Config
// =============================================================================

const PB_BIN =
  process.env.POCKETBASE_BIN ||
  "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const REAL_MIGRATION_PATH = join(
  PROJECT_ROOT,
  "pb_migrations",
  "1700000000_init_collections.js",
);

if (!existsSync(PB_BIN)) {
  console.error(`PocketBase binary not found at: ${PB_BIN}`);
  console.error("Set POCKETBASE_BIN env var or place the binary at the default path.");
  process.exit(2);
}
if (!existsSync(REAL_MIGRATION_PATH)) {
  console.error(`Project migration file not found at: ${REAL_MIGRATION_PATH}`);
  process.exit(2);
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const tag = passed ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

// =============================================================================
// Setup: temp dir + copy the REAL migration + migrate up + spawn PB
// =============================================================================

const workDir = mkdtempSync(join(tmpdir(), "pb-smoke-jobs-"));
const migrationsDir = join(workDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });

const MIGRATION_CONTENT = readFileSync(REAL_MIGRATION_PATH, "utf8");
writeFileSync(
  join(migrationsDir, "1700000000_init_collections.js"),
  MIGRATION_CONTENT,
);

console.log(`Work dir: ${workDir}`);
console.log("Applying real project migration...");
const up = spawnSync(
  PB_BIN,
  ["migrate", "up", "--dir", workDir, "--migrationsDir", migrationsDir],
  { encoding: "utf8" },
);
if (up.status !== 0) {
  console.error("Migration failed:");
  console.error(up.stdout);
  console.error(up.stderr);
  process.exit(1);
}

const port = 48090 + Math.floor(Math.random() * 200);
console.log(`Starting PB on port ${port}...`);

const pbProcess = spawn(
  PB_BIN,
  ["serve", `--http=127.0.0.1:${port}`, "--dir", workDir],
  { stdio: ["ignore", "pipe", "pipe"] },
);

pbProcess.on("error", (err) => {
  console.error("PB process error:", err);
  process.exit(1);
});

async function waitForHealth(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`PB did not become healthy within ${timeoutMs}ms`);
}

await waitForHealth();
console.log("PB ready.");

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { pbProcess.kill("SIGTERM"); } catch {}
  setTimeout(() => {
    try { pbProcess.kill("SIGKILL"); } catch {}
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }, 100);
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

// =============================================================================
// Create superuser + regular user + test fixtures
// =============================================================================

const superEmail = `admin+${Date.now()}@example.com`;
const superPass = "adminPassword123!";
console.log(`Creating superuser ${superEmail}...`);
const su = spawnSync(
  PB_BIN,
  ["superuser", "upsert", superEmail, superPass, "--dir", workDir],
  { encoding: "utf8" },
);
if (su.status !== 0) {
  console.error("superuser create failed:", su.stderr);
  process.exit(1);
}

const PB_URL = `http://127.0.0.1:${port}`;

const { default: PocketBase } = await import("pocketbase");
const adminPb = new PocketBase(PB_URL);
await adminPb.admins.authWithPassword(superEmail, superPass);

// --- User fixtures ---
async function createUser(email, password) {
  const u = await adminPb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    emailVisibility: true,
    name: "Test User",
  });
  const pb = new PocketBase(PB_URL);
  await pb.collection("users").authWithPassword(email, password);
  return { record: u, pb, id: pb.authStore.record.id, token: pb.authStore.token };
}

const userA = await createUser(`userA+${Date.now()}@example.com`, "password123!");
const userB = await createUser(`userB+${Date.now()}@example.com`, "password123!");
console.log(`Created userA=${userA.id}, userB=${userB.id}`);

// --- user_profile ---
const profileA = await userA.pb.collection("user_profile").create({
  user: userA.id,
  name: "User A",
  bio: "Test bio A",
  preferences: {
    provider: "gemini",
    taskModels: { title: "gemini-2.5-flash" },
    customConfigs: {},
  },
});
console.log(`Created profileA=${profileA.id}`);

const profileB = await userB.pb.collection("user_profile").create({
  user: userB.id,
  name: "User B",
  bio: "Test bio B",
  preferences: {
    provider: "gemini",
    taskModels: { title: "gemini-2.5-flash" },
    customConfigs: {},
  },
});
console.log(`Created profileB=${profileB.id}`);

// --- chat_sessions ---
async function createSession(pb, userId, title, messages) {
  const s = await pb.collection("chat_sessions").create({
    user: userId,
    title: title || `Chat ${new Date().toISOString()}`,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  });
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    await pb.collection("messages").create({
      session: s.id,
      text: m.text,
      author: m.author,
      timestamp: Date.now() + i,
    });
  }
  return s;
}

const sessionA = await createSession(userA.pb, userA.id, "Chat test", [
  { author: "User", text: "Hello" },
  { author: "AI", text: "Hi there!" },
  { author: "User", text: "How are you?" },
]);
console.log(`Created sessionA=${sessionA.id} with 3 messages`);

const sessionACustomTitle = await createSession(userA.pb, userA.id, "Already titled", [
  { author: "User", text: "Test" },
]);
console.log(`Created sessionACustomTitle=${sessionACustomTitle.id}`);

const sessionAEmpty = await createSession(userA.pb, userA.id, "Chat empty", []);
console.log(`Created sessionAEmpty=${sessionAEmpty.id}`);

const sessionB = await createSession(userB.pb, userB.id, "Chat B", [
  { author: "User", text: "Hi from B" },
]);
console.log(`Created sessionB=${sessionB.id}`);

// =============================================================================
// Checks
// =============================================================================
console.log("\n=== Data-layer integration checks ===\n");

// 1. User A can read their own session
try {
  const s = await userA.pb.collection("chat_sessions").getOne(sessionA.id);
  check("User A reads own session", s.id === sessionA.id);
} catch (err) {
  check("User A reads own session", false, err.message);
}

// 2. User A cannot read User B's session (viewRule: "user = @request.auth.id")
try {
  await userA.pb.collection("chat_sessions").getOne(sessionB.id);
  check("User A cannot read User B's session", false, "should have thrown 404");
} catch (err) {
  const status = err.status ?? err.data?.status;
  check("User A cannot read User B's session", status === 404, `status=${status}`);
}

// 3. User A reads their own messages (timestamp asc)
try {
  const list = await userA.pb.collection("messages").getList(1, 50, {
    filter: `session = "${sessionA.id}"`,
    sort: "timestamp",
  });
  const texts = list.items.map((m) => `${m.author}: ${m.text}`);
  check(
    "Messages for sessionA in timestamp order",
    texts.length === 3 && texts[0].startsWith("User: Hello") && texts[2].startsWith("User: How are you?"),
    `got [${texts.join(", ")}]`,
  );
} catch (err) {
  check("Messages for sessionA in timestamp order", false, err.message);
}

// 4. User A reads their profile
try {
  const p = await userA.pb.collection("user_profile").getFirstListItem(`user = "${userA.id}"`);
  const prefs = p.preferences;
  check("User A profile has preferences", !!p, "ok");
  check("preferences.provider is gemini", prefs?.provider === "gemini", `got ${prefs?.provider}`);
  check("preferences.taskModels.title is set", prefs?.taskModels?.title === "gemini-2.5-flash", `got ${prefs?.taskModels?.title}`);
} catch (err) {
  check("User A profile", false, err.message);
}

// 5. Empty session has no messages
try {
  const list = await userA.pb.collection("messages").getList(1, 50, {
    filter: `session = "${sessionAEmpty.id}"`,
    sort: "timestamp",
  });
  check("Empty session has 0 messages", list.items.length === 0, `got ${list.items.length}`);
} catch (err) {
  check("Empty session has 0 messages", false, err.message);
}

// 6. Session with custom title retains title
try {
  const s = await userA.pb.collection("chat_sessions").getOne(sessionACustomTitle.id);
  check("Custom title session retains title", s.title === "Already titled", `got "${s.title}"`);
} catch (err) {
  check("Custom title session retains title", false, err.message);
}

// 7. Superuser can list all sessions (bypasses listRule)
try {
  const all = await adminPb.collection("chat_sessions").getList(1, 100);
  check("Superuser can list all sessions", all.totalItems >= 4, `count=${all.totalItems}`);
} catch (err) {
  check("Superuser can list all sessions", false, err.message);
}

// =============================================================================
// Summary
// =============================================================================

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
if (failed > 0) {
  console.error(`\n${failed} check(s) failed:`);
  for (const r of results.filter((r) => !r.passed)) {
    console.error(`  - ${r.name}: ${r.detail}`);
  }
  cleanup();
  process.exit(1);
}
console.log("All checks passed.");
cleanup();
process.exit(0);
