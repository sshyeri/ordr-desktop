const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const appIcon = path.join(__dirname, '..', 'app', 'assets', 'brand-icon.png');

app.setAppUserModelId('kr.ordr.helper');

function createWindow() {
  const win = new BrowserWindow({
    width: 1720,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0b1017',
    title: 'ord local helper - sshyeri',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setZoomFactor(1.4);
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1.4);
    win.webContents.executeJavaScript("document.querySelector('#zoom-label').textContent='100%'");
  });
  if (process.env.ORDR_SMOKE_SCREENSHOT) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (process.env.ORDR_SMOKE_COLLAPSED) {
        await win.webContents.executeJavaScript("document.querySelector('#toggle-recommendations').click()");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (process.env.ORDR_SMOKE_HOVER_ID) {
        const id = JSON.stringify(process.env.ORDR_SMOKE_HOVER_ID);
        await win.webContents.executeJavaScript(`(() => { const row=document.querySelector('[data-id="'+${id}+'"]'); if(!row)return; row.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false,clientX:500,clientY:350})); row.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:500,clientY:350})); })()`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const image = await win.capturePage();
      require('node:fs').writeFileSync(process.env.ORDR_SMOKE_SCREENSHOT, image.toPNG());
      app.quit();
    });
  }
  return win;
}

function setupAutoUpdates(win) {
  const sendStatus = (status, detail = {}) => {
    if (!win.isDestroyed()) win.webContents.send('update:status', { status, currentVersion: app.getVersion(), ...detail });
  };
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) { sendStatus('not-available'); return { development: true }; }
    return autoUpdater.checkForUpdates();
  });
  ipcMain.handle('update:download', () => app.isPackaged ? autoUpdater.downloadUpdate() : null);
  ipcMain.on('update:install', () => { if (app.isPackaged) autoUpdater.quitAndInstall(false, true); });
  if (!app.isPackaged) { win.webContents.once('did-finish-load', () => sendStatus('not-available')); return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendStatus('checking'));
  autoUpdater.on('update-available', (info) => sendStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', (info) => sendStatus('not-available', { version: info?.version }));
  autoUpdater.on('download-progress', (progress) => sendStatus('downloading', { percent: Math.round(progress.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => sendStatus('downloaded', { version: info.version }));
  autoUpdater.on('error', (error) => { console.error('Auto update failed:', error); sendStatus('error', { message: error?.message || String(error) }); });
  const check = () => autoUpdater.checkForUpdates().catch((error) => console.error('Update check failed:', error));
  const updateTimer = setInterval(check, 30 * 60 * 1000);
  updateTimer.unref();
}

app.whenReady().then(() => {
  ipcMain.handle('zoom:change', (event, action) => {
    const contents = event.sender;
    const current = contents.getZoomFactor() / 1.4;
    const next = action === 'reset' ? 1 : Math.min(1.6, Math.max(.6, current + (action === 'in' ? .1 : -.1)));
    contents.setZoomFactor(Math.round(next * 1.4 * 100) / 100);
    return Math.round(next * 10) / 10;
  });
  ipcMain.handle('zoom:get', (event) => Math.round((event.sender.getZoomFactor() / 1.4) * 10) / 10);
  const win = createWindow();
  setupAutoUpdates(win);
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
