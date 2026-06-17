import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { DatabaseSync } from "node:sqlite";

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config();

let devFallbackPath = process.env.DEV_LOCAL_PATH;
if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
  devFallbackPath = devFallbackPath.slice(1, -1);
}

const folioRootPath = devFallbackPath || path.join(process.cwd(), "dialogue-folio");
const targetAbsPath = path.join(folioRootPath, "system", "memories.md");
const dbPath = path.join(process.cwd(), "pb_data", "data.db");

console.log("Folio root path:", folioRootPath);
console.log("Database path:", dbPath);
console.log("Target memories path:", targetAbsPath);

// Zero-dependency markdown parser/serializer
function parseMarkdownFile(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { metadata: {}, body: normalized };
  }
  const lines = normalized.split("\n");
  let bodyStartIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      bodyStartIndex = i + 1;
      break;
    }
  }
  if (bodyStartIndex === -1) {
    return { metadata: {}, body: normalized };
  }
  const body = lines.slice(bodyStartIndex).join("\n");
  return { metadata: {}, body };
}

function serializeMarkdownFile(metadata, body) {
  const trimmedBody = body.replace(/^\n+/, "");
  return "---\n---\n" + trimmedBody;
}

try {
  const db = new DatabaseSync(dbPath);
  
  // 1. Fetch legacy memories (source_type = '' or NULL)
  // Skip Task/Event/HabitLog source memories
  const query = db.prepare(`
    SELECT id, text FROM memories 
    WHERE source_type = '' OR source_type IS NULL
  `);
  const legacyMemories = query.all();
  
  console.log(`Found ${legacyMemories.length} legacy memories in SQLite.`);
  
  if (legacyMemories.length === 0) {
    console.log("No legacy memories to migrate.");
    process.exit(0);
  }

  // 2. Prepare system directory
  fs.mkdirSync(path.dirname(targetAbsPath), { recursive: true });

  // 3. Read existing memories file if it exists
  let existingContent = "";
  if (fs.existsSync(targetAbsPath)) {
    existingContent = fs.readFileSync(targetAbsPath, "utf8");
  }
  
  const { body } = parseMarkdownFile(existingContent);
  const bodyLines = body.split("\n").map(l => l.trimEnd());
  
  const existingBullets = new Set();
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.slice(2).trim();
      if (bulletText) {
        existingBullets.add(bulletText);
      }
    }
  }

  // 4. Append new bullets
  const updatedLines = [...bodyLines];
  let appendCount = 0;
  
  for (const mem of legacyMemories) {
    const text = mem.text.trim();
    if (!existingBullets.has(text)) {
      // If the last line is not empty, add a newline first
      if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== "") {
        updatedLines.push("");
      }
      updatedLines.push(`- ${text}`);
      existingBullets.add(text);
      appendCount++;
    }
  }

  // Clean trailing/leading empty lines slightly
  const updatedBody = updatedLines.join("\n");
  const serialized = serializeMarkdownFile({}, updatedBody);

  // 5. Write back to file
  fs.writeFileSync(targetAbsPath, serialized, "utf8");
  console.log(`Added ${appendCount} new bullets to ${targetAbsPath}`);

  // 6. Update SQLite memory records
  const updateStmt = db.prepare(`
    UPDATE memories 
    SET source_type = 'File', source_id = 'system/memories.md' 
    WHERE id = ?
  `);

  db.prepare("BEGIN").run();
  try {
    for (const mem of legacyMemories) {
      updateStmt.run(mem.id);
    }
    db.prepare("COMMIT").run();
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }

  console.log(`Database records updated: set source_type='File' and source_id='system/memories.md' for ${legacyMemories.length} memories.`);
  console.log("Migration complete!");

} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
