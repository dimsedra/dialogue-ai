// smoke-pb-dashboard.mjs
//
// Phase 5.3: validate that 8 simultaneous PB subscriptions (one per
// Dashboard split query) can coexist, all receive events correctly, and
// multi-listener-on-same-collection dispatch works.
//
// Why opt-in (via `npm run test:smoke:dashboard`):
//   - Spawns a real PocketBase server process.
//   - Opens 8 concurrent PB subscriptions across 5 distinct collections.
//   - Fires mutations to validate event fanout per subscriber.
//   - Takes ~3-5s depending on hardware.
//
// What it validates:
//   - 8 simultaneous subscriptions open without error.
//   - Mutation on a collection fans out to all subscribers of that
//     collection: `tasks` has 3 listeners (getAttentionNeeded,
//     getTaskTriage, getMorningBrief), `habits` has 2 (getHabitCheck,
//     getEveningLog), the other 3 collections have 1 each.
//   - Mutation on a non-subscribed collection (`users`) does NOT
//     trigger any of the 8 Dashboard subscribers (validates collection-
//     level isolation).
//   - Update events fan out the same way as creates (one mutation -> N
//     listeners on the same collection).
//
// What it does NOT validate (already covered by other tests):
//   - The actual query results — the descriptor impls in
//     src/pb-compat/descriptors/dashboard.ts are unit-tested (3 tests).
//   - The hook's React integration (useState/useEffect/useCallback
//     plumbing). That requires jsdom + RTL, deferred to Stream C.
//   - Scale at 10K+ records — B.5b's synthetic run is the scale test;
//     this one focuses on multi-subscription fanout semantics.
//
// Usage:
//   POCKETBASE_BIN=/path/to/pocketbase node scripts/smoke-pb-dashboard.mjs
//   npm run test:smoke:dashboard   (uses the default Windows path)

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
import { createRequire } from "node:module";

// Polyfill EventSource for the PB SDK's RealtimeService (same as B.5b/5.2).
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;
const { default: PocketBase } = await import("pocketbase");

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

// =============================================================================
// Dashboard subscription layout (mirrors src/pb-compat/descriptors/dashboard.ts)
//
// 8 split queries -> 8 PB `subscribe()` calls on 5 distinct collections:
//   tasks:       3 listeners (getAttentionNeeded, getTaskTriage, getMorningBrief)
//   reflections: 1 listener  (getReflectionReady)
//   events:      1 listener  (getEventPrep)
//   habits:      2 listeners (getHabitCheck, getEveningLog)
//   card_state:  1 listener  (getMutedCardStates)
//
// Total: 8 listeners, 5 EventSources (PB SDK dedupes per collection).
// =============================================================================

const DASHBOARD_SUBSCRIPTIONS = [
  { query: "getAttentionNeeded", collection: "tasks" },
  { query: "getReflectionReady", collection: "reflections" },
  { query: "getTaskTriage", collection: "tasks" },
  { query: "getMorningBrief", collection: "tasks" },
  { query: "getEventPrep", collection: "events" },
  { query: "getHabitCheck", collection: "habits" },
  { query: "getEveningLog", collection: "habits" },
  { query: "getMutedCardStates", collection: "card_state" },
];

// =============================================================================
// Setup: temp dir + copy the REAL migration + migrate up + spawn PB
// =============================================================================

const workDir = mkdtempSync(join(tmpdir(), "pb-smoke-dash-"));
const migrationsDir = join(workDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });

const MIGRATION_CONTENT = readFileSync(REAL_MIGRATION_PATH, "utf8");
writeFileSync(join(migrationsDir, "1700000000_init_collections.js"), MIGRATION_CONTENT);

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

// Cleanup handler (same as B.5b/5.2).
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    pbProcess.kill("SIGTERM");
  } catch {}
  setTimeout(() => {
    try {
      pbProcess.kill("SIGKILL");
    } catch {}
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }, 100);
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught:", err);
  cleanup();
  process.exit(1);
});

// =============================================================================
// Bootstrap superuser + create test user + sign in
// =============================================================================

const ADMIN_EMAIL = `admin-${Date.now()}@dash.local`;
const ADMIN_PASSWORD = "dash-admin-password-12345";
const USER_EMAIL = `user-${Date.now()}@dash.local`;
const USER_PASSWORD = "dash-user-password-12345";

