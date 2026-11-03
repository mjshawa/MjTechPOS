/**
 * Windows auto-update (electron-updater + GitHub Releases).
 *
 * Flow:  check quietly  ->  download in the background  ->  tell the screen "ready"  ->  the owner taps
 *        "Restart now" (or the update installs by itself the next time the app is closed).
 * It never restarts on its own, so a sale in progress is never interrupted. Offline or any error: ignored,
 * and tried again later. The local SQLite file is outside the app folder, so updates never touch the data.
 *
 * Everything it needs is passed in, which keeps it testable without starting Electron.
 */
function setupUpdater({ app, ipcMain, getWindow, autoUpdater, enabled, firstCheckMs = 15_000, everyMs = 4 * 60 * 60 * 1000, log = console }) {
  let last = { state: 'idle', current: app.getVersion(), version: null, percent: 0 };

  const publish = patch => {
    last = { ...last, ...patch };
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('updater:status', last);
  };

  ipcMain.handle('updater:state', () => last);
  ipcMain.handle('updater:install', () => {
    if (last.state !== 'ready') return false;
    // (isSilent, isForceRunAfter): no installer wizard, and the app opens again by itself.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });

  const check = async () => {
    if (!enabled || last.state === 'downloading' || last.state === 'ready') return;
    try { await autoUpdater.checkForUpdates(); } catch (e) { log.warn('[updater] check failed (offline?)', e && e.message); }
  };
  ipcMain.handle('updater:check', async () => { await check(); return last; });

  if (!enabled) return { check }; // `npm run electron:dev` and unpacked builds: no updates, handlers still answer

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // closing the app at the end of the day installs a downloaded update
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = log;

  autoUpdater.on('checking-for-update', () => { if (last.state === 'idle' || last.state === 'error') publish({ state: 'checking' }); });
  autoUpdater.on('update-available', info => publish({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => publish({ state: 'idle' }));
  autoUpdater.on('download-progress', p => publish({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', info => publish({ state: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', e => { log.warn('[updater]', e && e.message); if (last.state !== 'ready') publish({ state: 'error' }); });

  setTimeout(check, firstCheckMs);           // shortly after the register has opened
  setInterval(check, everyMs).unref?.();     // and a few times a day while it stays open
  return { check };
}

module.exports = { setupUpdater };
