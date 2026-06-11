import { join, relative, basename, dirname } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { AsyncLocalStorage } from 'async_hooks';
import PocketBase from 'pocketbase';
import { parseMarkdownFile } from './parser';
import { ingestTaskNotes, ingestEventNotes, deleteSourceMemories } from '../graph/ingest';

export interface VaultContext {
  vaultRootPath: string;
  activeWorkspace: string;
  basePath: string;
}

export const vaultRequestContext = new AsyncLocalStorage<VaultContext>();

export function getVaultContext(): VaultContext {
  const ctx = vaultRequestContext.getStore();
  if (!ctx) {
    throw new Error('getVaultContext() must be called within vaultRequestContext.run()');
  }
  return ctx;
}


export interface EntityInfo {
  id: string;
  collectionName: 'tasks' | 'events';
  workspaceId: string | null;
}

/**
 * Resolves collection, entity ID, and workspace ID from a given file path.
 */
export function resolveEntityFromPath(filePath: string, vaultRootPath: string): EntityInfo | null {
  const normRoot = vaultRootPath.replace(/\\/g, '/');
  const normFile = filePath.replace(/\\/g, '/');
  
  if (!normFile.startsWith(normRoot)) {
    return null;
  }
  
  const relPath = relative(normRoot, normFile).replace(/\\/g, '/');
  const parts = relPath.split('/');
  
  // Scopes:
  // 1. Global: tasks/task-[id].md -> parts = ['tasks', 'task-[id].md']
  // 2. Workspace: [workspaceId]/tasks/task-[id].md -> parts = ['[workspaceId]', 'tasks', 'task-[id].md']
  
  let collectionName: 'tasks' | 'events' | null = null;
  let workspaceId: string | null = null;
  let filename = '';
  
  if (parts.length === 2) {
    if (parts[0] === 'tasks' || parts[0] === 'events') {
      collectionName = parts[0] as 'tasks' | 'events';
      filename = parts[1];
    }
  } else if (parts.length === 3) {
    if (parts[1] === 'tasks' || parts[1] === 'events') {
      workspaceId = parts[0];
      collectionName = parts[1] as 'tasks' | 'events';
      filename = parts[2];
    }
  }
  
  if (!collectionName || !filename.endsWith('.md')) {
    return null;
  }
  
  let id = filename.slice(0, -3); // remove .md
  if (id.startsWith('task-')) id = id.slice(5);
  if (id.startsWith('event-')) id = id.slice(6);
  
  return { id, collectionName, workspaceId };
}

/**
 * Syncs a single markdown file from the vault to the PocketBase cache database.
 * Prevents redundant writes/embeddings by comparing values before writing.
 */
export async function syncVaultFileToDb(
  filePath: string,
  pb: PocketBase,
  vaultRootPath: string
): Promise<void> {
  const info = resolveEntityFromPath(filePath, vaultRootPath);
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
        JSON.stringify(existingRecord.resources) === JSON.stringify(data.resources);

      if (isIdentical) {
        return;
      }

      await pb.collection('events').update(id, data);
    } else {
      await pb.collection('events').create({ id, ...data });
    }

    // Run RAG ingestion for event
    await ingestEventNotes(pb, id, body, outcome);
  }
}

/**
 * Reconciles the local vault markdown files with the database cache on startup.
 * Syncs new/updated files and prunes database records for deleted files.
 */
export async function reconcileVault(vaultRootPath: string, pb: PocketBase): Promise<void> {
  if (!existsSync(vaultRootPath)) return;

  console.log('[Sync Engine] Starting vault reconciliation...');

  // 1. Gather all files in the vault under tasks/ and events/ directories
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
  scanFolder(join(vaultRootPath, 'tasks'));
  scanFolder(join(vaultRootPath, 'events'));

  // Workspace folders
  const rootItems = readdirSync(vaultRootPath);
  for (const item of rootItems) {
    const fullPath = join(vaultRootPath, item);
    if (statSync(fullPath).isDirectory() && item !== 'tasks' && item !== 'events') {
      scanFolder(join(fullPath, 'tasks'));
      scanFolder(join(fullPath, 'events'));
    }
  }

  // Sync files to DB
  for (const file of filesToSync) {
    try {
      await syncVaultFileToDb(file, pb, vaultRootPath);
    } catch (err) {
      console.error('[Sync Engine] Error syncing file during reconciliation:', file, err);
    }
  }

  // 2. Query all DB tasks and events to prune deleted items
  const pruneDeleted = async (collectionName: 'tasks' | 'events', sourceType: 'Task' | 'Event') => {
    try {
      const records = await pb.collection(collectionName).getFullList();
      for (const rec of records) {
        // Construct expected path
        const filePrefix = collectionName === 'tasks' ? 'task-' : 'event-';
        const expectedFilename = `${filePrefix}${rec.id}.md`;
        
        const expectedPath = rec.workspace
          ? join(vaultRootPath, rec.workspace, collectionName, expectedFilename)
          : join(vaultRootPath, collectionName, expectedFilename);

        if (!existsSync(expectedPath)) {
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

  console.log('[Sync Engine] Vault reconciliation completed.');
}
