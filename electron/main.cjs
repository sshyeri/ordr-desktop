const { app, BrowserWindow, dialog, ipcMain } = require('electron');
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
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => console.error('Auto update failed:', error));
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트 준비 완료',
      message: `새 버전 ${info.version} 다운로드가 완료되었습니다.`,
      detail: '지금 재시작하면 업데이트가 자동으로 설치됩니다. 나중에를 선택하면 앱을 종료할 때 설치됩니다.',
      noLink: true,
    });
    if (response === 0) autoUpdater.quitAndInstall(false, true);
  });
  const check = () => autoUpdater.checkForUpdates().catch((error) => console.error('Update check failed:', error));
  setTimeout(check, 5000);
  const updateTimer = setInterval(check, 6 * 60 * 60 * 1000);
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
