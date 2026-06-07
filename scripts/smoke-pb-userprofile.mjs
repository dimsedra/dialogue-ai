// Smoke test for the userProfile.get descriptor (B.7.4).
//
// Validates the descriptor's filter encoding against a real PocketBase
// instance, end-to-end:
//   1. Create a temp PB data dir, copy the migration into it.
//   2. Run `pocketbase migrate up` to apply the schema (no server).
//   3. Run `pocketbase superuser upsert` to bootstrap the first admin
//      (no server). The admin endpoint in PB 0.22+ is not reachable
//      via the HTTP API on a fresh data dir; the CLI is the only path.
//   4. Start the server on a free port.
//   5. Sign in as the admin via the SDK.
//   6. Create a test user with admin auth.
//   7. Sign in as the test user (regular `authWithPassword`). This
//      is simpler than `impersonate` and is the realistic path
//      consumers will use in the app.
//   8. Seed a `user_profile` record with the user's auth — at this
//      point `@request.auth.id === userId`, so the access rule
//      `user = @request.auth.id` is satisfied.
//   9. Use buildUserFilter() to build the filter string the same way
//      the descriptor does, then call getList with the user's auth.
//      Assert the record comes back.
//  10. Negative cases: undefined args → no match; wrong user id → no match.
//
// This is a smoke (not a unit test): it proves the descriptor works
// against a real PB. The pure-helper unit tests live in
// src/pb-compat/descriptors/userProfile.test.ts (B.7.2).
//
// Run via: npm run test:smoke (or POCKETBASE_BIN=/path/to/pb node ...).
// Exit 0 = pass. Non-zero = at least one assertion failed.

import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// globalThis.EventSource is not in Node 25; PB SDK uses it directly
// (see B.5b for the full discussion). The 'eventsource' package is
// already a transitive dep in node_modules at v3.0.7.
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;

const { default: PocketBase } = await import("pocketbase");

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Inline copy of buildUserFilter() from
// src/pb-compat/descriptors/userProfile.ts. Kept in sync manually;
// the smoke test asserts end-to-end BEHAVIOUR, but importing the
// real helper would require loading the React pb-compat barrel which
// pulls in hooks that break in Node.
function buildUserFilter(args) {
  if (!args || typeof args !== "object") return "1 = 2";
  const user = args.user;
  if (typeof user !== "string" || user.length === 0) return "1 = 2";
  const escaped = user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `user = "${escaped}"`;
}

// =============================================================================
// Test harness.
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

// =============================================================================
// Main.
// =============================================================================

const PB_BIN = process.env.POCKETBASE_BIN || "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe";
if (!existsSync(PB_BIN)) {
  console.error(`smoke: POCKETBASE_BIN not found at ${PB_BIN}`);
  console.error("Set POCKETBASE_BIN env var to the PB binary path.");
  process.exit(2);
}

const tempDir = mkdtempSync(join(tmpdir(), "pb-smoke-"));
const dataDir = join(tempDir, "pb_data");
mkdirSync(dataDir, { recursive: true });

const migrationSrc = join(projectRoot, "pb_migrations", "1700000000_init_collections.js");
if (!existsSync(migrationSrc)) {
  console.error(`smoke: migration not found at ${migrationSrc}`);
  process.exit(2);
}
const migrationsDir = join(dataDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });
copyFileSync(migrationSrc, join(migrationsDir, "1700000000_init_collections.js"));

const adminEmail = `admin-${Date.now()}@smoke.local`;
const adminPassword = "smoke-admin-password-12345";
const port = await findFreePort();
const url = `http://127.0.0.1:${port}`;

console.log("=== B.7.4 smoke: userProfile.get descriptor ===");
console.log(`  tempDir:  ${tempDir}`);
console.log(`  port:     ${port}`);
console.log(`  bin:      ${PB_BIN}`);
console.log(`  admin:    ${adminEmail}`);

