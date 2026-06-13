const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDb, closeDb, autoSave, saveNow } = require('./database');
const { registerIpcHandlers } = require('./ipcHandlers');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Music Tagger',
    backgroundColor: '#020617',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Needed for file:// audio playback
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize database (async for sql.js WASM loading)
  await initDb();
  autoSave(30000); // Auto-save every 30 seconds

  createWindow();                     // 先创建窗口（mainWindow 赋值）
  registerIpcHandlers(mainWindow);    // 再注册 IPC handlers（此时 mainWindow 不为 undefined）

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  saveNow();
  closeDb();
});