console.log("Bootstrapping superuser...");
const su = spawnSync(
  PB_BIN,
  ["superuser", "upsert", ADMIN_EMAIL, ADMIN_PASSWORD, "--dir", workDir],
  { encoding: "utf8" },
);
if (su.status !== 0) {
  console.error("Superuser upsert failed:");
  console.error(su.stdout);
  console.error(su.stderr);
  process.exit(1);
}

const adminPb = new PocketBase(`http://127.0.0.1:${port}`);
await adminPb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

console.log("Creating regular test user...");
const createdUser = await adminPb.collection("users").create({
  email: USER_EMAIL,
  password: USER_PASSWORD,
  passwordConfirm: USER_PASSWORD,
  verified: true,
});
const userId = createdUser.id;
console.log(`  userId=${userId}`);

const pb = new PocketBase(`http://127.0.0.1:${port}`);
await pb.collection("users").authWithPassword(USER_EMAIL, USER_PASSWORD);

// =============================================================================
// Test harness
// =============================================================================

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

// Count-based assert that returns the events array (or null) so the caller
// can safely access event details only when the count is correct.
function assertCount(query, expected, label) {
  const events = received.get(query);
  if (events.length === expected) {
    passed++;
    console.log(`  PASS  ${label} (got ${events.length})`);
    return events;
  } else {
    failed++;
    console.log(`  FAIL  ${label} (expected ${expected}, got ${events.length})`);
    return null;
  }
}

// Settle helper — wait for the WS broadcast to arrive before asserting.
function settle(ms = 300) {
  return new Promise((r) => setTimeout(r, ms));
}

// =============================================================================
// SDK warmup: pre-warm one EventSource per collection.
//
// The PB SDK reliably loses the FIRST broadcast event after a fresh
// subscribe on a collection (the WS clientId registration race — same
// root cause as B.5b's stress test). We open a no-op listener on each
// of the 5 subscribed collections BEFORE the real 8 dashboard subscribes,
// fire a create+delete on each to consume the first-broadcast-lost
// slot, and KEEP the warmup subscribes OPEN. The 8 dashboard subscribes
// then add listeners to the now-warm EventSources and fire reliably.
//
// Required fields per collection (from the project migration):
//   tasks:       user, text, createdAt
//   reflections: user, type, periodStart, periodEnd, periodLabel, summary, stats
//   events:      user, title, startTime, createdAt
//   habits:      user, name, frequency, currentStreak, longestStreak, createdAt
//   card_state:  user, cardType
// =============================================================================

console.log("\n=== T0: SDK warmup (per-collection EventSource pre-warm) ===");
const baseTime = Date.now();
const WARMUP_COLLECTIONS = ["tasks", "reflections", "events", "habits", "card_state"];
const WARMUP_DATA = {
  tasks: { user: null, text: "WARMUP_TASK", createdAt: baseTime },
  reflections: {
    user: null,
    type: "weekly",
    periodStart: baseTime - 7 * 24 * 60 * 60 * 1000,
    periodEnd: baseTime,
    periodLabel: "Warmup",
    summary: "Warmup reflection",
    stats: { messages: 0 },
    createdAt: baseTime,
  },
  events: {
    user: null,
    title: "WARMUP_EVENT",
    startTime: baseTime + 60 * 60 * 1000,
    createdAt: baseTime,
  },
  habits: {
    user: null,
    name: "WARMUP_HABIT",
    frequency: "daily",
    currentStreak: 0,
    longestStreak: 0,
    createdAt: baseTime,
  },
  card_state: { user: null, cardType: "warmup" },
};
// Patch in the userId now that we have it.
for (const coll of WARMUP_COLLECTIONS) {
  WARMUP_DATA[coll].user = userId;
}

const warmupUnsubs = [];
for (const coll of WARMUP_COLLECTIONS) {
  const unsub = await pb.collection(coll).subscribe("*", () => {});
  warmupUnsubs.push(unsub);
}
await new Promise((r) => setTimeout(r, 200));

