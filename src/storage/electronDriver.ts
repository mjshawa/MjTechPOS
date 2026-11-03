import type { SqlExecutor } from './types';

/** Windows/Linux desktop: better-sqlite3 runs in Electron's main process; this talks to it over IPC. */
export function createElectronExecutor(): SqlExecutor {
  const api = (window as any).electronSQLite;
  return {
    exec: sql => api.exec(sql),
    run: (sql, params = []) => api.run(sql, params),
    all: (sql, params = []) => api.all(sql, params),
    batch: stmts => api.batch(stmts),
  };
}
