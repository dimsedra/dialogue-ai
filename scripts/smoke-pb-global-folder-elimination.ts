(process.env as any).NODE_ENV = "test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Inject EventSource for PocketBase SDK
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;

import PocketBase from "pocketbase";
import { reconcileFolio } from "../src/lib/folio/sync";

// Helpers
let failed = 0;
let passed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findFreePort() {
  return 29000 + Math.floor(Math.random() * 1000);
}

async function waitForPb(url: string, timeoutMs = 15000) {
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

// Locate PB bin
const PB_BIN = process.env.POCKETBASE_BIN || "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe";
if (!existsSync(PB_BIN)) {
  console.error(`smoke: POCKETBASE_BIN not found at ${PB_BIN}`);
  process.exit(2);
}

// Setup temp dirs
const tempDir = mkdtempSync(join(tmpdir(), "pb-global-folder-elim-"));
const dataDir = join(tempDir, "pb_data");
mkdirSync(dataDir, { recursive: true });

const tempFolio = join(tempDir, "folio");
mkdirSync(tempFolio, { recursive: true });

process.env.DEV_LOCAL_PATH = tempFolio;

// Copy migrations
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbMigrationsDir = join(projectRoot, "pb_migrations");
const migrationsDir = join(dataDir, "pb_migrations");
mkdirSync(migrationsDir, { recursive: true });
const migrationFiles = readdirSync(pbMigrationsDir);
for (const file of migrationFiles) {
  copyFileSync(join(pbMigrationsDir, file), join(migrationsDir, file));
}

const adminEmail = `admin-${Date.now()}@smoke.local`;
const adminPassword = "smoke-admin-password-12345";

async function main() {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_PB_URL = url;

  console.log("=== End-to-End Global Folder Elimination & Orphan Migration Smoke Test ===");
  console.log(`  tempDir:    ${tempDir}`);
  console.log(`  tempFolio:  ${tempFolio}`);
  console.log(`  port:       ${port}`);

  let pbProcess: any = null;
  const cleanup = () => {
    try { if (pbProcess) pbProcess.kill("SIGTERM"); } catch {}
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("uncaughtException", (e) => { console.error("uncaught:", e); cleanup(); process.exit(1); });

  // Apply migration
  console.log("\nApplying migrations...");
  const migrate = spawnSync(
    PB_BIN,
    ["migrate", "up", "--dir", dataDir, "--migrationsDir", migrationsDir],
    { encoding: "utf8" }
  );
  if (migrate.status !== 0) {
    console.error("smoke: migration failed:", migrate.stderr);
    process.exit(1);
  }

  // Bootstrap superuser
  console.log("Bootstrapping superuser...");
  const superuser = spawnSync(
    PB_BIN,
    ["superuser", "upsert", adminEmail, adminPassword, "--dir", dataDir],
    { encoding: "utf8" }
  );
  if (superuser.status !== 0) {
    console.error("smoke: superuser upsert failed:", superuser.stderr);
    process.exit(1);
  }

  // Start PB server
  pbProcess = spawn(PB_BIN, ["serve", "--http", `127.0.0.1:${port}`, "--dir", dataDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ready = await waitForPb(url);
  if (!ready) {
    console.error("smoke: PB server did not start");
    process.exit(1);
  }
  console.log("  PB server ready.");

  try {
    const adminPb = new PocketBase(url);
    adminPb.autoCancellation(false);
    await adminPb.admins.authWithPassword(adminEmail, adminPassword);

    // Create a regular user
    const userEmail = `user-${Date.now()}@smoke.local`;
    const userPassword = "smoke-user-password-12345";
    const userRecord = await adminPb.collection("users").create({
      email: userEmail,
      password: userPassword,
      passwordConfirm: userPassword,
      verified: true,
      name: "Dialogue User",
    });
    const userId = userRecord.id;
    console.log(`  Created user: ${userEmail} (ID: ${userId})`);

    const userPb = new PocketBase(url);
    userPb.autoCancellation(false);
    await userPb.collection("users").authWithPassword(userEmail, userPassword);

    // Pass 1: Run reconcileFolio once to create default Personal workspace
    console.log("\nRunning first-pass reconcileFolio to initialize workspaces...");
    await reconcileFolio(tempFolio, userPb);

    const workspacesInDb = await adminPb.collection("workspaces").getFullList({
      filter: `user = "${userId}"`,
    });
    assert(workspacesInDb.length === 1, "Personal workspace was auto-created");
    const personalWsId = workspacesInDb[0].id;
    console.log(`  Personal Workspace ID: ${personalWsId}`);

    const personalWsFolder = `personal-${personalWsId}`;
    const personalWsPath = join(tempFolio, "workspaces", personalWsFolder);

    // 2. Pre-create orphan records in PocketBase (without workspace)
    console.log("\nCreating orphan records in DB...");
    const orphanTask = await adminPb.collection("tasks").create({
      user: userId,
      text: "Orphan Task Text",
      createdAt: Date.now(),
      completed: false,
      workspace: "", // no workspace
    });
    const orphanEvent = await adminPb.collection("events").create({
      user: userId,
      title: "Orphan Event",
      startTime: Date.now(),
      createdAt: Date.now(),
      eventType: "point",
      workspace: "", // no workspace
    });
    const orphanSession = await adminPb.collection("chat_sessions").create({
      user: userId,
      title: "Orphan Session",
      createdAt: Date.now(),
      lastActivity: Date.now(),
      workspace: "", // no workspace
    });

    // 3. Write task/event files inside the Personal workspace so they don't get pruned
    console.log("Writing corresponding files to Personal workspace on disk...");
    const wsTasksDir = join(personalWsPath, "tasks");
    const wsEventsDir = join(personalWsPath, "events");
    mkdirSync(wsTasksDir, { recursive: true });
    mkdirSync(wsEventsDir, { recursive: true });

    writeFileSync(join(wsTasksDir, `task-${orphanTask.id}.md`), `---\nid: ${orphanTask.id}\ntext: Orphan Task Text\ncompleted: false\n---\n# Orphan Task`, "utf8");
    writeFileSync(join(wsEventsDir, `event-${orphanEvent.id}.md`), `---\nid: ${orphanEvent.id}\ntitle: Orphan Event\nstartTime: ${new Date(orphanEvent.startTime).toISOString()}\neventType: point\n---\n# Orphan Event`, "utf8");

    // 4. Pre-create legacy global folders and files on disk (which should be ignored)
    console.log("Creating legacy global folders and files on disk...");
    const globalTasksDir = join(tempFolio, "tasks");
    const globalEventsDir = join(tempFolio, "events");
    mkdirSync(globalTasksDir, { recursive: true });
    mkdirSync(globalEventsDir, { recursive: true });

    writeFileSync(join(globalTasksDir, "task-legacy1.md"), "---\nid: legacy1\ntext: Legacy Task\n---\n# Legacy Task", "utf8");
    writeFileSync(join(globalEventsDir, "event-legacy2.md"), "---\nid: legacy2\ntitle: Legacy Event\n---\n# Legacy Event", "utf8");

    // 5. Trigger second reconciliation to run the migration logic
    console.log("\nTriggering second reconcileFolio for migration verification...");
    await reconcileFolio(tempFolio, userPb);

    // 6. Verify orphan records are migrated
    console.log("\nVerifying DB orphan migrations...");
    const updatedTask = await adminPb.collection("tasks").getOne(orphanTask.id);
    assert(updatedTask.workspace === personalWsId, "Orphan task was migrated to Personal workspace");

    const updatedEvent = await adminPb.collection("events").getOne(orphanEvent.id);
    assert(updatedEvent.workspace === personalWsId, "Orphan event was migrated to Personal workspace");

    const updatedSession = await adminPb.collection("chat_sessions").getOne(orphanSession.id);
    assert(updatedSession.workspace === personalWsId, "Orphan session was migrated to Personal workspace");

    // 7. Verify legacy global files were NOT synced
    console.log("\nVerifying legacy global folder files were ignored...");
    try {
      await adminPb.collection("tasks").getOne("legacy1");
      assert(false, "Legacy global task should NOT exist in DB");
    } catch (err: any) {
      assert(err?.status === 404, "Legacy global task was correctly ignored (not found in DB)");
    }

    try {
      await adminPb.collection("events").getOne("legacy2");
      assert(false, "Legacy global event should NOT exist in DB");
    } catch (err: any) {
      assert(err?.status === 404, "Legacy global event was correctly ignored (not found in DB)");
    }

  } catch (err: any) {
    console.error("smoke: test failed with error:", err);
    failed++;
  } finally {
    cleanup();
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
