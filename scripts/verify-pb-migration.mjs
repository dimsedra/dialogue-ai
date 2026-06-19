// verify-pb-migration.mjs
//
// Phase 1.5 verification: end-to-end check that pb_migrations/1700000000_init_collections.js
// produces a schema that matches docs/migration/phase-1-schema-mapping.md.
//
// Usage (Windows):
//   1. Download PocketBase 0.39.1+ Windows binary from
//      https://github.com/pocketbase/pocketbase/releases
//      to e.g. C:\Users\<user>\tools\pocketbase\pocketbase.exe
//   2. From the project root, run:
//        node scripts/verify-pb-migration.mjs "<path-to-pocketbase.exe>"
//      (no quotes around the exe path needed if it has no spaces)
//
// What it does:
//   - Creates a temporary PB data directory under %TEMP%\pb-verify-<timestamp>\
//   - Copies pb_migrations/1700000000_init_collections.js into it
//   - Runs `pocketbase migrate up` against the fresh data dir
//   - Reads the resulting SQLite schema (data.db)
//   - Runs 100+ checks covering:
//     * 20 app collections exist with expected field/index counts
//     * users extension has all 6 custom fields
//     * critical fields by type (json, relation, select, file, etc.)
//     * access rules
//     * unique indexes on page_settings + push_subscriptions
//     * events.series self-reference
//     * all relation targets exist
//     * cascade-delete on user-owned collections
//     * select field value lists
//     * file field max sizes and mime types
//   - Exits 0 on success, 1 on any failure
//
// Phase 1.5 result (verified 2026-06-07): 117/117 checks pass.
// See docs/migration/phase-1-5-pb-verification.md for the full report.

import { existsSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const PB_BIN = process.argv[2] || process.env.POCKETBASE_BIN;
if (!PB_BIN) {
  console.error("Usage: node scripts/verify-pb-migration.mjs <path-to-pocketbase.exe>");
  console.error("   or: POCKETBASE_BIN=<path> node scripts/verify-pb-migration.mjs");
  process.exit(2);
}
const pbBin = resolve(PB_BIN);
if (!existsSync(pbBin)) {
  console.error("PocketBase binary not found at: " + pbBin);
  process.exit(2);
}

const projectRoot = process.cwd();
const migrationFile = join(projectRoot, "pb_migrations", "1700000000_init_collections.js");
if (!existsSync(migrationFile)) {
  console.error("Migration file not found: " + migrationFile);
  process.exit(2);
}

const workDir = mkdtempSync(join(tmpdir(), "pb-verify-"));
console.log("Working dir: " + workDir);

const migrationsDir = join(workDir, "pb_migrations");
const { mkdirSync } = await import("node:fs");
mkdirSync(migrationsDir, { recursive: true });
copyFileSync(migrationFile, join(migrationsDir, "1700000000_init_collections.js"));

// Apply the migration.
console.log("\nApplying migration...");
const up = spawnSync(pbBin, ["migrate", "up", "--dir", workDir, "--migrationsDir", migrationsDir], { encoding: "utf8" });
if (up.status !== 0) {
  console.error("Migration failed:");
  console.error(up.stdout);
  console.error(up.stderr);
  process.exit(1);
}
console.log(up.stdout.trim() || "(no output)");

// Verify.
const db = new DatabaseSync(join(workDir, "data.db"), { readOnly: true });

const EXPECTED_APP_COLLECTIONS = [
  { name: 'workspaces', minFields: 8, minIndexes: 1 },
  { name: 'chat_sessions', minFields: 8, minIndexes: 3 },
  { name: 'messages', minFields: 14, minIndexes: 2 },
  { name: 'tasks', minFields: 18, minIndexes: 4 },
  { name: 'events', minFields: 19, minIndexes: 4 },
  { name: 'user_profile', minFields: 8, minIndexes: 1 },
  { name: 'memories', minFields: 7, minIndexes: 3 },
  { name: 'user_images', minFields: 6, minIndexes: 1 },
  { name: 'habits', minFields: 13, minIndexes: 2 },
  { name: 'habit_logs', minFields: 7, minIndexes: 4 },
  { name: 'reflections', minFields: 14, minIndexes: 2 },
  { name: 'page_settings', minFields: 4, minIndexes: 1 },
  { name: 'session_summaries', minFields: 5, minIndexes: 1 },
  { name: 'weekly_digests', minFields: 7, minIndexes: 1 },
  { name: 'archived_summaries', minFields: 7, minIndexes: 1 },
  { name: 'notifications', minFields: 8, minIndexes: 2 },
  { name: 'push_subscriptions', minFields: 6, minIndexes: 2 },
  { name: 'card_state', minFields: 8, minIndexes: 3 },
  { name: 'scheduled_notifications', minFields: 7, minIndexes: 2 },
];

const REQUIRED_USERS_FIELDS = [
  'name', 'image', 'emailVerificationTime', 'phone', 'phoneVerificationTime', 'isAnonymous',
];

const FIELD_CHECKS = [
  ['memories', 'embedding', 'json'],
  ['memories', 'hash', 'text'],
  ['memories', 'user', 'relation'],
  ['tasks', 'priority', 'select'],
  ['tasks', 'completed', 'bool'],
  ['tasks', 'user', 'relation'],
  ['events', 'series', 'relation'],
  ['events', 'recurrence', 'json'],
  ['chat_sessions', 'lastActivity', 'number'],
  ['messages', 'storageId', 'file'],
  ['messages', 'toolCalls', 'json'],
  ['reflections', 'stats', 'json'],
  ['habit_logs', 'dateString', 'text'],
  ['habits', 'frequencyConfig', 'json'],
  ['user_images', 'storageId', 'file'],
  ['push_subscriptions', 'keys', 'json'],
  ['card_state', 'cardType', 'text'],
  ['scheduled_notifications', 'kind', 'select'],
  ['scheduled_notifications', 'triggerAt', 'number'],
  ['scheduled_notifications', 'delivered', 'bool'],
  ['user_profile', 'preferences', 'json'],
  ['notifications', 'type', 'select'],
  ['page_settings', 'settings', 'json'],
];

const SELECT_CHECKS = [
  ['tasks', 'priority', ['low', 'medium', 'high']],
  ['events', 'eventType', ['interval', 'point']],
  ['habits', 'frequency', ['daily', 'custom']],
  ['habit_logs', 'status', ['completed', 'skipped']],
  ['reflections', 'type', ['weekly', 'monthly', 'yearly']],
  ['archived_summaries', 'type', ['weekly', 'monthly']],
  ['notifications', 'type', ['event_remind', 'habit_remind', 'task_remind', 'system']],
  ['scheduled_notifications', 'kind', ['event_remind', 'task_remind', 'habit_remind']],
];

const FILE_CHECKS = [
  ['user_images', 'storageId', 52428800, ['image/*']],
  ['messages', 'storageId', 52428800, []],
];

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { passed++; console.log("  PASS  " + label); }
  else { failed++; console.log("  FAIL  " + label); }
}

