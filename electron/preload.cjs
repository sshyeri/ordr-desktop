const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ordrDesktop', {
  platform: process.platform,
  version: '1.0.0',
  zoom: {
    change: (action) => ipcRenderer.invoke('zoom:change', action),
    get: () => ipcRenderer.invoke('zoom:get'),
  },
});