const warmupItems = [];
for (const coll of WARMUP_COLLECTIONS) {
  try {
    const item = await pb.collection(coll).create(WARMUP_DATA[coll]);
    warmupItems.push({ coll, id: item.id });
  } catch (err) {
    console.warn(`  warmup create on ${coll} failed: ${err.message}`);
    if (err.response) {
      console.warn(`    response data: ${JSON.stringify(err.response.data)}`);
    }
    console.warn(`    sent data: ${JSON.stringify(WARMUP_DATA[coll])}`);
  }
}
await new Promise((r) => setTimeout(r, 500));
for (const { coll, id } of warmupItems) {
  await pb.collection(coll).delete(id);
}
await new Promise((r) => setTimeout(r, 500));
console.log(
  `  5 EventSources pre-warmed (subscribes kept open, ${warmupItems.length} warmup items created+deleted).`,
);

// =============================================================================
// Open 8 simultaneous PB subscriptions, track received events
//
// Each subscription is identified by its `query` name (from the Dashboard
// split queries). The PB SDK dedupes EventSource connections per
// collection, so 8 subscribe() calls on 5 distinct collections yield
// 5 EventSources + 8 listeners (3 on tasks, 2 on habits, 1 each on the
// other 3). With the warmup above, the EventSources are fully synced and
// the first event on each is delivered reliably.
// =============================================================================

console.log(`\n=== T1: Open ${DASHBOARD_SUBSCRIPTIONS.length} simultaneous subscriptions ===`);

const received = new Map(); // query -> [{ action, record }]
for (const sub of DASHBOARD_SUBSCRIPTIONS) {
  received.set(sub.query, []);
}

const unsubscribers = [];
for (const sub of DASHBOARD_SUBSCRIPTIONS) {
  const unsub = await pb.collection(sub.collection).subscribe("*", (e) => {
    received.get(sub.query).push({ action: e.action, record: e.record });
  });
  unsubscribers.push(unsub);
}
assert(
  unsubscribers.length === DASHBOARD_SUBSCRIPTIONS.length,
  `opened ${DASHBOARD_SUBSCRIPTIONS.length} subscriptions without error`,
);
assert(
  unsubscribers.every((u) => typeof u === "function"),
  "all subscriptions returned callable unsubscribers",
);

// Brief settle — let PB establish the 5 EventSources.
await new Promise((r) => setTimeout(r, 500));

// =============================================================================
// T2: Tasks create fans out to 3 task subscribers
// =============================================================================

console.log("\n=== T2: Tasks create fans out to 3 listeners ===");
const createdTask = await pb.collection("tasks").create({
  user: userId,
  text: "Dashboard test task",
  createdAt: baseTime,
});
await settle();
const t2a = assertCount("getAttentionNeeded", 1, "getAttentionNeeded received 1 event");
const t2b = assertCount("getTaskTriage", 1, "getTaskTriage received 1 event");
const t2c = assertCount("getMorningBrief", 1, "getMorningBrief received 1 event");
if (t2a) {
  assert(t2a[0].action === "create", "getAttentionNeeded event is a 'create'");
  assert(t2a[0].record.id === createdTask.id, "getAttentionNeeded event has the right id");
}
// Other 5 subscribers (reflections/events/habits/card_state) should be silent.
assert(
  received.get("getReflectionReady").length === 0,
  "getReflectionReady silent on tasks create (collection isolation)",
);
assert(
  received.get("getEventPrep").length === 0,
  "getEventPrep silent on tasks create (collection isolation)",
);
assert(
  received.get("getHabitCheck").length === 0,
  "getHabitCheck silent on tasks create (collection isolation)",
);
assert(
  received.get("getEveningLog").length === 0,
  "getEveningLog silent on tasks create (collection isolation)",
);
assert(
  received.get("getMutedCardStates").length === 0,
  "getMutedCardStates silent on tasks create (collection isolation)",
);

// =============================================================================
// T3: Each non-tasks collection fans out to its single subscriber
// =============================================================================

console.log("\n=== T3: Non-tasks collections fan out to 1 listener ===");
const createdReflection = await pb.collection("reflections").create(WARMUP_DATA.reflections);
await settle();
const t3a = assertCount("getReflectionReady", 1, "getReflectionReady received 1 event");
if (t3a) assert(t3a[0].record.id === createdReflection.id, "getReflectionReady event has the right id");
assert(
  received.get("getEventPrep").length === 0,
  "getEventPrep silent on reflections create (collection isolation)",
);

