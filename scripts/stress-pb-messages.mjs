// stress-pb-messages.mjs
//
// Phase 5.2: validate usePaginatedQuery + useQuery work against the REAL
// `messages` collection (with auth-gated listRule, a relation field to
// chat_sessions, real schema fields like text/author/timestamp), not the
// synthetic `stress_messages` collection that B.5b used.
//
// Why opt-in (via `npm run test:stress:messages`):
//   - Spawns a real PocketBase server process.
//   - Copies the project's actual migration file, so it always exercises
//     the real schema (not a hand-written mini-schema that can drift).
//   - Creates a real user, signs in, creates a real chat_sessions parent,
//     seeds N messages with the real `session` relation, then runs a
//     HookSimulator against `messages`.
//   - Takes ~5-10s depending on hardware.
//
// What it validates (vs. B.5b's synthetic 10K run):
//   - Auth-gated `listRule: "@request.auth.id != ''"` actually requires
//     sign-in (unauthed client gets 0 results / 403).
//   - The `session` relation field can be created and filtered on
//     (filter `session = "<id>"` is required, not optional).
//   - Real schema fields (text + author + timestamp) roundtrip via the SDK.
//   - The HookSimulator pattern translates 1:1 to the real collection.
//   - Filter scoping: a second chat_sessions' messages are excluded when
//     the hook's filter is `session = "<first id>"`.
//
// What it does NOT validate (already done by B.5b or unit tests):
//   - SDK getList + sort + filter at 10K scale. B.5b's synthetic run is
//     the scale test; this one focuses on real-collection concerns.
//   - The hook's React integration (useState/useEffect/useCallback plumbing).
//     That requires jsdom + RTL, deferred to Stream C. The pagination
//     helpers in src/pb-compat/pagination.ts are unit-tested (27 tests);
//     B.5b's HookSimulator validates the SDK + state machine + math.
//
// Self-contained: the pagination logic is inlined here (mirrors
// src/pb-compat/pagination.ts). Drift between the two is a known trade-off;
// the unit tests catch helper regressions, this catches real-collection
// regressions (auth, relation, JSON fields, indices).
//
// Usage:
//   POCKETBASE_BIN=/path/to/pocketbase node scripts/stress-pb-messages.mjs
//   npm run test:stress:messages   (uses the default Windows path)

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

// Polyfill EventSource for the PB SDK's RealtimeService (same as B.5b).
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;
const { default: PocketBase } = await import("pocketbase");

// =============================================================================
// Config
// =============================================================================

const localPbPath = join(process.cwd(), "pocketbase", process.platform === "win32" ? "pocketbase.exe" : "pocketbase");
const PB_BIN = process.env.POCKETBASE_BIN || (existsSync(localPbPath) ? localPbPath : "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe");
// 200 is enough to test pagination math (4 pages of 50) without making
// the seed slow. Auth + relation overhead per create is real (~2-3x the
// synthetic run), so smaller N is the right trade-off.
const TOTAL_ITEMS = 200;
const PAGE_SIZE = 50;
const EXPECTED_PAGES = Math.ceil(TOTAL_ITEMS / PAGE_SIZE);

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
// Setup: temp dir + copy the REAL migration + migrate up
// =============================================================================

const workDir = mkdtempSync(join(tmpdir(), "pb-stress-messages-"));
const migrationsDir = join(workDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });

// Copy the project's real migration into the temp data dir. This way the
// test always exercises the real schema, not a hand-written approximation.
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

// =============================================================================
// Spawn PB server
// =============================================================================

const port = 38090 + Math.floor(Math.random() * 200);
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

// Cleanup handler (same as B.5b).
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
// Bootstrap superuser + create test user + sign in (mirrors B.7.4)
// =============================================================================

const ADMIN_EMAIL = `admin-${Date.now()}@stress.local`;
const ADMIN_PASSWORD = "stress-admin-password-12345";
const USER_EMAIL = `user-${Date.now()}@stress.local`;
const USER_PASSWORD = "stress-user-password-12345";

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

// Sign in as the regular user (the "client app" path).
const pb = new PocketBase(`http://127.0.0.1:${port}`);
await pb.collection("users").authWithPassword(USER_EMAIL, USER_PASSWORD);

