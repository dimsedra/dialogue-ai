(process.env as any).NODE_ENV = "test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from "node:fs";
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

const localPbPath = join(process.cwd(), "pocketbase", process.platform === "win32" ? "pocketbase.exe" : "pocketbase");
const PB_BIN = process.env.POCKETBASE_BIN || (existsSync(localPbPath) ? localPbPath : "C:\\Users\\user\\tools\\pocketbase\\pocketbase.exe");
if (!existsSync(PB_BIN)) {
  console.error(`smoke: POCKETBASE_BIN not found at ${PB_BIN}. Please set POCKETBASE_BIN env var or place the binary in the local pocketbase folder.`);
  process.exit(2);
}

// Setup temp dirs
const tempDir = mkdtempSync(join(tmpdir(), "pb-ws-init-smoke-"));
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

  console.log("=== End-to-End Workspace Auto-creation Smoke Test ===");
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
      name: "Dialogue Explorer",
    });
    const userId = userRecord.id;
    console.log(`  Created user: ${userEmail} (ID: ${userId})`);

    const userPb = new PocketBase(url);
    userPb.autoCancellation(false);
    await userPb.collection("users").authWithPassword(userEmail, userPassword);

    console.log("\n--- Scenario: Running reconcileFolio on empty directory ---");
    // Trigger reconciliation
    await reconcileFolio(tempFolio, userPb);

    // 1. Verify disk workspace structure
    const workspacesDir = join(tempFolio, "workspaces");
    assert(existsSync(workspacesDir), "workspaces directory was created on disk");

    const folders = readdirSync(workspacesDir);
    assert(folders.length === 1, `Exactly one workspace folder was created: ${folders[0]}`);

    const personalFolder = join(workspacesDir, folders[0]);
    assert(folders[0].startsWith("personal-"), "Default workspace folder name starts with 'personal-'");

    const yamlPath = join(personalFolder, ".workspace.yaml");
    assert(existsSync(yamlPath), ".workspace.yaml config file was created");
    const yamlContent = readFileSync(yamlPath, "utf8");
    assert(yamlContent.includes("name: Personal"), ".workspace.yaml contains 'name: Personal'");

    const contextPath = join(personalFolder, "CONTEXT.md");
    assert(existsSync(contextPath), "CONTEXT.md context file was created");
    const contextContent = readFileSync(contextPath, "utf8");
    assert(contextContent.includes("# Personal"), "CONTEXT.md header is '# Personal'");
    assert(contextContent.includes("- User prefers Indonesian mixed with English"), "CONTEXT.md contains preferred language user notes");

    // 2. Verify PocketBase DB workspace cache record
    const workspacesInDb = await adminPb.collection("workspaces").getFullList({
      filter: `user = "${userId}"`,
    });
    assert(workspacesInDb.length === 1, `Exactly one workspace record exists in PocketBase: ${workspacesInDb[0].name}`);
    const record = workspacesInDb[0];
    assert(record.name === "Personal", "DB workspace record name is 'Personal'");
    assert(record.icon === "Briefcase", "DB workspace record icon is 'Briefcase'");
    assert(record.color === "#d4a373", "DB workspace record color is '#d4a373'");

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
