(process.env as any).NODE_ENV = "test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Inject EventSource for PocketBase SDK
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;

import PocketBase from "pocketbase";
import { reconcileFolio, syncFolioFileToDb } from "../src/lib/folio/sync";
import { updateProfile } from "../src/lib/pb-actions/updateProfile";

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
const tempDir = mkdtempSync(join(tmpdir(), "pb-sync-smoke-"));
const dataDir = join(tempDir, "pb_data");
mkdirSync(dataDir, { recursive: true });

const tempFolio = join(tempDir, "folio");
mkdirSync(tempFolio, { recursive: true });

// Set environment override so actions and sync engine use our temporary folio root
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

  console.log("=== End-to-End Profile Sync & Stress Test ===");
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

  async function runTests() {
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
        name: "Original Name",
      });
      const userId = userRecord.id;
      console.log(`  Created user: ${userEmail} (ID: ${userId})`);

      const userPb = new PocketBase(url);
      userPb.autoCancellation(false);
      await userPb.collection("users").authWithPassword(userEmail, userPassword);

      const token = userPb.authStore.token;

      // --- SCENARIO 1: Startup / Autogen Check ---
      console.log("\n--- Scenario 1: Startup / Autogen ---");
      await reconcileFolio(tempFolio, adminPb);

      const corePath = join(tempFolio, "system", "CORE.md");
      const userPath = join(tempFolio, "system", "USER.md");

      assert(existsSync(corePath), "system/CORE.md was generated");
      assert(existsSync(userPath), "system/USER.md was generated");

      const initialUserContent = readFileSync(userPath, "utf8");
      assert(initialUserContent.includes("Name: Original Name"), "USER.md contains pre-populated user name");

      // --- SCENARIO 2: Disk-to-DB Sync ---
      console.log("\n--- Scenario 2: Disk-to-DB Sync ---");
      const updatedUserContent = `# User Profile\n\n## Profile\n- Name: Gourmet Guru\n- Bio/Facts: Loves cooking pasta.\n\n## Observed Patterns\n- Loves garlic\n`;
      writeFileSync(userPath, updatedUserContent, "utf8");

      await syncFolioFileToDb(userPath, userPb, tempFolio);

      // Retrieve DB updates
      const profile = await adminPb.collection("user_profile").getFirstListItem(`user = "${userId}"`);
      assert(profile.name === "Gourmet Guru", "DB user_profile name updated to 'Gourmet Guru'");
      assert(profile.bio === "Loves cooking pasta.", "DB user_profile bio updated to 'Loves cooking pasta.'");

      const updatedUserRecord = await adminPb.collection("users").getOne(userId);
      assert(updatedUserRecord.name === "Gourmet Guru", "DB users record name updated to 'Gourmet Guru'");

      // --- SCENARIO 3: DB-to-Disk Sync (Server Action) ---
      console.log("\n--- Scenario 3: DB-to-Disk Sync via Server Action ---");
      const ctx = { token, user: { id: userId, email: userEmail, collectionName: "users" } };
      
      // Call server action
      await updateProfile({
        name: "Iron Chef",
        bio: "Master of sushi and ramen.",
        preferences: { theme: "dark" }
      }, ctx);

      // Verify DB
      const finalProfile = await adminPb.collection("user_profile").getFirstListItem(`user = "${userId}"`);
      assert(finalProfile.name === "Iron Chef", "DB user_profile updated via server action");
      assert(finalProfile.bio === "Master of sushi and ramen.", "DB user_profile bio updated via server action");
      assert(finalProfile.preferences.theme === "dark", "Preferences successfully updated/merged");

      // Verify Disk File (USER.md)
      const finalFileContent = readFileSync(userPath, "utf8");
      assert(finalFileContent.includes("Name: Iron Chef"), "USER.md updated on disk");
      assert(finalFileContent.includes("Bio/Facts: Master of sushi and ramen."), "USER.md bio updated on disk");
      assert(finalFileContent.includes("## Observed Patterns"), "Preserved other sections (e.g. Observed Patterns)");
      assert(finalFileContent.includes("- Loves garlic"), "Preserved original list values inside preserved sections");

      // --- SCENARIO 4: Stress / Concurrency Test ---
      console.log("\n--- Scenario 4: Concurrency / Stress Test ---");
      console.log("Executing 15 rapid concurrent updates via server action and direct disk writes...");

      const promises = [];
      // Mix of server actions and direct file sync calls to stress-test locks and debounce behavior
      for (let i = 1; i <= 8; i++) {
        promises.push((async () => {
          await sleep(Math.random() * 50);
          await updateProfile({
            name: `Chef ${i}`,
            bio: `Specialty number ${i}.`,
          }, ctx);
        })());

        promises.push((async () => {
          await sleep(Math.random() * 50);
          const stressContent = `# User Profile\n\n## Profile\n- Name: Disk Chef ${i}\n- Bio/Facts: Disk bio ${i}.\n\n## Observed Patterns\n- Loves garlic\n`;
          writeFileSync(userPath, stressContent, "utf8");
          await syncFolioFileToDb(userPath, userPb, tempFolio);
        })());
      }

      await Promise.all(promises);
      console.log("All concurrent operations completed. Waiting 100ms for I/O to settle...");
      await sleep(100);

      // Verify custom section was preserved during stress
      const stressDiskContent = readFileSync(userPath, "utf8");
      assert(stressDiskContent.includes("## Observed Patterns"), "Preserved custom section under high concurrency stress");

      // Settle and Converge: run a final sequential update to verify recovery/convergence
      console.log("Running final sequential update to verify convergence...");
      await updateProfile({
        name: "Chef Settle",
        bio: "Settled bio.",
      }, ctx);

      // Retrieve settled values
      const settledDbProfile = await adminPb.collection("user_profile").getFirstListItem(`user = "${userId}"`);
      const settledDiskContent = readFileSync(userPath, "utf8");

      assert(settledDbProfile.name === "Chef Settle", "DB profile name resolved to 'Chef Settle'");
      assert(settledDbProfile.bio === "Settled bio.", "DB profile bio resolved to 'Settled bio.'");
      assert(settledDiskContent.includes("Name: Chef Settle"), "USER.md on disk converged to 'Chef Settle'");
      assert(settledDiskContent.includes("Bio/Facts: Settled bio."), "USER.md bio on disk converged to 'Settled bio.'");

      console.log(`\n=== Smoke & Stress Test Results: ${passed} passed, ${failed} failed ===`);
    } catch (err: any) {
      console.error("Smoke/Stress test failed with error:", err.message || err);
      failed++;
    }
  }

  await runTests();
  cleanup();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});
