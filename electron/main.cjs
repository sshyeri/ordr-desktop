const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1720,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0b1017',
    title: 'ORDR 조합도우미',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  if (process.env.ORDR_SMOKE_SCREENSHOT) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const image = await win.capturePage();
      require('node:fs').writeFileSync(process.env.ORDR_SMOKE_SCREENSHOT, image.toPNG());
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