let pbProcess = null;
let cleanup = () => {
  try { if (pbProcess) pbProcess.kill("SIGTERM"); } catch {}
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("uncaughtException", (e) => { console.error("uncaught:", e); cleanup(); process.exit(1); });

// Apply the migration. Pass --migrationsDir explicitly because the
// default resolution (dataDir/pb_migrations) is unreliable when the
// working directory differs from dataDir (which is the case here).
console.log("\nApplying migration...");
const migrate = spawnSync(
  PB_BIN,
  ["migrate", "up", "--dir", dataDir, "--migrationsDir", migrationsDir],
  { encoding: "utf8" },
);
if (migrate.status !== 0) {
  console.error("smoke: migrate up failed:");
  console.error(migrate.stdout);
  console.error(migrate.stderr);
  process.exit(1);
}
console.log("  " + (migrate.stdout.trim() || "(migration applied)"));

// Bootstrap the first superuser via CLI. PB 0.22+ does not expose a
// working HTTP endpoint for first-admin creation; this CLI is the
// documented path.
console.log("Bootstrapping superuser...");
const superuser = spawnSync(
  PB_BIN,
  ["superuser", "upsert", adminEmail, adminPassword, "--dir", dataDir],
  { encoding: "utf8" },
);
if (superuser.status !== 0) {
  console.error("smoke: superuser upsert failed:");
  console.error(superuser.stdout);
  console.error(superuser.stderr);
  process.exit(1);
}

// Start the server.
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
// Scenarios.
// =============================================================================

let adminPb, userId, userEmail, userPassword, userPb, profileId;
try {
  // Sign in as the admin.
  adminPb = new PocketBase(url);
  await adminPb.admins.authWithPassword(adminEmail, adminPassword);
  // PB SDK warmup: the first broadcast event after a fresh subscribe is
  // lost (B.5b). We do a no-op subscribe to consume the slot.
  await adminPb.collection("users").subscribe("*", () => {});
  await sleep(200);

  // Sanity: confirm user_profile collection is registered before
  // we try to seed a record. (PB 0.22+ would otherwise 404 with
  // "Missing or invalid collection context" if the migration didn't
  // run cleanly.)
  const cols = await adminPb.collections.getFullList();
  const up = cols.find((c) => c.name === "user_profile");
  if (!up) {
    console.error(`smoke: user_profile collection not found. Available: ${cols.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }
  console.log(`  user_profile collection registered (id=${up.id})`);

  // Create a test user with admin auth.
  userEmail = `user-${Date.now()}@smoke.local`;
  userPassword = "smoke-user-password-12345";
  const created = await adminPb.collection("users").create({
    email: userEmail,
    password: userPassword,
    passwordConfirm: userPassword,
    verified: true,
  });
  userId = created.id;
  console.log(`  created user (id=${userId})`);

  // Sign in as the test user via the regular `authWithPassword`.
  // This is the realistic path consumers will use in the app, and
  // it sets `@request.auth.id === userId` so the access rule
  // `user = @request.auth.id` is satisfied for subsequent writes.
  userPb = new PocketBase(url);
  await userPb.collection("users").authWithPassword(userEmail, userPassword);
  console.log(`  signed in as user; authStore.record.id=${userPb.authStore.record.id}`);

  // Seed a user_profile record with the user's auth.
  // The `preferences` field is `json` and required.
  // Note: we pass the user relation as the id string.
  const profile = await userPb.collection("user_profile").create({
    user: userId,
    name: "Smoke",
    bio: "smoke test profile",
    preferences: { provider: "gemini", customConfigs: {}, taskModels: {}, searchProvider: "tavily", pushEnabled: false },
  });
  profileId = profile.id;
  console.log(`  seeded user_profile (id=${profileId})`);
} catch (e) {
  console.error("smoke: setup failed:", e?.message || e);
  if (e?.response) console.error("  response:", JSON.stringify(e.response));
  process.exit(1);
}

const testFilter = buildUserFilter({ user: userId });

// T1: positive case — authed user's filter returns the seeded record.
console.log("\n=== T1: filter by authed user id returns the seeded record ===");
try {
  const list = await userPb.collection("user_profile").getList(1, 1, { filter: testFilter });
  assert(list.items.length === 1, "exactly one record returned");
  assert(list.items[0].user === userId, "record.user matches user id");
  assert(list.items[0].name === "Smoke", "record.name is 'Smoke'");
} catch (e) {
  failed++;
  console.log(`  FAIL  T1 threw: ${e?.message || e}`);
}

// T2: no-match for undefined args (the descriptor's skip pattern).
console.log("\n=== T2: filter '1 = 2' (undefined args) returns nothing ===");
try {
  const skipFilter = buildUserFilter(undefined);
  assert(skipFilter === "1 = 2", "buildUserFilter(undefined) === '1 = 2'");
  const list = await userPb.collection("user_profile").getList(1, 1, { filter: skipFilter });
  assert(list.items.length === 0, "no records returned for no-match filter");
} catch (e) {
  failed++;
  console.log(`  FAIL  T2 threw: ${e?.message || e}`);
}

// T3: no-match for a different (but valid-format) user id.
console.log("\n=== T3: filter for a non-existent user returns nothing ===");
try {
  const wrongId = "nonexistent00000000";
  const wrongFilter = buildUserFilter({ user: wrongId });
  assert(wrongFilter === `user = "${wrongId}"`, "buildUserFilter builds the right filter string");
  const list = await userPb.collection("user_profile").getList(1, 1, { filter: wrongFilter });
  assert(list.items.length === 0, "no records returned for unknown user id");
} catch (e) {
  failed++;
  console.log(`  FAIL  T3 threw: ${e?.message || e}`);
}

// T4: empty / non-string user fields produce the no-match filter.
console.log("\n=== T4: buildUserFilter guards on missing/empty/non-string user ===");
try {
  assert(buildUserFilter({}) === "1 = 2", "buildUserFilter({}) === '1 = 2'");
  assert(buildUserFilter({ user: "" }) === "1 = 2", "buildUserFilter({user: ''}) === '1 = 2'");
  assert(buildUserFilter({ user: 42 }) === "1 = 2", "buildUserFilter({user: 42}) === '1 = 2'");
  assert(buildUserFilter(null) === "1 = 2", "buildUserFilter(null) === '1 = 2'");
  assert(buildUserFilter("nope") === "1 = 2", "buildUserFilter('nope') === '1 = 2'");
} catch (e) {
  failed++;
  console.log(`  FAIL  T4 threw: ${e?.message || e}`);
}

// T5: quote/backslash escape in user id produces a safe filter.
console.log("\n=== T5: buildUserFilter escapes special chars in user id ===");
try {
  const tricky = 'has"quote\\and\\back';
  const expected = 'user = "has\\"quote\\\\and\\\\back"';
  const actual = buildUserFilter({ user: tricky });
  assert(actual === expected, `escaped filter matches expected (got: ${actual})`);
} catch (e) {
  failed++;
  console.log(`  FAIL  T5 threw: ${e?.message || e}`);
}

// =============================================================================
// Result + cleanup.
// =============================================================================

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
cleanup();
process.exit(failed === 0 ? 0 : 1);