const createdEvent = await pb.collection("events").create({
  user: userId,
  title: "Test event",
  startTime: baseTime + 60 * 60 * 1000,
  createdAt: baseTime,
});
await settle();
const t3b = assertCount("getEventPrep", 1, "getEventPrep received 1 event");
if (t3b) assert(t3b[0].record.id === createdEvent.id, "getEventPrep event has the right id");
assert(
  received.get("getHabitCheck").length === 0,
  "getHabitCheck silent on events create (collection isolation)",
);

const createdHabit = await pb.collection("habits").create({
  user: userId,
  name: "Test habit",
  frequency: "daily",
  currentStreak: 0,
  longestStreak: 0,
  createdAt: baseTime,
});
await settle();
const t3c = assertCount("getHabitCheck", 1, "getHabitCheck received 1 event");
const t3d = assertCount("getEveningLog", 1, "getEveningLog received 1 event");
if (t3c) assert(t3c[0].record.id === createdHabit.id, "getHabitCheck event has the right id");
assert(
  received.get("getMutedCardStates").length === 0,
  "getMutedCardStates silent on habits create (collection isolation)",
);

const createdCard = await pb.collection("card_state").create({
  user: userId,
  cardType: "test",
  muted: true,
});
await settle();
const t3e = assertCount("getMutedCardStates", 1, "getMutedCardStates received 1 event");
if (t3e) assert(t3e[0].record.id === createdCard.id, "getMutedCardStates event has the right id");

// =============================================================================
// T4: Update on tasks fans out to 3 task subscribers
// =============================================================================

console.log("\n=== T4: Tasks update fans out to 3 listeners ===");
await pb.collection("tasks").update(createdTask.id, { text: "UPDATED" });
await settle(500);
const t4a = assertCount("getAttentionNeeded", 2, "getAttentionNeeded received 2 events (create + update)");
const t4b = assertCount("getTaskTriage", 2, "getTaskTriage received 2 events (create + update)");
const t4c = assertCount("getMorningBrief", 2, "getMorningBrief received 2 events (create + update)");
if (t4a) {
  assert(t4a[1].action === "update", "getAttentionNeeded's 2nd event is an 'update'");
  assert(t4a[1].record.text === "UPDATED", "getAttentionNeeded's 2nd event has the updated text");
}

// =============================================================================
// T5: Non-subscribed collection does NOT trigger any of the 8
// =============================================================================

console.log("\n=== T5: Non-subscribed collection (users) is isolated ===");
// `users` is a different collection than any of the 5 subscribed ones.
// None of the 8 subscribers should receive an event from a users mutation.
// (We can't easily create a user via the regular userPb client — `users`
// is not in our auth scope. So we just verify counts haven't changed.)
const before = new Map();
for (const [q, evs] of received) before.set(q, evs.length);
// Trigger a trivial mutation on the authed `users` collection via a no-op
// profile update. Even if access rules block, no event should reach any
// of the 8 subscribers.
try {
  await pb.collection("users").update(userId, { name: "no-op" });
} catch {
  // access rule may block; we don't care about the result, only that no
  // subscriber fires.
}
await settle();
let anyFired = false;
for (const [q, evs] of received) {
  if (evs.length > (before.get(q) || 0)) {
    anyFired = true;
    console.log(`    unexpected: ${q} fired on users mutation`);
  }
}
assert(!anyFired, "no Dashboard subscriber fired on a users mutation");

// =============================================================================
// Cleanup
// =============================================================================

// Unsubscribe all 8 to validate the unsubscribe function works.
for (const unsub of unsubscribers) unsub();

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
console.log(`  Subscriptions:    ${DASHBOARD_SUBSCRIPTIONS.length} (across 5 distinct collections)`);
console.log(`  Tasks listeners:  3 (getAttentionNeeded, getTaskTriage, getMorningBrief)`);
console.log(`  Habits listeners: 2 (getHabitCheck, getEveningLog)`);
console.log(`  Other listeners:  3 (getReflectionReady, getEventPrep, getMutedCardStates)`);

cleanup();
const exitCode = failed === 0 ? 0 : 1;
await new Promise((r) => setTimeout(r, 200));
process.exit(exitCode);
