import type { Driver, RecordRow, SqlExecutor } from './types';

// Two tables only:
//   kv       – small settings/state (cart, shift start, stock counts, sync cursors)
//   records  – JSON rows grouped by collection (products, sales, tabs, closed_shifts, outbox)
// `seq` keeps insertion order. Query with json_extract(), e.g. daily totals straight from SQL.
const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  UNIQUE (collection, id)
);
CREATE INDEX IF NOT EXISTS idx_records_collection ON records (collection);
`;

export class SqliteDriver implements Driver {
  constructor(public name: string, private x: SqlExecutor) {}

  async init() { await this.x.exec(SCHEMA); }

  async loadKv() {
    const rows = await this.x.all('SELECT key, value FROM kv');
    return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  }

  async loadRecords(): Promise<RecordRow[]> {
    return this.x.all('SELECT collection, id, json FROM records ORDER BY seq ASC');
  }

  setKv(key: string, value: string) {
    return this.x.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  upsertRecords(collection: string, rows: { id: string; json: string }[]) {
    if (!rows.length) return Promise.resolve();
    return this.x.batch(rows.map(r => ({
      sql: 'INSERT INTO records (collection, id, json) VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET json = excluded.json',
      params: [collection, r.id, r.json],
    })));
  }

  deleteRecords(collection: string, ids: string[]) {
    if (!ids.length) return Promise.resolve();
    return this.x.batch(ids.map(id => ({ sql: 'DELETE FROM records WHERE collection = ? AND id = ?', params: [collection, id] })));
  }

  async reset() {
    await this.x.exec('DELETE FROM kv; DELETE FROM records;');
  }
}