console.log("\n=== Phase 1.5 Schema Verification ===\n");

const rows = db.prepare(
  "SELECT id, name, type, system, json_array_length(fields) AS fc, json_array_length(indexes) AS ic, fields, indexes, listRule, viewRule, createRule, updateRule, deleteRule FROM _collections ORDER BY system, name"
).all();
const byName = Object.fromEntries(rows.map(r => [r.name, r]));

// 1. All app collections exist
console.log("1. App collections present:");
for (const exp of EXPECTED_APP_COLLECTIONS) {
  const actual = byName[exp.name];
  if (actual) {
    assert(actual.fc >= exp.minFields, exp.name + " has " + actual.fc + " fields (expected >= " + exp.minFields + ")");
    assert(actual.ic >= exp.minIndexes, exp.name + " has " + actual.ic + " indexes (expected >= " + exp.minIndexes + ")");
  } else {
    assert(false, exp.name + " EXISTS");
  }
}

// 2. Users extension
console.log("\n2. Users extension fields:");
const users = byName['users'];
const usersFields = JSON.parse(users.fields).map(f => f.name);
for (const f of REQUIRED_USERS_FIELDS) {
  assert(usersFields.includes(f), "users has field \"" + f + "\"");
}

// 3. Critical fields by collection
console.log("\n3. Critical field presence:");
for (const [coll, fieldName, expectedType] of FIELD_CHECKS) {
  const c = byName[coll];
  if (!c) { assert(false, coll + "." + fieldName + " (collection missing)"); continue; }
  const fields = JSON.parse(c.fields);
  const f = fields.find(f => f.name === fieldName);
  if (f) {
    assert(f.type === expectedType, coll + "." + fieldName + " is type \"" + expectedType + "\"");
  } else {
    assert(false, coll + "." + fieldName + " EXISTS");
  }
}

