import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = path.join(process.cwd(), "pb_data", "data.db");
console.log("Reading DB from:", dbPath);

const db = new DatabaseSync(dbPath);

try {
  // Query memories
  const query = db.prepare("SELECT id, text, source_type, source_id, hash, user FROM memories");
  const memories = query.all();
  console.log(`Found ${memories.length} memories in SQLite:`);
  for (const mem of memories) {
    console.log(JSON.stringify(mem, null, 2));
  }
} catch (err) {
  console.error("Error reading memories from SQLite:", err);
}
