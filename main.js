const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

let mainWindow = null;
let pbProcess = null;
let nextProcess = null;

// Helper to check if a port is listening
function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(500);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
  });
}

// Poll a port until it is open or timeout is reached
async function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

// Start local PocketBase process
function startPocketBase() {
  const pbBinName = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
  
  // Resolve path to binary
  const pbPath = isDev
    ? path.join(__dirname, 'pocketbase', pbBinName)
    : path.join(process.resourcesPath, 'pocketbase', pbBinName);

  // Resolve directory for user data
  const dataDir = isDev
    ? path.join(__dirname, 'pb_data')
    : path.join(app.getPath('userData'), 'pb_data');

  const migrationsDir = isDev
    ? path.join(__dirname, 'pb_migrations')
    : path.join(process.resourcesPath, 'pb_migrations');

  console.log(`[PocketBase] Spawning binary: ${pbPath}`);
  console.log(`[PocketBase] Using data directory: ${dataDir}`);

  pbProcess = spawn(pbPath, [
    'serve',
    '--http', '127.0.0.1:8090',
    '--dir', dataDir,
    '--migrationsDir', migrationsDir
  ], {
    stdio: 'inherit'
  });

  pbProcess.on('error', (err) => {
    console.error('[PocketBase] Failed to start process:', err);
  });
}

// Start Next.js server
async function startNextServer() {
  console.log(`[Next.js] Preparing ${isDev ? 'development' : 'production'} custom server...`);
  const next = require('next');
  const nextApp = next({ dev: isDev, dir: __dirname, hostname: 'localhost', port: 3000 });
  const handle = nextApp.getRequestHandler();
  
  await nextApp.prepare();
  
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  server.listen(3000, () => {
    console.log(`[Next.js] Custom server listening on http://localhost:3000 (${isDev ? 'development' : 'production'})`);
  });

  server.on('error', (err) => {
    console.error('[Next.js] Server error:', err);
  });
}

// Create the browser window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Dialogue AI",
    show: false // Don't show until ready
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Clean up all child processes
function cleanupProcesses() {
  console.log('[Dialogue] Cleaning up background processes...');
  
  if (pbProcess) {
    console.log('[Dialogue] Terminating PocketBase...');
    try {
      if (process.platform === 'win32') {
        // Force-kill the process tree on Windows to ensure shell child processes die
        spawn('taskkill', ['/pid', pbProcess.pid, '/f', '/t']);
      } else {
        pbProcess.kill();
      }
    } catch (e) {
      console.error('[Dialogue] Error killing PocketBase:', e);
    }
  }

  if (nextProcess) {
    console.log('[Dialogue] Terminating Next.js dev server...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', nextProcess.pid, '/f', '/t']);
      } else {
        nextProcess.kill();
      }
    } catch (e) {
      console.error('[Dialogue] Error killing Next.js dev server:', e);
    }
  }
}

// Application Lifecycle
app.on('ready', async () => {
  // 1. Setup IPC bridges
  ipcMain.handle('open-file-dialog', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Select GGUF Local Model File",
      properties: ['openFile'],
      filters: [{ name: 'GGUF Models', extensions: ['gguf'] }]
    });
    if (canceled) return null;
    return filePaths[0];
  });

  // 2. Spawn databases and servers
  try {
    const isPbRunning = await isPortOpen(8090);
    if (isPbRunning) {
      console.log('[PocketBase] Port 8090 is already active. Reusing the running instance.');
    } else {
      startPocketBase();
    }
    
    await startNextServer();
    
    console.log('[Dialogue] Waiting for local servers to be active...');
    await Promise.all([
      waitForPort(8090), // Wait for PocketBase
      waitForPort(3000)  // Wait for Next.js
    ]);

    console.log('[Dialogue] Local servers are ready. Launching window.');
    createMainWindow();
  } catch (err) {
    console.error('[Dialogue] Initialization failure:', err);
    app.quit();
  }
});

// App shutdown hooks
app.on('will-quit', () => {
  cleanupProcesses();
});

app.on('window-all-closed', () => {
  cleanupProcesses();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
