const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ordrDesktop', {
  platform: process.platform,
  zoom: {
    change: (action) => ipcRenderer.invoke('zoom:change', action),
    get: () => ipcRenderer.invoke('zoom:get'),
  },
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.send('update:install'),
    onStatus: (callback) => ipcRenderer.on('update:status', (_event, payload) => callback(payload)),
  },
});
