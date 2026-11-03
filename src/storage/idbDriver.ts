import type { Driver, RecordRow } from './types';

/**
 * Browser / PWA driver backed by IndexedDB. Same interface as the SQLite drivers.
 * Why not localStorage: it is capped at about 5 MB and re-writes the whole database on every change,
 * which a busy till with product photos and a year of sales will outgrow. IndexedDB has no such limit
 * and each change writes only the rows that changed.
 *
 * On first run it copies anything saved by the old localStorage driver (webDriver.ts) across, then removes it.
 */
const DB_NAME = 'mjtech-pos';
const DB_VERSION = 1;
const LEGACY_KEY = 'barpos.web.v1'; // webDriver.ts

interface RecStored { key: string; collection: string; id: string; json: string; seq: number }

const recKey = (collection: string, id: string) => `${collection}\u0000${id}`;
const asPromise = <T>(req: IDBRequest<T>) =>
  new Promise<T>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export class IdbDriver implements Driver {
  name = 'browser-indexeddb';
  private db: IDBDatabase | null = null;
  // Insertion order is kept with a counter, so lists come back oldest-first exactly like the SQLite rowid order.
  private seq = new Map<string, number>();
  private next = 1;

  async init() {
    if (this.db) return; // safe to call twice
    this.db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv');
        req.result.createObjectStore('rec', { keyPath: 'key' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('Database is open in another tab. Close other copies of the app and reload.'));
    });
    this.db.onversionchange = () => this.db?.close();
    await this.migrateLegacy();
  }

  /** Runs `fn` inside one transaction and resolves when it has been committed to disk. */
  private tx(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => void): Promise<void> {
    return new Promise((res, rej) => {
      const t = this.db!.transaction(stores, mode);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaction aborted'));
      fn(t);
    });
  }

  private async migrateLegacy() {
    let raw: string | null = null;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch { return; }
    if (!raw) return;
    const t = this.db!.transaction(['kv', 'rec'], 'readonly');
    const [nKv, nRec] = await Promise.all([asPromise(t.objectStore('kv').count()), asPromise(t.objectStore('rec').count())]);
    if (nKv || nRec) return; // IndexedDB already has data: never overwrite it
    let legacy: { kv?: Record<string, string>; rec?: RecordRow[] };
    try { legacy = JSON.parse(raw); } catch { return; }
    let n = 1;
    await this.tx(['kv', 'rec'], 'readwrite', t2 => {
      for (const [k, v] of Object.entries(legacy.kv || {})) t2.objectStore('kv').put(v, k);
      for (const r of legacy.rec || []) {
        t2.objectStore('rec').put({ key: recKey(r.collection, r.id), collection: r.collection, id: r.id, json: r.json, seq: n++ } as RecStored);
      }
    });
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    console.info('[storage] moved data from localStorage to IndexedDB');
  }

  async loadKv() {
    const t = this.db!.transaction('kv', 'readonly');
    const store = t.objectStore('kv');
    const [keys, values] = await Promise.all([asPromise(store.getAllKeys()), asPromise(store.getAll())]);
    const out: Record<string, string> = {};
    keys.forEach((k, i) => { out[String(k)] = values[i] as string; });
    return out;
  }

  async loadRecords(): Promise<RecordRow[]> {
    const t = this.db!.transaction('rec', 'readonly');
    const all = (await asPromise(t.objectStore('rec').getAll())) as RecStored[];
    all.sort((a, b) => a.seq - b.seq);
    this.seq.clear();
    this.next = 1;
    for (const r of all) { this.seq.set(r.key, r.seq); this.next = Math.max(this.next, r.seq + 1); }
    return all.map(r => ({ collection: r.collection, id: r.id, json: r.json }));
  }

  async setKv(key: string, value: string) {
    await this.tx(['kv'], 'readwrite', t => { t.objectStore('kv').put(value, key); });
  }

  async upsertRecords(collection: string, rows: { id: string; json: string }[]) {
    await this.tx(['rec'], 'readwrite', t => {
      const store = t.objectStore('rec');
      for (const r of rows) {
        const key = recKey(collection, r.id);
        let seq = this.seq.get(key);
        if (seq === undefined) { seq = this.next++; this.seq.set(key, seq); }
        store.put({ key, collection, id: r.id, json: r.json, seq } as RecStored);
      }
    });
  }

  async deleteRecords(collection: string, ids: string[]) {
    await this.tx(['rec'], 'readwrite', t => {
      const store = t.objectStore('rec');
      for (const id of ids) { const key = recKey(collection, id); store.delete(key); this.seq.delete(key); }
    });
  }

  async reset() {
    await this.tx(['kv', 'rec'], 'readwrite', t => { t.objectStore('kv').clear(); t.objectStore('rec').clear(); });
    this.seq.clear(); this.next = 1;
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  }
}
