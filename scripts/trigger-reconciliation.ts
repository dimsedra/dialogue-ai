import dotenv from "dotenv";
import { createRequire } from "node:module";
import path from "node:path";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });
dotenv.config();

// Inject EventSource for PocketBase SDK
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;

import { reconcileFolio } from "../src/lib/folio/sync";
import { getPbAdmin } from "../src/lib/pb-server-admin";

let devFallbackPath = process.env.DEV_LOCAL_PATH;
if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
  devFallbackPath = devFallbackPath.slice(1, -1);
}

const folioRootPath = devFallbackPath || path.join(process.cwd(), "dialogue-folio");

async function run() {
  console.log("Starting legacy trunk reconciliation...");
  console.log("Folio path:", folioRootPath);

  try {
    const adminPb = await getPbAdmin();
    console.log("Authenticated with PocketBase admin.");
    await reconcileFolio(folioRootPath, adminPb);
    console.log("Reconciliation completed successfully.");
  } catch (err) {
    console.error("Reconciliation failed:", err);
  }
}

run();