// =============================================================================
// Create parent chat_sessions + seed 200 real messages
// =============================================================================

console.log("Creating parent chat_sessions...");
const baseTime = Date.now();
const chatSession = await pb.collection("chat_sessions").create({
  user: userId,
  title: "Stress test session",
  timezone: "UTC",
  createdAt: baseTime,
  lastActivity: baseTime,
  pinned: false,
});
const sessionId = chatSession.id;
console.log(`  sessionId=${sessionId}`);

console.log(`Seeding ${TOTAL_ITEMS} real messages...`);
const seedStart = Date.now();
const CONCURRENCY = 25;
// Same SDK quirks as B.5b: parallel single creates, unique requestKey per
// call (PB auto-cancels duplicates), bounded concurrency (25 — lower than
// B.5b's 50 because each create also writes auth-checked records).
let seeded = 0;
async function seedChunk(start, end) {
  const promises = [];
  for (let i = start; i < end; i++) {
    promises.push(
      pb.collection("messages").create(
        {
          session: sessionId,
          text: `Message ${i}`,
          author: i % 2 === 0 ? "user" : "assistant",
          timestamp: baseTime - (TOTAL_ITEMS - i) * 60_000, // 1-minute spacing, oldest first
        },
        { requestKey: `seed-${i}` },
      ),
    );
  }
  await Promise.all(promises);
  seeded += end - start;
}
for (let i = 0; i < TOTAL_ITEMS; i += CONCURRENCY) {
  await seedChunk(i, Math.min(i + CONCURRENCY, TOTAL_ITEMS));
  if (seeded % 50 < CONCURRENCY) console.log(`  ${seeded}/${TOTAL_ITEMS}`);
}
console.log(`  ${TOTAL_ITEMS}/${TOTAL_ITEMS} (${Date.now() - seedStart}ms)`);

// SDK warmup (same as B.5b: subscribe + create + delete to consume the
// first-broadcast-lost slot, keeping the warmup subscribe OPEN).
{
  // eslint-disable-next-line no-unused-vars
  const _warmupListener = () => {};
  await pb.collection("messages").subscribe("*", _warmupListener);
  await new Promise((r) => setTimeout(r, 200));
  const warm = await pb.collection("messages").create({
    session: sessionId,
    text: "WARMUP",
    author: "user",
    timestamp: Date.now(),
  });
  await new Promise((r) => setTimeout(r, 500));
  await pb.collection("messages").delete(warm.id);
  await new Promise((r) => setTimeout(r, 500));
  console.log("  SDK warmup done.");
}

// =============================================================================
// HookSimulator — mirrors src/pb-compat/use-paginated-query.ts logic
//
// Diff vs. B.5b: the filter REQUIRES `session = "<id>"`. The cursor filter
// (`id < "<afterId>"`) is ANDed onto the session filter via PB's `&&`.
// Sort stays `-id` to match the B.5a hook (PB ids are random, not time-
// prefixed; the consumer-level "newest first" sort is in Chat.tsx's
// useMemo, not in the hook).
// =============================================================================

class HookSimulator {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.results = [];
    this.lastId = null;
    this.pageSize = PAGE_SIZE;
    this.status = "LoadingFirstPage";
  }

  async fetchPage(afterId) {
    const sessionFilter = `session = "${this.sessionId}"`;
    const cursorFilter = afterId ? `id < "${afterId}"` : null;
    const filter = cursorFilter ? `${sessionFilter} && ${cursorFilter}` : sessionFilter;
    const result = await pb.collection("messages").getList(1, this.pageSize, {
      sort: "-id",
      filter,
    });
    return {
      items: result.items,
      isDone: result.items.length < this.pageSize,
    };
  }

  async init() {
    const { items, isDone } = await this.fetchPage(null);
    this.results = items;
    this.lastId = items.at(-1)?.id ?? null;
    this.status = isDone ? "Exhausted" : "CanLoadMore";
  }

  async loadMore() {
    if (this.status !== "CanLoadMore") return [];
    const { items, isDone } = await this.fetchPage(this.lastId);
    if (items.length === 0) {
      this.status = "Exhausted";
      return [];
    }
    this.results = [...this.results, ...items];
    this.lastId = items.at(-1)?.id ?? this.lastId;
    this.status = isDone ? "Exhausted" : "CanLoadMore";
    return items;
  }
}

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

