import chokidar from 'chokidar';
import { join } from 'path';
import { getPbAdmin } from '../pb-server-admin';
import { syncFolioFileToDb, pruneFolioFileFromDb, resolveEntityFromPath } from './sync';
import { DEFAULT_FOLIO_DIR } from './constants';

let watcherInstance: chokidar.FSWatcher | null = null;
const debouncedSyncs = new Map<string, NodeJS.Timeout>();

export async function startWatcher(): Promise<chokidar.FSWatcher> {
  if (watcherInstance) {
    return watcherInstance;
  }

  // Resolve the Folio root path
  let devFallbackPath = process.env.NODE_ENV === 'development' ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

  console.log(`[Sync Engine Watcher] Starting file watcher on: ${folioRootPath}`);

  watcherInstance = chokidar.watch(folioRootPath, {
    ignored: /(^|[\/\\])\.(?!workspace\.yaml)/, // ignore dotfiles/folders except .workspace.yaml
    persistent: true,
    ignoreInitial: true, // initial startup reconciliation is handled by reconcileFolio
  });

  const handleAddOrChange = (filePath: string) => {
    // Check if the file is a valid folio entity we sync
    const info = resolveEntityFromPath(filePath, folioRootPath);
    if (!info) return;

    // Clear any existing pending sync for this file
    if (debouncedSyncs.has(filePath)) {
      clearTimeout(debouncedSyncs.get(filePath)!);
    }

    const timer = setTimeout(async () => {
      debouncedSyncs.delete(filePath);
      try {
        console.log(`[Sync Engine Watcher] File added/changed: ${filePath}`);
        const pb = await getPbAdmin();
        await syncFolioFileToDb(filePath, pb, folioRootPath);
      } catch (err) {
        console.error(`[Sync Engine Watcher] Sync failed for ${filePath}:`, err);
      }
    }, 250);

    debouncedSyncs.set(filePath, timer);
  };

  const handleUnlink = async (filePath: string) => {
    const info = resolveEntityFromPath(filePath, folioRootPath);
    if (!info) return;

    // Clear any pending sync for this deleted file
    if (debouncedSyncs.has(filePath)) {
      clearTimeout(debouncedSyncs.get(filePath)!);
      debouncedSyncs.delete(filePath);
    }

    try {
      console.log(`[Sync Engine Watcher] File deleted: ${filePath}`);
      const pb = await getPbAdmin();
      await pruneFolioFileFromDb(filePath, pb, folioRootPath);
    } catch (err) {
      console.error(`[Sync Engine Watcher] Prune failed for ${filePath}:`, err);
    }
  };

  watcherInstance
    .on('add', handleAddOrChange)
    .on('change', handleAddOrChange)
    .on('unlink', handleUnlink)
    .on('error', (error) => {
      console.error('[Sync Engine Watcher] Watcher error:', error);
    });

  return watcherInstance;
}

export async function stopWatcher(): Promise<void> {
  if (watcherInstance) {
    // Clear all pending timers
    for (const timer of debouncedSyncs.values()) {
      clearTimeout(timer);
    }
    debouncedSyncs.clear();

    await watcherInstance.close();
    watcherInstance = null;
    console.log('[Sync Engine Watcher] File watcher stopped.');
  }
}
