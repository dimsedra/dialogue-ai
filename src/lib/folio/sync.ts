import { join, relative, basename, dirname } from 'path';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { AsyncLocalStorage } from 'async_hooks';
import PocketBase from 'pocketbase';
import { parseMarkdownFile } from './parser';
import { ingestTaskNotes, ingestEventNotes, deleteSourceMemories } from '../graph/ingest';
import crypto from 'crypto';
import { getLocalEmbedding } from '../graph/embedding';

export interface FolioContext {
  folioRootPath: string;
  activeWorkspace: string;
  basePath: string;
}

export const folioRequestContext = new AsyncLocalStorage<FolioContext>();

export function getFolioContext(): FolioContext {
  const ctx = folioRequestContext.getStore();
  if (!ctx) {
    throw new Error('getFolioContext() must be called within folioRequestContext.run()');
  }
  return ctx;
}


export interface EntityInfo {
  id: string;
  collectionName: 'tasks' | 'events' | 'memories' | 'daily_logs' | 'workspaces';
  workspaceId: string | null;
}

/**
 * Extracts the 15-character PocketBase record ID from a task or event filename.
 * Supports:
 * - [slug]-[15-char-id].md (e.g. fix-bug-evt123456789012.md)
 * - task-[15-char-id].md (legacy)
 * - event-[15-char-id].md (legacy)
 */
export function extractIdFromFilename(filename: string): string {
  const nameWithoutExt = filename.endsWith('.md') ? filename.slice(0, -3) : filename;

  // 1. Handle slug-[15-char-id]
  const parts = nameWithoutExt.split('-');
  const lastPart = parts[parts.length - 1];
  if (lastPart && lastPart.length === 15) {
    return lastPart;
  }

  // 2. Handle legacy task-[15-char-id] or event-[15-char-id]
  if (nameWithoutExt.startsWith('task-') && nameWithoutExt.length === 20) {
    return nameWithoutExt.slice(5);
  }
  if (nameWithoutExt.startsWith('event-') && nameWithoutExt.length === 21) {
    return nameWithoutExt.slice(6);
  }

  // 3. Fallback to last 15 chars
  return nameWithoutExt.slice(-15);
}

/**
 * Resolves collection, entity ID, and workspace ID from a given file path.
 */
export function resolveEntityFromPath(filePath: string, folioRootPath: string): EntityInfo | null {
  const normRoot = folioRootPath.replace(/\\/g, '/');
  const normFile = filePath.replace(/\\/g, '/');
  
  if (!normFile.startsWith(normRoot)) {
    return null;
  }
  
  const relPath = relative(normRoot, normFile).replace(/\\/g, '/');
  const parts = relPath.split('/');
  
  // Scopes:
  // 1. Global: tasks/task-[id].md -> parts = ['tasks', 'task-[id].md']
  // 2. Workspace: [workspaceId]/tasks/task-[id].md -> parts = ['[workspaceId]', 'tasks', 'task-[id].md']
  
  let collectionName: 'tasks' | 'events' | 'memories' | null = null;
  let workspaceId: string | null = null;
  let filename = '';
  
  if (parts.length === 2) {
    if (parts[0] === 'tasks' || parts[0] === 'events') {
      collectionName = parts[0] as 'tasks' | 'events';
      filename = parts[1];
    } else if (parts[0] === 'daily-logs' && parts[1].endsWith('.md')) {
      const id = parts[1].slice(0, -3); // remove .md
      return { id, collectionName: 'daily_logs', workspaceId: null };
    } else if (parts[0] === 'system' && parts[1] === 'memories.md') {
      return { id: 'global', collectionName: 'memories', workspaceId: null };
    } else if (parts[1] === 'workspace_memories.md') {
      // Old style: [workspaceId]/workspace_memories.md
      return { id: parts[0], collectionName: 'memories', workspaceId: parts[0] };
    } else if (parts[1] === '.workspace.yaml') {
      // Old style workspace config
      return { id: parts[0], collectionName: 'workspaces', workspaceId: parts[0] };
    }
  } else if (parts.length === 3) {
    if (parts[0] === 'workspaces' && parts[2] === 'workspace_memories.md') {
      // New style: workspaces/[name-id]/workspace_memories.md
      const folderName = parts[1];
      const dashIndex = folderName.lastIndexOf('-');
      const parsedId = dashIndex !== -1 ? folderName.slice(dashIndex + 1) : folderName;
      return { id: parsedId, collectionName: 'memories', workspaceId: parsedId };
    } else if (parts[0] === 'workspaces' && parts[2] === '.workspace.yaml') {
      // New style: workspaces/[name-id]/.workspace.yaml
      const folderName = parts[1];
      const dashIndex = folderName.lastIndexOf('-');
      const parsedId = dashIndex !== -1 ? folderName.slice(dashIndex + 1) : folderName;
      return { id: parsedId, collectionName: 'workspaces', workspaceId: parsedId };
    } else if (parts[1] === 'tasks' || parts[1] === 'events') {
      // Old style: [workspaceId]/[tasks|events]/task-[id].md
      workspaceId = parts[0];
      collectionName = parts[1] as 'tasks' | 'events';
      filename = parts[2];
    }
  } else if (parts.length === 4) {
    if (parts[0] === 'workspaces' && (parts[2] === 'tasks' || parts[2] === 'events')) {
      // New style: workspaces/[name-id]/[tasks|events]/task-[id].md
      const folderName = parts[1];
      const dashIndex = folderName.lastIndexOf('-');
      workspaceId = dashIndex !== -1 ? folderName.slice(dashIndex + 1) : folderName;
      collectionName = parts[2] as 'tasks' | 'events';
      filename = parts[3];
    }
  }
  
  if (!collectionName || !filename.endsWith('.md')) {
    return null;
  }
  
  const id = extractIdFromFilename(filename);
  
  return { id, collectionName, workspaceId };
}

