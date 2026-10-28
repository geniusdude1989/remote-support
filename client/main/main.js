const { app, BrowserWindow, ipcMain, desktopCapturer, powerSaveBlocker, clipboard } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const inputManager = require('./input-manager');
const LanDiscovery = require('./lan-discovery');

let mainWindow = null;
let viewerWindows = new Map();
let lanDiscovery = null;
let powerBlockerId = null;

function ensureLocalServerRunning() {
  const req = http.get('http://127.0.0.1:8080/health', (res) => {
    // Already running
  });
  req.on('error', () => {
    // Attempt auto-start if local server codebase exists
    const candidates = [
      path.join(__dirname, '..', '..', 'server', 'src', 'index.js'),
      path.join(process.cwd(), 'server', 'src', 'index.js'),
      path.join(process.cwd(), '..', 'server', 'src', 'index.js')
    ];
    for (const serverScript of candidates) {
      if (fs.existsSync(serverScript)) {
        try {
          console.log(`[Main] Auto-launching signaling server: ${serverScript}`);
          const s = spawn('node', [serverScript], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
          });
          s.unref();
        } catch (e) {}
        break;
      }
    }
  });
}

// Generate or retrieve persistent 9-digit device ID
function getOrGenerateDeviceId() {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'CPU';
  const raw = `${os.hostname()}-${os.platform()}-${cpuModel}-${os.userInfo().username}`;
  
  // Hash to deterministic 9-digit number
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash) % 900000000 + 100000000;
  return positive.toString();
}

const deviceId = getOrGenerateDeviceId();
const deviceName = os.hostname();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    frame: true,
    titleBarStyle: 'default',
    title: 'HawkRDP Remote Support',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ensureLocalServerRunning();

  // Start native input injector
  inputManager.start();

  // Start LAN discovery
  lanDiscovery = new LanDiscovery(deviceId, deviceName);
  lanDiscovery.start();

  lanDiscovery.on('peers-updated', (peers) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lan-peers-updated', peers);
    }
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (lanDiscovery) lanDiscovery.stop();
    inputManager.stop();
    if (powerBlockerId !== null) {
      powerSaveBlocker.stop(powerBlockerId);
    }
    app.quit();
  }
});

// IPC Handlers

// Screen capture sources
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }));
  } catch (err) {
    console.error('[Main] Failed to get screen sources:', err);
    return [];
  }
});

// System info
ipcMain.handle('get-system-info', () => {
  return {
    deviceId,
    deviceName,
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    localIps: lanDiscovery ? lanDiscovery.getLocalIps() : []
  };
});

// App config
ipcMain.handle('get-app-config', () => {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return { serverUrl: 'http://localhost:8080' };
});

// LAN peers
ipcMain.handle('get-lan-peers', () => {
  return lanDiscovery ? lanDiscovery.getDiscoveredPeers() : [];
});

// Input injection
ipcMain.handle('inject-mouse-move', (event, { normX, normY }) => {
  inputManager.injectMouseMove(normX, normY);
  return true;
});

ipcMain.handle('inject-mouse-down', (event, { button }) => {
  inputManager.injectMouseDown(button);
  return true;
});

ipcMain.handle('inject-mouse-up', (event, { button }) => {
  inputManager.injectMouseUp(button);
  return true;
});

ipcMain.handle('inject-mouse-wheel', (event, { deltaY }) => {
  inputManager.injectMouseWheel(deltaY);
  return true;
});

ipcMain.handle('inject-key-down', (event, { vk, scan, char }) => {
  inputManager.injectKeyDown(vk, scan, char);
  return true;
});

ipcMain.handle('inject-key-up', (event, { vk, scan, char }) => {
  inputManager.injectKeyUp(vk, scan, char);
  return true;
});

// Clipboard
ipcMain.handle('copy-clipboard', (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('read-clipboard', () => {
  return clipboard.readText();
});

// Window Controls
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// Open Dedicated Viewer Window for remote session
ipcMain.handle('open-remote-viewer', (event, sessionData) => {
  const viewerWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `Remote Session - ${sessionData.remoteName || sessionData.remoteId}`,
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  viewerWin.loadFile(path.join(__dirname, '..', 'renderer', 'viewer.html'));

  viewerWin.webContents.once('did-finish-load', () => {
    viewerWin.webContents.send('init-remote-viewer', sessionData);
  });

  // Keep screen awake while in remote session
  if (powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }

  viewerWin.on('closed', () => {
    viewerWindows.delete(sessionData.sessionId);
    if (viewerWindows.size === 0 && powerBlockerId !== null) {
      powerSaveBlocker.stop(powerBlockerId);
      powerBlockerId = null;
    }
  });

  viewerWindows.set(sessionData.sessionId, viewerWin);
  return true;
});
