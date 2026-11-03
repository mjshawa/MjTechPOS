const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const { setupUpdater } = require('./updater.cjs');

// Local SQLite file lives in the user's profile, e.g. C:\Users\<you>\AppData\Roaming\Bar POS\barpos.sqlite
let db;
function openDb() {
  db = new Database(path.join(app.getPath('userData'), 'barpos.sqlite'));
  db.pragma('journal_mode = WAL');   // crash-safe, fast writes
  db.pragma('synchronous = NORMAL');
}

ipcMain.handle('db:exec', (_e, sql) => { db.exec(sql); });
ipcMain.handle('db:run', (_e, sql, params = []) => { db.prepare(sql).run(...params); });
ipcMain.handle('db:all', (_e, sql, params = []) => db.prepare(sql).all(...params));
ipcMain.handle('db:batch', (_e, stmts) => {
  db.transaction(() => { for (const s of stmts) db.prepare(s.sql).run(...s.params); })();
});

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  if (process.env.ELECTRON_START_URL) win.loadURL(process.env.ELECTRON_START_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // one register window only, so two copies can't fight over the database
} else {
  app.whenReady().then(() => {
    openDb(); createWindow();
    try {
      setupUpdater({
        app, ipcMain, getWindow: () => win,
        autoUpdater: require('electron-updater').autoUpdater,
        enabled: app.isPackaged && !process.env.ELECTRON_START_URL, // only the installed app updates itself
      });
    } catch (e) { console.error('[updater] not started', e); } // the register must open even if this fails
  });
  app.on('window-all-closed', () => { try { db && db.close(); } catch {} app.quit(); });
}
