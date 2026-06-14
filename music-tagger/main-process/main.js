const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDb, closeDb, autoSave, saveNow, isDbReady, onDbReady } = require('./database');
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

  // Show window as soon as renderer is ready (HTML/CSS loaded, DB may still be loading)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 1) Create window immediately — user sees the UI even while DB loads
  createWindow();

  // 2) Register IPC handlers (they handle DB-not-ready gracefully)
  registerIpcHandlers(mainWindow);

  // 3) Start DB init in background — don't block window display
  initDb().then(() => {
    autoSave(30000);

    // Notify renderer that DB is ready so it can refresh data
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('db:ready');
    }
  }).catch(err => {
    console.error('Database initialization failed:', err);
  });

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
