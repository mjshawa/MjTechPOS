export interface RecordRow { collection: string; id: string; json: string }

/** What every platform backend (Android SQLite, Electron SQLite, browser fallback) implements. */
export interface Driver {
  name: string;
  init(): Promise<void>;
  loadKv(): Promise<Record<string, string>>;
  loadRecords(): Promise<RecordRow[]>; // oldest-first
  setKv(key: string, value: string): Promise<void>;
  upsertRecords(collection: string, rows: { id: string; json: string }[]): Promise<void>;
  deleteRecords(collection: string, ids: string[]): Promise<void>;
  reset(): Promise<void>;
}

/** Minimal SQL surface; Capacitor and Electron each provide one. */
export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: any[]): Promise<void>;
  all(sql: string, params?: any[]): Promise<any[]>;
  batch(stmts: { sql: string; params: any[] }[]): Promise<void>; // one transaction
}
