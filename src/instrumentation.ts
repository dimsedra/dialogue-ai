export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Prevent multiple watcher initializations during dev HMR hot reloads
    const globalAny = global as any;
    if (globalAny.folioWatcherInitialized) {
      return;
    }
    globalAny.folioWatcherInitialized = true;

    try {
      const { startWatcher } = await import('./lib/folio/watcher');
      await startWatcher();
    } catch (err) {
      console.error('[Sync Engine Watcher] Failed to initialize watcher on startup:', err);
    }
  }
}