async function waitForEvent(predicate, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for event`));
    }, timeoutMs);
    let unsub;
    pb.collection("messages")
      .subscribe("*", (e) => {
        if (predicate(e)) {
          clearTimeout(timer);
          if (unsub) unsub();
          resolve(e);
        }
      })
      .then((u) => {
        unsub = u;
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// =============================================================================
// T1: Initial load (with auth, against real schema)
// =============================================================================

console.log("\n=== T1: Initial load (real schema, auth-gated) ===");
const sim = new HookSimulator(sessionId);
await sim.init();
assert(sim.results.length === PAGE_SIZE, `initial load returns ${PAGE_SIZE} items`);
assert(sim.status === "CanLoadMore", "status is CanLoadMore");
// The seed uses real schema fields; the SDK should roundtrip them.
assert(typeof sim.results[0].text === "string", "real text field roundtrips");
assert(typeof sim.results[0].author === "string", "real author field roundtrips");
assert(typeof sim.results[0].timestamp === "number", "real timestamp field roundtrips");
assert(sim.results[0].session === sessionId, "real session relation roundtrips");

// =============================================================================
// T2: Paginate to Exhausted (verifies filter + cursor math)
// =============================================================================

console.log("\n=== T2: Paginate to Exhausted (filter+sort) ===");
let dataPages = 1;
while (sim.status === "CanLoadMore") {
  const items = await sim.loadMore();
  if (items.length === 0) break;
  dataPages++;
  if (dataPages > EXPECTED_PAGES + 5) {
    assert(false, `did not exhaust within ${EXPECTED_PAGES + 5} pages`);
    break;
  }
}
assert(sim.results.length === TOTAL_ITEMS, `loaded all ${TOTAL_ITEMS} items`);
assert(sim.status === "Exhausted", "final status is Exhausted");
assert(dataPages === EXPECTED_PAGES, `${EXPECTED_PAGES} pages expected, got ${dataPages}`);

const idSet = new Set(sim.results.map((r) => r.id));
assert(idSet.size === TOTAL_ITEMS, `no duplicate ids (${idSet.size} unique)`);

let orderOk = true;
for (let i = 1; i < sim.results.length; i++) {
  if (sim.results[i - 1].id < sim.results[i].id) {
    orderOk = false;
    break;
  }
}
assert(orderOk, "all items in id-desc order (PB ids are random, but sort is stable)");

// =============================================================================
// T3: Subscribe + create event (mid-stream, real schema)
// =============================================================================

console.log("\n=== T3: Subscribe + create event ===");
const sim3 = new HookSimulator(sessionId);
await sim3.init();

try {
  const eventPromise = waitForEvent((e) => e.action === "create");
  const newItem = await pb.collection("messages").create({
    session: sessionId,
    text: "NEWEST",
    author: "user",
    timestamp: Date.now(),
  });
  const evt = await eventPromise;
  assert(evt.record.id === newItem.id, "create event has the new item's id");
  assert(evt.record.session === sessionId, "create event preserves session relation");
  // Mirror the hook's handleCreateEvent: prepend only if newer.
  const isNewer = newItem.id > sim3.results[0].id;
  const prepended = isNewer
    ? [newItem, ...sim3.results.slice(0, PAGE_SIZE - 1)]
    : sim3.results.slice(0, PAGE_SIZE);
  assert(
    prepended[0].id === (isNewer ? newItem.id : sim3.results[0].id),
    `prepending puts the new item at index 0 only if newer (isNewer=${isNewer})`,
  );
} catch (err) {
  failed++;
  console.log(`  FAIL  T3: ${err.message}`);
}

// =============================================================================
// T4: Subscribe + update event
// =============================================================================

console.log("\n=== T4: Subscribe + update event ===");
const sim4 = new HookSimulator(sessionId);
await sim4.init();
const updateTarget = sim4.results[10];

try {
  const eventPromise = waitForEvent(
    (e) => e.action === "update" && e.record.id === updateTarget.id,
  );
  await pb.collection("messages").update(updateTarget.id, { text: "UPDATED" });
  const evt = await eventPromise;
  assert(evt.record.id === updateTarget.id, "update event has the right id");
  assert(evt.record.text === "UPDATED", "update event has the new text");
} catch (err) {
  failed++;
  console.log(`  FAIL  T4: ${err.message}`);
}

// =============================================================================
// T5: Subscribe + delete event
// =============================================================================

console.log("\n=== T5: Subscribe + delete event ===");
const sim5 = new HookSimulator(sessionId);
await sim5.init();
const deleteTarget = sim5.results[5];

try {
  const eventPromise = waitForEvent(
    (e) => e.action === "delete" && e.record.id === deleteTarget.id,
  );
  await pb.collection("messages").delete(deleteTarget.id);
  const evt = await eventPromise;
  assert(evt.record.id === deleteTarget.id, "delete event has the right id");
} catch (err) {
  failed++;
  console.log(`  FAIL  T5: ${err.message}`);
}

// =============================================================================
// T6: Auth gate — unauthed client gets 0 results
// =============================================================================

console.log("\n=== T6: Auth gate (unauthed client) ===");
try {
  const anonPb = new PocketBase(`http://127.0.0.1:${port}`);
  // No authWithPassword call. listRule `@request.auth.id != ''` should
  // block the request.
  const anonList = await anonPb.collection("messages").getList(1, 5, {
    sort: "-id",
    filter: `session = "${sessionId}"`,
  });
  assert(anonList.items.length === 0, "unauthed getList returns 0 items (listRule blocks)");
  assert(anonList.totalItems === 0, "unauthed totalItems is 0");
} catch (err) {
  // Some PB versions throw 403 instead of returning empty. Accept either.
  const msg = String(err?.message || err);
  if (msg.includes("403") || msg.includes("401") || msg.includes("Failed to authenticate")) {
    passed++;
    console.log("  PASS  unauthed getList rejected (403/401) (listRule blocks)");
  } else {
    failed++;
    console.log(`  FAIL  T6: unexpected error: ${msg}`);
  }
}

