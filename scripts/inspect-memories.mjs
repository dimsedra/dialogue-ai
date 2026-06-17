import PocketBase from "pocketbase";
import fs from "fs";
import path from "path";

// Load env
const envPath = path.join(process.cwd(), ".env.local");
let pbUrl = "http://127.0.0.1:8090";
let email = "admin@dialogue.local";
let password = "admin123456";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/(^["']|["']$)/g, "");
    if (key === "NEXT_PUBLIC_PB_URL") pbUrl = val;
    if (key === "PB_ADMIN_EMAIL") email = val;
    if (key === "PB_ADMIN_PASSWORD") password = val;
  }
}

async function run() {
  const pb = new PocketBase(pbUrl);
  try {
    await pb.admins.authWithPassword(email, password);
    console.log("Authenticated successfully.");

    const memories = await pb.collection("memories").getFullList();
    console.log(`Found ${memories.length} memories in DB:`);
    for (const mem of memories) {
      console.log(JSON.stringify({
        id: mem.id,
        text: mem.text,
        source_type: mem.source_type,
        source_id: mem.source_id,
        hash: mem.hash,
        user: mem.user,
      }, null, 2));
    }
  } catch (err) {
    console.error("Error inspecting memories:", err);
  }
}

run();
