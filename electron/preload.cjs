const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronSQLite', {
  exec: sql => ipcRenderer.invoke('db:exec', sql),
  run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  all: (sql, params) => ipcRenderer.invoke('db:all', sql, params),
  batch: stmts => ipcRenderer.invoke('db:batch', stmts),
});

contextBridge.exposeInMainWorld('electronUpdater', {
  getState: () => ipcRenderer.invoke('updater:state'),
  check: () => ipcRenderer.invoke('updater:check'),
  install: () => ipcRenderer.invoke('updater:install'),
  onStatus: cb => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('updater:status', h);
    return () => ipcRenderer.removeListener('updater:status', h);
  },
});