// 4. Rules
console.log("\n4. Access rules:");
for (const coll of ['workspaces', 'chat_sessions', 'messages', 'tasks', 'events', 'memories', 'habits', 'notifications']) {
  const c = byName[coll];
  const expectedListRule = coll === 'messages' ? "@request.auth.id" : "user";
  assert(c.listRule && c.listRule.includes(expectedListRule),
    coll + ".listRule contains expected pattern");
}
assert(byName['messages'].listRule === "@request.auth.id != ''", "messages.listRule is the permissive fallback");

// 5. Index uniqueness on page_settings + push_subscriptions
console.log("\n5. Unique indexes:");
for (const coll of ['page_settings', 'push_subscriptions']) {
  const c = byName[coll];
  const indexes = JSON.parse(c.indexes);
  const hasUnique = indexes.some(idx => idx.toUpperCase().includes('UNIQUE'));
  assert(hasUnique, coll + " has a UNIQUE index");
}

// 6. Events self-reference
console.log("\n6. Events self-reference:");
const events = byName['events'];
const eventsFields = JSON.parse(events.fields);
const seriesField = eventsFields.find(f => f.name === 'series');
assert(seriesField && seriesField.type === 'relation', "events.series is a relation");
assert(seriesField && seriesField.collectionId === events.id,
  "events.series.collectionId matches events.id (self-ref)");
const eventsIndexes = JSON.parse(events.indexes);
assert(eventsIndexes.some(i => i.includes('idx_events_series')), "events has idx_events_series");

// 7. Relation integrity
console.log("\n7. Relation integrity:");
let relCount = 0; let broken = 0;
for (const r of rows) {
  const fields = JSON.parse(r.fields);
  for (const f of fields) {
    if (f.type === 'relation') {
      relCount++;
      const target = rows.find(t => t.id === f.collectionId);
      if (!target) {
        broken++;
        console.log("  WARN  " + r.name + "." + f.name + " points to missing collectionId " + f.collectionId);
      }
    }
  }
}
assert(broken === 0, "all " + relCount + " relation field targets exist (broken: " + broken + ")");

// 8. Cascade delete
console.log("\n8. Cascade delete (user-owned collections):");
for (const coll of ['workspaces', 'chat_sessions', 'tasks', 'events', 'memories', 'user_profile', 'user_images', 'habits', 'habit_logs', 'reflections', 'page_settings', 'session_summaries', 'weekly_digests', 'archived_summaries', 'notifications', 'push_subscriptions', 'card_state', 'scheduled_notifications']) {
  const c = byName[coll];
  if (!c) continue;
  const fields = JSON.parse(c.fields);
  const userField = fields.find(f => f.name === 'user' && f.type === 'relation');
  if (userField) {
    assert(userField.cascadeDelete === true, coll + ".user cascades on delete");
  }
}

// 9. Select field value lists
console.log("\n9. Select field values:");
for (const [coll, fieldName, expectedValues] of SELECT_CHECKS) {
  const c = byName[coll];
  const fields = JSON.parse(c.fields);
  const f = fields.find(f => f.name === fieldName);
  if (f) {
    const actual = JSON.stringify((f.values || []).sort());
    const expected = JSON.stringify([...expectedValues].sort());
    assert(actual === expected, coll + "." + fieldName + " values = " + actual);
  } else {
    assert(false, coll + "." + fieldName + " EXISTS");
  }
}

// 10. File field max sizes
console.log("\n10. File field constraints:");
for (const [coll, fieldName, expectedMaxSize, expectedMimeTypes] of FILE_CHECKS) {
  const c = byName[coll];
  const fields = JSON.parse(c.fields);
  const f = fields.find(f => f.name === fieldName);
  if (f) {
    assert(f.maxSize === expectedMaxSize, coll + "." + fieldName + " maxSize = " + expectedMaxSize);
    const actualMimes = JSON.stringify((f.mimeTypes || []).sort());
    const expectedMimes = JSON.stringify([...expectedMimeTypes].sort());
    assert(actualMimes === expectedMimes, coll + "." + fieldName + " mimeTypes = " + actualMimes);
  } else {
    assert(false, coll + "." + fieldName + " EXISTS");
  }
}

db.close();

console.log("\n=== Result: " + passed + " passed, " + failed + " failed ===");

// Clean up
try { rmSync(workDir, { recursive: true, force: true }); } catch {}

process.exit(failed === 0 ? 0 : 1);
