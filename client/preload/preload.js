const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Screen Capture
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),

  // Input Injection
  injectMouseMove: (normX, normY) => ipcRenderer.invoke('inject-mouse-move', { normX, normY }),
  injectMouseDown: (button) => ipcRenderer.invoke('inject-mouse-down', { button }),
  injectMouseUp: (button) => ipcRenderer.invoke('inject-mouse-up', { button }),
  injectMouseWheel: (deltaY) => ipcRenderer.invoke('inject-mouse-wheel', { deltaY }),
  injectKeyDown: (vk, scan, char) => ipcRenderer.invoke('inject-key-down', { vk, scan, char }),
  injectKeyUp: (vk, scan, char) => ipcRenderer.invoke('inject-key-up', { vk, scan, char }),

  // System & LAN
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getLanPeers: () => ipcRenderer.invoke('get-lan-peers'),
  onLanPeersUpdated: (callback) => {
    ipcRenderer.on('lan-peers-updated', (event, peers) => callback(peers));
  },

  // Clipboard & Window
  copyToClipboard: (text) => ipcRenderer.invoke('copy-clipboard', text),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Open Viewer Window
  openRemoteViewer: (sessionData) => ipcRenderer.invoke('open-remote-viewer', sessionData),
  onRemoteViewerInit: (callback) => {
    ipcRenderer.on('init-remote-viewer', (event, data) => callback(data));
  }
});