/**
 * Syncs a single markdown file from the folio to the PocketBase cache database.
 * Prevents redundant writes/embeddings by comparing values before writing.
 */
export async function syncFolioFileToDb(
  filePath: string,
  pb: PocketBase,
  folioRootPath: string
): Promise<void> {
  const info = resolveEntityFromPath(filePath, folioRootPath);
  if (!info) return;

  const { id, collectionName, workspaceId } = info;
  if (!existsSync(filePath)) {
    return; // File doesn't exist, let reconciliation handle deletions
  }

  const fileContent = readFileSync(filePath, 'utf8');
  const { metadata, body } = parseMarkdownFile(fileContent);

  // Resolve user ID
  let userId = pb.authStore.record?.id;
  if (!userId) {
    const users = await pb.collection('users').getFullList({ limit: 1 });
    if (users.length > 0) {
      userId = users[0].id;
    }
  }
  if (!userId) {
    console.warn('[Sync Engine] No active user found for file sync:', filePath);
    return;
  }

  // Fetch existing DB record to check for changes. Only treat 404 (Not Found) as non-existent.
  // Rethrow transient or connection errors (status 0, 500, etc.) to prevent false-creation 400 errors.
  let existingRecord: any = null;
  try {
    existingRecord = await pb.collection(collectionName).getOne(id);
  } catch (err: any) {
    if (err?.status !== 404) {
      console.error(`[Sync Engine] Error checking existence for ${id} in ${collectionName}:`, err);
      throw err;
    }
  }

  // Parse dates properly
  const parseDateToMs = (val: any): number | null => {
    if (!val) return null;
    const time = new Date(val).getTime();
    return isNaN(time) ? null : time;
  };

  const getLocalDateStr = (val: any): string | null => {
    if (!val) return null;
    try {
      return new Date(val).toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  if (collectionName === 'tasks') {
    const completed = metadata.completed === true || metadata.status === 'completed';
    const dueDate = parseDateToMs(metadata.dueDate);
    const dueDateStr = getLocalDateStr(metadata.dueDate);
    const completedAt = parseDateToMs(metadata.completedAt);
    const createdAt = parseDateToMs(metadata.createdAt) || Date.now();
    const priority = metadata.priority || 'medium';
    const category = metadata.category || '';
    const progress = typeof metadata.progress === 'number' ? metadata.progress : (completed ? 100 : 0);
    const statusHook = metadata.statusHook || '';
    const reminderOffset = typeof metadata.reminderOffset === 'number' ? metadata.reminderOffset : null;

    const data = {
      user: userId,
      text: metadata.title || metadata.text || id,
      workspace: workspaceId || null,
      completed,
      dueDate,
      dueDateStr,
      priority,
      category,
      notes: body.trim(),
      progress,
      statusHook,
      reminderOffset,
      createdAt,
      completedAt,
    };

    // Prevent circular writes & save processing if identical
    if (existingRecord) {
      const isIdentical =
        existingRecord.text === data.text &&
        existingRecord.workspace === data.workspace &&
        existingRecord.completed === data.completed &&
        existingRecord.dueDate === data.dueDate &&
        existingRecord.dueDateStr === data.dueDateStr &&
        existingRecord.priority === data.priority &&
        existingRecord.category === data.category &&
        existingRecord.notes === data.notes &&
        existingRecord.progress === data.progress &&
        existingRecord.statusHook === data.statusHook &&
        existingRecord.reminderOffset === data.reminderOffset &&
        existingRecord.completedAt === data.completedAt;

      if (isIdentical) {
        return; // Skip update
      }

      await pb.collection('tasks').update(id, data);
    } else {
      await pb.collection('tasks').create({ id, ...data });
    }

    // Run RAG ingestion
    await ingestTaskNotes(pb, id, body);
  } else if (collectionName === 'events') {
    const startTime = parseDateToMs(metadata.startTime);
    if (!startTime) {
      console.warn('[Sync Engine] Event lacks valid startTime, skipping:', filePath);
      return;
    }

    const endTime = parseDateToMs(metadata.endTime);
    const createdAt = parseDateToMs(metadata.createdAt) || Date.now();
    const eventType = metadata.eventType || 'point';
    const location = metadata.location || '';
    const outcome = metadata.outcome || '';
    const statusHook = metadata.statusHook || '';
    const cancelled = metadata.cancelled === true;
    const reminderOffset = typeof metadata.reminderOffset === 'number' ? metadata.reminderOffset : null;
    const recurrence = metadata.recurrence || null;
    const resources = metadata.resources || null;

    const data = {
      user: userId,
      title: metadata.title || id,
      description: metadata.description || '',
      startTime,
      endTime,
      eventType,
      location,
      notes: body.trim(),
      outcome,
      statusHook,
      cancelled,
      workspace: workspaceId || null,
      recurrence,
      createdAt,
      reminderOffset,
      resources,
      series: metadata.series || null,
    };

    if (existingRecord) {
      const isIdentical =
        existingRecord.title === data.title &&
        existingRecord.description === data.description &&
        existingRecord.startTime === data.startTime &&
        existingRecord.endTime === data.endTime &&
        existingRecord.eventType === data.eventType &&
        existingRecord.location === data.location &&
        existingRecord.notes === data.notes &&
        existingRecord.outcome === data.outcome &&
        existingRecord.statusHook === data.statusHook &&
        existingRecord.cancelled === data.cancelled &&
        existingRecord.workspace === data.workspace &&
        JSON.stringify(existingRecord.recurrence) === JSON.stringify(data.recurrence) &&
        existingRecord.reminderOffset === data.reminderOffset &&
        JSON.stringify(existingRecord.resources) === JSON.stringify(data.resources) &&
        existingRecord.series === data.series;

      if (isIdentical) {
        return;
      }

      await pb.collection('events').update(id, data);
    } else {
      await pb.collection('events').create({ id, ...data });
    }

    // Run RAG ingestion for event
    await ingestEventNotes(pb, id, body, outcome);
  } else if (collectionName === 'memories') {
    await syncMemoriesFileToDb(filePath, pb, folioRootPath);
  } else if (collectionName === 'daily_logs') {
    await syncDailyLogFileToDb(filePath, pb, id);
  } else if (collectionName === 'workspaces') {
    await syncWorkspaceFileToDb(filePath, pb, id);
  }
}

export async function syncWorkspaceFileToDb(
  filePath: string,
  pb: PocketBase,
  id: string
): Promise<void> {
  if (!existsSync(filePath)) return;

  const { parseWorkspaceYaml } = await import('./parser');
  const content = readFileSync(filePath, 'utf8');
  const metadata = parseWorkspaceYaml(content);

  // Resolve user ID
  let userId = pb.authStore.record?.id;
  if (!userId) {
    const users = await pb.collection('users').getFullList({ limit: 1 });
    if (users.length > 0) {
      userId = users[0].id;
    }
  }
  if (!userId) {
    console.warn('[Sync Engine] No active user found for workspace sync:', filePath);
    return;
  }

  const data = {
    user: userId,
    name: metadata.name || id,
    icon: metadata.icon || 'Briefcase',
    color: metadata.color || '#d4a373',
    context: metadata.context || '',
    agentName: metadata.agentName || '',
    defaultAgentPersona: metadata.defaultAgentPersona || null,
    createdAt: metadata.createdAt || Date.now(),
    archived: metadata.archived === true,
  };

  let existingRecord;
  try {
    existingRecord = await pb.collection('workspaces').getOne(id);
  } catch (err: any) {
    if (err?.status !== 404) {
      throw err;
    }
  }

  if (existingRecord) {
    const isIdentical =
      existingRecord.name === data.name &&
      existingRecord.icon === data.icon &&
      existingRecord.color === data.color &&
      existingRecord.context === data.context &&
      existingRecord.agentName === data.agentName &&
      existingRecord.defaultAgentPersona === data.defaultAgentPersona &&
      existingRecord.archived === data.archived;

    if (isIdentical) {
      return;
    }

    await pb.collection('workspaces').update(id, data);
  } else {
    await pb.collection('workspaces').create({ id, ...data });
  }
}

/**
 * Syncs memories Markdown files to the PocketBase memories collection,
 * extracting bullet point chunks, embedding them, and pruning deleted ones.
 */
export async function syncMemoriesFileToDb(
  filePath: string,
  pb: PocketBase,
  folioRootPath: string
): Promise<void> {
  const info = resolveEntityFromPath(filePath, folioRootPath);
  if (!info || info.collectionName !== 'memories') return;

  if (!existsSync(filePath)) {
    return;
  }

  // Resolve user ID
  let userId = pb.authStore.record?.id;
  if (!userId) {
    const users = await pb.collection('users').getFullList({ limit: 1 });
    if (users.length > 0) {
      userId = users[0].id;
    }
  }
  if (!userId) {
    console.warn('[Sync Engine] No active user found for memories file sync:', filePath);
    return;
  }

  // Read file and parse bullet points
  const content = readFileSync(filePath, 'utf8');
  const { body } = parseMarkdownFile(content);
  const bodyLines = body.split('\n');
  const bullets: string[] = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.slice(2).trim();
      if (bulletText) {
        bullets.push(bulletText);
      }
    }
  }

  // Calculate hashes of bullet points in the file
  const activeHashes = new Set<string>();
  const sourceId = relative(folioRootPath, filePath).replace(/\\/g, '/');

  // Fetch all existing DB memories synced from this file
  const existingMemories = await pb.collection('memories').getFullList({
    filter: `user = "${userId}" && source_type = "File" && source_id = "${sourceId}"`,
  });
  const existingByHash = new Map(existingMemories.map((m) => [m.hash, m]));

  for (const text of bullets) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    activeHashes.add(hash);

    const existing = existingByHash.get(hash);
    if (existing) {
      if (existing.text !== text) {
        await pb.collection('memories').update(existing.id, {
          text,
          updatedAt: Date.now(),
        });
      }
    } else {
      const embedding = await getLocalEmbedding(text);
      await pb.collection('memories').create({
        user: userId,
        text,
        embedding,
        hash,
        source_type: 'File',
        source_id: sourceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // Prune memories no longer in the file
  for (const existing of existingMemories) {
    if (!activeHashes.has(existing.hash)) {
      console.log(`[Sync Engine] Pruning deleted memory from file:`, existing.text);
      await pb.collection('memories').delete(existing.id);
    }
  }
}

/**
 * Searches the folio directory structure for an existing file with the given ID and collection type.
 * Returns the file path if found, or null if not.
 */
export function findEntityFileOnDisk(id: string, collectionName: string, folioRootPath: string): string | null {
  if (collectionName === 'workspaces') {
    const workspacesParent = join(folioRootPath, 'workspaces');
    if (existsSync(workspacesParent)) {
      const folders = readdirSync(workspacesParent);
      const matched = folders.find((f) => f.endsWith(`-${id}`) && statSync(join(workspacesParent, f)).isDirectory());
      if (matched) return join(workspacesParent, matched, '.workspace.yaml');
    }
    const legacyPath = join(folioRootPath, id);
    if (existsSync(legacyPath) && statSync(legacyPath).isDirectory()) {
      return join(legacyPath, '.workspace.yaml');
    }
    return null;
  }

  // Check global tasks/events directories
  const globalDir = join(folioRootPath, collectionName);
  if (existsSync(globalDir)) {
    const files = readdirSync(globalDir);
    const matched = files.find((f) => extractIdFromFilename(f) === id && f.endsWith('.md'));
    if (matched) return join(globalDir, matched);
  }

  // Check new style workspaces folder
  const workspacesParent = join(folioRootPath, 'workspaces');
  if (existsSync(workspacesParent)) {
    const folders = readdirSync(workspacesParent);
    for (const folder of folders) {
      const wsDir = join(workspacesParent, folder, collectionName);
      if (existsSync(wsDir) && statSync(wsDir).isDirectory()) {
        const files = readdirSync(wsDir);
        const matched = files.find((f) => extractIdFromFilename(f) === id && f.endsWith('.md'));
        if (matched) return join(wsDir, matched);
      }
    }
  }

  // Check old style workspaces directly under root
  const rootItems = readdirSync(folioRootPath);
  for (const item of rootItems) {
    if (item === 'tasks' || item === 'events' || item === 'system' || item === 'workspaces') continue;
    const wsDir = join(folioRootPath, item, collectionName);
    if (existsSync(wsDir) && statSync(wsDir).isDirectory()) {
      const files = readdirSync(wsDir);
      const matched = files.find((f) => extractIdFromFilename(f) === id && f.endsWith('.md'));
      if (matched) return join(wsDir, matched);
    }
  }

  return null;
}

/**
 * Prunes a deleted workspace folder and cascade-deletes associated tasks, events, chat sessions, habits, and reflections from DB cache.
 */
export async function pruneWorkspaceFromDb(pb: PocketBase, workspaceId: string): Promise<void> {
  console.log(`[Sync Engine] Pruning workspace ${workspaceId} and running cascade deletes...`);

  // 1. Delete associated tasks and their memories
  try {
    const tasks = await pb.collection('tasks').getFullList({ filter: `workspace = "${workspaceId}"` });
    for (const task of tasks) {
      await deleteSourceMemories(pb, task.id, 'Task');
      await pb.collection('tasks').delete(task.id);
    }
  } catch (err) {
    console.error(`[Sync Engine] Error cascade deleting tasks for workspace ${workspaceId}:`, err);
  }

  // 2. Delete associated events and their memories
  try {
    const events = await pb.collection('events').getFullList({ filter: `workspace = "${workspaceId}"` });
    for (const event of events) {
      await deleteSourceMemories(pb, event.id, 'Event');
      await pb.collection('events').delete(event.id);
    }
  } catch (err) {
    console.error(`[Sync Engine] Error cascade deleting events for workspace ${workspaceId}:`, err);
  }

  // 3. Delete associated chat sessions (messages will cascade delete automatically)
  try {
    const sessions = await pb.collection('chat_sessions').getFullList({ filter: `workspace = "${workspaceId}"` });
    for (const session of sessions) {
      await pb.collection('chat_sessions').delete(session.id);
    }
  } catch (err) {
    console.error(`[Sync Engine] Error cascade deleting chat sessions for workspace ${workspaceId}:`, err);
  }

  // 4. Delete associated habits
  try {
    const habits = await pb.collection('habits').getFullList({ filter: `workspace = "${workspaceId}"` });
    for (const habit of habits) {
      await pb.collection('habits').delete(habit.id);
    }
  } catch (err) {
    console.error(`[Sync Engine] Error cascade deleting habits for workspace ${workspaceId}:`, err);
  }

  // 5. Delete associated reflections
  try {
    const reflections = await pb.collection('reflections').getFullList({ filter: `workspace = "${workspaceId}"` });
    for (const reflection of reflections) {
      await pb.collection('reflections').delete(reflection.id);
    }
  } catch (err) {
    console.error(`[Sync Engine] Error cascade deleting reflections for workspace ${workspaceId}:`, err);
  }

  // 6. Delete workspace record
  try {
    await pb.collection('workspaces').delete(workspaceId);
  } catch (err: any) {
    if (err?.status !== 404) {
      console.warn(`[Sync Engine] Failed to delete workspace record ${workspaceId}:`, err);
    }
  }
}

/**
 * Reconciles the local folio markdown files with the database cache on startup.
 * Syncs new/updated files and prunes database records for deleted files.
 */
export async function reconcileFolio(folioRootPath: string, pb: PocketBase): Promise<void> {
  if (!existsSync(folioRootPath)) return;

  console.log('[Sync Engine] Starting folio reconciliation...');

  // Migrate existing memories' source_id if their workspace folder is now in workspaces/
  const wsParentPath = join(folioRootPath, 'workspaces');
  if (existsSync(wsParentPath)) {
    try {
      const wsFolders = readdirSync(wsParentPath);
      for (const folder of wsFolders) {
        const fullPath = join(wsParentPath, folder);
        if (statSync(fullPath).isDirectory()) {
          const dashIndex = folder.lastIndexOf('-');
          const workspaceId = dashIndex !== -1 ? folder.slice(dashIndex + 1) : folder;
          
          const oldSourceId = `${workspaceId}/workspace_memories.md`;
          const newSourceId = `workspaces/${folder}/workspace_memories.md`;
          
          const oldMemories = await pb.collection('memories').getFullList({
            filter: `source_type = "File" && source_id = "${oldSourceId}"`,
          });
          
          for (const mem of oldMemories) {
            console.log(`[Sync Engine] Migrating memory path from ${oldSourceId} to ${newSourceId}`);
            await pb.collection('memories').update(mem.id, {
              source_id: newSourceId,
            });
          }
        }
      }
    } catch (err) {
      console.error('[Sync Engine] Failed migrating memory paths during reconciliation:', err);
    }
  }

  // 1. Gather all files in the folio under tasks/ and events/ directories
  const filesToSync: string[] = [];

  const scanFolder = (folderPath: string) => {
    if (!existsSync(folderPath)) return;
    const items = readdirSync(folderPath);
    for (const item of items) {
      const fullPath = join(folderPath, item);
      if (statSync(fullPath).isFile() && item.endsWith('.md')) {
        filesToSync.push(fullPath);
      }
    }
  };

  // Global folders
  scanFolder(join(folioRootPath, 'tasks'));
  scanFolder(join(folioRootPath, 'events'));
  scanFolder(join(folioRootPath, 'daily-logs'));
  
  // Global memories file
  const globalMemoriesPath = join(folioRootPath, 'system', 'memories.md');
  if (existsSync(globalMemoriesPath)) {
    filesToSync.push(globalMemoriesPath);
  }

  // Workspace folders
  // 1. New style workspaces folder
  const workspacesParentPath = join(folioRootPath, 'workspaces');
  if (existsSync(workspacesParentPath)) {
    const wsFolders = readdirSync(workspacesParentPath);
    for (const folder of wsFolders) {
      const fullPath = join(workspacesParentPath, folder);
      if (statSync(fullPath).isDirectory()) {
        scanFolder(join(fullPath, 'tasks'));
        scanFolder(join(fullPath, 'events'));
        
        const wsMemoriesPath = join(fullPath, 'workspace_memories.md');
        if (existsSync(wsMemoriesPath)) {
          filesToSync.push(wsMemoriesPath);
        }

        const dashIndex = folder.lastIndexOf('-');
        const workspaceId = dashIndex !== -1 ? folder.slice(dashIndex + 1) : folder;
        const wsConfigPath = join(fullPath, '.workspace.yaml');
        if (existsSync(wsConfigPath)) {
          filesToSync.push(wsConfigPath);
        } else {
          try {
            const dbWs = await pb.collection('workspaces').getOne(workspaceId);
            if (dbWs) {
              console.log(`[Sync Engine] Restoring missing .workspace.yaml for workspace ${workspaceId}`);
              const { serializeWorkspaceYaml } = await import('./parser');
              const yamlContent = serializeWorkspaceYaml({
                id: dbWs.id,
                name: dbWs.name,
                icon: dbWs.icon,
                color: dbWs.color,
                context: dbWs.context || '',
                agentName: dbWs.agentName || '',
                defaultAgentPersona: dbWs.defaultAgentPersona || '',
                createdAt: dbWs.createdAt,
                archived: dbWs.archived || false,
              });
              writeFileSync(wsConfigPath, yamlContent, 'utf8');
              filesToSync.push(wsConfigPath);
            }
          } catch (err: any) {
            if (err?.status !== 404) {
              console.error(`[Sync Engine] Failed to restore .workspace.yaml for workspace ${workspaceId}:`, err);
            } else {
              console.log(`[Sync Engine] Generating default .workspace.yaml for workspace folder: ${folder}`);
              const { serializeWorkspaceYaml } = await import('./parser');
              const namePart = dashIndex !== -1 ? folder.slice(0, dashIndex) : folder;
              const yamlContent = serializeWorkspaceYaml({
                id: workspaceId,
                name: namePart.replace(/-/g, ' '),
                icon: 'Briefcase',
                color: '#d4a373',
                createdAt: Date.now(),
              });
              writeFileSync(wsConfigPath, yamlContent, 'utf8');
              filesToSync.push(wsConfigPath);
            }
          }
        }
      }
    }
  }

  // 2. Old style workspaces directly under root (for backward compatibility)
  const rootItems = readdirSync(folioRootPath);
  for (const item of rootItems) {
    if (item === 'tasks' || item === 'events' || item === 'system' || item === 'workspaces') continue;
    const fullPath = join(folioRootPath, item);
    if (statSync(fullPath).isDirectory()) {
      scanFolder(join(fullPath, 'tasks'));
      scanFolder(join(fullPath, 'events'));
      
      const wsMemoriesPath = join(fullPath, 'workspace_memories.md');
      if (existsSync(wsMemoriesPath)) {
        filesToSync.push(wsMemoriesPath);
      }

      const wsConfigPath = join(fullPath, '.workspace.yaml');
      if (existsSync(wsConfigPath)) {
        filesToSync.push(wsConfigPath);
      }
    }
  }

  // Sync files to DB
  for (const file of filesToSync) {
    try {
      await syncFolioFileToDb(file, pb, folioRootPath);
    } catch (err) {
      console.error('[Sync Engine] Error syncing file during reconciliation:', file, err);
    }
  }

  // 2. Query all DB tasks and events to prune deleted items
  const existingIds = new Set(filesToSync.map((f) => extractIdFromFilename(basename(f))));

  const pruneDeleted = async (collectionName: 'tasks' | 'events', sourceType: 'Task' | 'Event') => {
    try {
      const records = await pb.collection(collectionName).getFullList();
      for (const rec of records) {
        if (!existingIds.has(rec.id)) {
          console.log(`[Sync Engine] Pruning deleted ${sourceType} from DB:`, rec.id);
          // Delete memories
          await deleteSourceMemories(pb, rec.id, sourceType);
          // Delete DB record
          await pb.collection(collectionName).delete(rec.id);
        }
      }
    } catch (err) {
      console.error(`[Sync Engine] Error pruning deleted ${collectionName}:`, err);
    }
  };

  await pruneDeleted('tasks', 'Task');
  await pruneDeleted('events', 'Event');

  // Prune deleted file memories
  try {
    const fileMemories = await pb.collection('memories').getFullList({
      filter: 'source_type = "File"',
    });
    const checkedPaths = new Set<string>();
    for (const mem of fileMemories) {
      if (checkedPaths.has(mem.source_id)) continue;
      checkedPaths.add(mem.source_id);
      
      const expectedPath = join(folioRootPath, mem.source_id);
      if (!existsSync(expectedPath)) {
        console.log(`[Sync Engine] Pruning deleted memories file from DB:`, mem.source_id);
        const toDelete = fileMemories.filter((m) => m.source_id === mem.source_id);
        for (const d of toDelete) {
          await pb.collection('memories').delete(d.id);
        }
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Error pruning deleted memories files:', err);
  }

  // Prune deleted workspaces
  try {
    const dbWorkspaces = await pb.collection('workspaces').getFullList();
    const activeWorkspaceIds = new Set<string>();
    
    // 1. Scan workspaces/ folder
    if (existsSync(workspacesParentPath)) {
      const wsFolders = readdirSync(workspacesParentPath);
      for (const folder of wsFolders) {
        const fullPath = join(workspacesParentPath, folder);
        if (statSync(fullPath).isDirectory()) {
          const dashIndex = folder.lastIndexOf('-');
          const workspaceId = dashIndex !== -1 ? folder.slice(dashIndex + 1) : folder;
          activeWorkspaceIds.add(workspaceId);
        }
      }
    }
    
    // 2. Scan root folder for old-style workspaces
    for (const item of rootItems) {
      if (item === 'tasks' || item === 'events' || item === 'system' || item === 'workspaces') continue;
      const fullPath = join(folioRootPath, item);
      if (statSync(fullPath).isDirectory()) {
        activeWorkspaceIds.add(item);
      }
    }
    
    // Now prune any db workspace whose ID is not in activeWorkspaceIds
    for (const dbWs of dbWorkspaces) {
      if (!activeWorkspaceIds.has(dbWs.id)) {
        console.log(`[Sync Engine] Pruning deleted workspace ${dbWs.id} from DB`);
        await pruneWorkspaceFromDb(pb, dbWs.id);
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Error pruning deleted workspaces during reconciliation:', err);
  }

  console.log('[Sync Engine] Folio reconciliation completed.');
}

// --- Daily Log Sync helpers and streak functions ---

function parseHabitsFromMarkdown(content: string): Map<string, boolean> {
  const habitsMap = new Map<string, boolean>();
  const lines = content.split('\n');
  let inHabitsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') && trimmed.toLowerCase().includes('habit')) {
      inHabitsSection = true;
      continue;
    }
    if (inHabitsSection && trimmed.startsWith('#') && !trimmed.toLowerCase().includes('habit')) {
      inHabitsSection = false;
    }

    if (inHabitsSection) {
      const match = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
      if (match) {
        const checked = match[1].toLowerCase() === 'x';
        const habitName = match[2].trim();
        habitsMap.set(habitName, checked);
      }
    }
  }
  return habitsMap;
}

const dateParts = (ds: string) => {
  const [y, m, d] = ds.split('-').map(Number);
  return { y, m: m - 1, d };
};

const utcDate = (ds: string) => {
  const { y, m, d } = dateParts(ds);
  return new Date(Date.UTC(y, m, d));
};

const formatYMD = (dt: Date) =>
  `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;

const addDays = (ds: string, n: number): string => {
  const { y, m, d } = dateParts(ds);
  return formatYMD(new Date(Date.UTC(y, m, d + n)));
};

const daysBetween = (a: string, b: string): number => {
  const aMs = Date.UTC(...(Object.values(dateParts(a)) as [number, number, number]));
  const bMs = Date.UTC(...(Object.values(dateParts(b)) as [number, number, number]));
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
};

const getDayOfWeek = (ds: string): number => utcDate(ds).getUTCDay();

function calculateNewStreak(
  habit: {
    frequency: 'daily' | 'custom';
    frequencyConfig?: { daysOfWeek?: number[] };
    currentStreak: number;
    longestStreak: number;
    lastLoggedDate?: string;
  },
  logDateString: string,
  logStatus: 'completed' | 'skipped',
  skippedDates: Set<string>
): { currentStreak: number; longestStreak: number } {
  if (!habit.lastLoggedDate) {
    const initialStreak = logStatus === 'completed' ? 1 : 0;
    return {
      currentStreak: initialStreak,
      longestStreak: Math.max(initialStreak, habit.longestStreak),
    };
  }

  const diffDays = daysBetween(logDateString, habit.lastLoggedDate);

  if (diffDays <= 0) {
    return {
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
    };
  }

  let preserved = true;
  if (diffDays > 1) {
    for (let i = 1; i < diffDays; i++) {
      const cursorDateStr = addDays(habit.lastLoggedDate, i);

      let isScheduled = true;
      if (habit.frequency === 'custom' && habit.frequencyConfig?.daysOfWeek) {
        isScheduled = habit.frequencyConfig.daysOfWeek.includes(getDayOfWeek(cursorDateStr));
      }

      if (isScheduled && !skippedDates.has(cursorDateStr)) {
        preserved = false;
        break;
      }
    }
  }

  if (logStatus === 'skipped') {
    const nextStreak = preserved ? habit.currentStreak : 0;
    return {
      currentStreak: nextStreak,
      longestStreak: Math.max(nextStreak, habit.longestStreak),
    };
  } else {
    const nextStreak = preserved ? habit.currentStreak + 1 : 1;
    return {
      currentStreak: nextStreak,
      longestStreak: Math.max(nextStreak, habit.longestStreak),
    };
  }
}

export async function syncDailyLogFileToDb(
  filePath: string,
  pb: PocketBase,
  dateString: string
): Promise<void> {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  const parsedHabits = parseHabitsFromMarkdown(content);

  // Resolve user ID
  let userId = pb.authStore.record?.id;
  if (!userId) {
    const users = await pb.collection('users').getFullList({ limit: 1 });
    if (users.length > 0) {
      userId = users[0].id;
    }
  }
  if (!userId) {
    console.warn('[Sync Engine] No active user found for daily log sync:', filePath);
    return;
  }

  // Fetch all active habits for the user
  const habits = await pb.collection('habits').getFullList({
    filter: `user = "${userId}" && archived = false`,
  });

  for (const habit of habits) {
    if (!parsedHabits.has(habit.name)) continue;

    const checked = parsedHabits.get(habit.name)!;
    const status = checked ? 'completed' : 'skipped';

    // Check if there is an existing log for this date and habit
    const existingList = await pb.collection('habit_logs').getList(1, 1, {
      filter: `habit = "${habit.id}" && dateString = "${dateString}"`,
    });
    const existingLog = existingList.items[0];

    let updated = false;
    if (existingLog) {
      if (existingLog.status !== status) {
        await pb.collection('habit_logs').update(existingLog.id, {
          status,
          timestamp: Date.now(),
        });
        updated = true;
      }
    } else {
      await pb.collection('habit_logs').create({
        user: userId,
        habit: habit.id,
        timestamp: Date.now(),
        dateString,
        status,
      });
      updated = true;
    }

    if (updated) {
      // Recalculate streak
      const logsList = await pb.collection('habit_logs').getFullList({
        filter: `habit = "${habit.id}"`,
      });
      const logs = logsList.sort((a, b) => a.dateString.localeCompare(b.dateString));

      let currentStreak = 0;
      let longestStreak = 0;
      let lastLoggedDate: string | undefined = undefined;

      const skippedDates = new Set<string>(
        logs.filter((l) => l.status === 'skipped').map((l) => l.dateString)
      );

      const freqConfig = typeof habit.frequencyConfig === 'string'
        ? JSON.parse(habit.frequencyConfig)
        : habit.frequencyConfig;

      for (const log of logs) {
        const result = calculateNewStreak(
          {
            frequency: habit.frequency as 'daily' | 'custom',
            frequencyConfig: freqConfig,
            currentStreak,
            longestStreak,
            lastLoggedDate,
          },
          log.dateString,
          log.status as 'completed' | 'skipped',
          skippedDates
        );
        currentStreak = result.currentStreak;
        longestStreak = result.longestStreak;
        lastLoggedDate = log.dateString;
      }

      await pb.collection('habits').update(habit.id, {
        currentStreak,
        longestStreak,
        lastLoggedDate,
        lastLoggedAt: Date.now(),
      });
    }
  }
}

/**
 * Prunes DB cache records and associated memories when a folio file is deleted.
 */
export async function pruneFolioFileFromDb(
  filePath: string,
  pb: PocketBase,
  folioRootPath: string
): Promise<void> {
  const info = resolveEntityFromPath(filePath, folioRootPath);
  if (!info) return;

  const { id, collectionName } = info;

  // Check if the entity still exists somewhere on disk (e.g. if it was renamed/moved)
  const existingPath = findEntityFileOnDisk(id, collectionName, folioRootPath);
  if (existingPath) {
    console.log(`[Sync Engine] Entity ${id} in ${collectionName} still exists on disk at ${existingPath}, skipping DB pruning.`);
    return;
  }

  if (collectionName === 'memories') {
    const sourceId = relative(folioRootPath, filePath).replace(/\\/g, '/');
    try {
      const existing = await pb.collection('memories').getFullList({
        filter: `source_type = "File" && source_id = "${sourceId}"`,
      });
      for (const mem of existing) {
        await pb.collection('memories').delete(mem.id);
      }
    } catch (err) {
      console.warn(`[Sync Engine] Failed to prune memories for file ${sourceId}:`, err);
    }
  } else if (collectionName === 'workspaces') {
    await pruneWorkspaceFromDb(pb, id);
  } else {
    const sourceType = collectionName === 'tasks' ? 'Task' : 'Event';
    await deleteSourceMemories(pb, id, sourceType);
    try {
      await pb.collection(collectionName).delete(id);
    } catch (err: any) {
      if (err?.status !== 404) {
        console.warn(`[Sync Engine] Failed to delete record ${id} from ${collectionName}:`, err);
      }
    }
  }
}

