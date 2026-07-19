const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ordrDesktop', {
  platform: process.platform,
  version: '0.1.0',
});