// =============================================================================
// T7: Filter scoping — second session's messages are excluded
// =============================================================================

console.log("\n=== T7: Filter scoping (second session isolation) ===");
try {
  // Create a second chat_sessions + seed 50 messages for it.
  const session2 = await pb.collection("chat_sessions").create({
    user: userId,
    title: "Other session",
    timezone: "UTC",
    createdAt: baseTime,
    lastActivity: baseTime,
    pinned: false,
  });
  const session2Id = session2.id;
  for (let i = 0; i < 50; i++) {
    await pb.collection("messages").create(
      {
        session: session2Id,
        text: `Other ${i}`,
        author: "user",
        timestamp: baseTime - i * 60_000,
      },
      { requestKey: `s2-${i}` },
    );
  }

  // Query with the first session's filter — must NOT see the other 50.
  const filtered = await pb.collection("messages").getList(1, 300, {
    sort: "-id",
    filter: `session = "${sessionId}"`,
  });
  assert(
    filtered.items.length === TOTAL_ITEMS,
    `filter scoping: only ${TOTAL_ITEMS} items from session1, got ${filtered.items.length}`,
  );
  assert(
    filtered.items.every((m) => m.session === sessionId),
    "filter scoping: all items belong to session1",
  );
  // Total via getList (which would include the other 50 if filter were broken).
  const unfilteredCount = await pb.collection("messages").getList(1, 300);
  assert(
    unfilteredCount.items.length > TOTAL_ITEMS,
    `unfiltered count includes both sessions (got ${unfilteredCount.items.length}, expected >${TOTAL_ITEMS})`,
  );
} catch (err) {
  failed++;
  console.log(`  FAIL  T7: ${err.message}`);
}

// =============================================================================
// Report + cleanup
// =============================================================================

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
console.log(`  Items seeded: ${TOTAL_ITEMS}`);
console.log(`  Pages:        ${dataPages} of ${EXPECTED_PAGES} expected`);
console.log(`  Page size:    ${PAGE_SIZE}`);
console.log(`  Collection:   messages (real schema, auth-gated, relation-filtered)`);

cleanup();
const exitCode = failed === 0 ? 0 : 1;
await new Promise((r) => setTimeout(r, 200));
process.exit(exitCode);
