import type { Driver, RecordRow } from './types';

/**
 * Browser / PWA storage. Same interface as the SQLite drivers.
 *  - Primary: IndexedDB (hundreds of MB, safe for photos and a long sales history).
 *  - Asks the browser to make the storage "persistent" so it is not wiped when the phone runs low on space.
 *  - Data saved by older versions in localStorage is copied across automatically on first start.
 *  - If IndexedDB is unavailable (some private modes) it falls back to the old localStorage behaviour.
 */
const OLD_KEY = 'barpos.web.v1';
const DB_NAME = 'barpos-web';
const DB_VERSION = 1;

const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

interface IdbRec { k: string; collection: string; id: string; json: string; seq: number }

class IndexedDbDriver implements Driver {
  name = 'browser-indexeddb';
  private db!: IDBDatabase;
  private seq = 0;
  private seqOf = new Map<string, number>(); // insertion order is kept when a row is updated

  async init() {
    this.db = await new Promise<IDBDatabase>((res, rej) => {
      const o = indexedDB.open(DB_NAME, DB_VERSION);
      o.onupgradeneeded = () => {
        const d = o.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('rec')) d.createObjectStore('rec', { keyPath: 'k' });
      };
      o.onsuccess = () => res(o.result);
      o.onerror = () => rej(o.error);
      o.onblocked = () => rej(new Error('IndexedDB blocked'));
    });
    // Ask the browser not to delete our data under storage pressure (silently ignored if unsupported).
    try { await (navigator as any).storage?.persist?.(); } catch { /* ignore */ }
    await this.migrateFromLocalStorage();
    for (const r of await req(this.db.transaction('rec').objectStore('rec').getAll() as IDBRequest<IdbRec[]>)) {
      this.seqOf.set(r.k, r.seq);
      if (r.seq > this.seq) this.seq = r.seq;
    }
  }

  /** One-time copy of data saved by the previous (localStorage) version. The old copy is removed only after the new one is safely written. */
  private async migrateFromLocalStorage() {
    let raw: string | null = null;
    try { raw = localStorage.getItem(OLD_KEY); } catch { return; }
    if (!raw) return;
    const existing = await req(this.db.transaction('kv').objectStore('kv').count());
    if (existing > 0) return; // already has data, never overwrite it
    let old: { kv: Record<string, string>; rec: RecordRow[] };
    try { old = JSON.parse(raw); } catch { return; }
    const tx = this.db.transaction(['kv', 'rec'], 'readwrite');
    const kvS = tx.objectStore('kv'), recS = tx.objectStore('rec');
    for (const [k, v] of Object.entries(old.kv || {})) kvS.put(v, k);
    let s = 0;
    for (const r of old.rec || []) recS.put({ k: `${r.collection}\u0000${r.id}`, collection: r.collection, id: r.id, json: r.json, seq: ++s } as IdbRec);
    await done(tx);
    try { localStorage.removeItem(OLD_KEY); } catch { /* ignore */ }
  }

  async loadKv() {
    const store = this.db.transaction('kv').objectStore('kv');
    const [keys, vals] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
    const out: Record<string, string> = {};
    keys.forEach((k, i) => { out[String(k)] = vals[i] as string; });
    return out;
  }
  async loadRecords(): Promise<RecordRow[]> {
    const all = await req(this.db.transaction('rec').objectStore('rec').getAll() as IDBRequest<IdbRec[]>);
    return all.sort((a, b) => a.seq - b.seq).map(r => ({ collection: r.collection, id: r.id, json: r.json }));
  }
  async setKv(key: string, value: string) {
    const tx = this.db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    await done(tx);
  }
  async upsertRecords(collection: string, rows: { id: string; json: string }[]) {
    const tx = this.db.transaction('rec', 'readwrite');
    const s = tx.objectStore('rec');
    for (const r of rows) {
      const k = `${collection}\u0000${r.id}`;
      let seq = this.seqOf.get(k);
      if (seq === undefined) { seq = ++this.seq; this.seqOf.set(k, seq); }
      s.put({ k, collection, id: r.id, json: r.json, seq } as IdbRec);
    }
    await done(tx);
  }
  async deleteRecords(collection: string, ids: string[]) {
    const tx = this.db.transaction('rec', 'readwrite');
    const s = tx.objectStore('rec');
    for (const id of ids) { const k = `${collection}\u0000${id}`; s.delete(k); this.seqOf.delete(k); }
    await done(tx);
  }
  async reset() {
    const tx = this.db.transaction(['kv', 'rec'], 'readwrite');
    tx.objectStore('kv').clear(); tx.objectStore('rec').clear();
    await done(tx);
    this.seqOf.clear(); this.seq = 0;
    try { localStorage.removeItem(OLD_KEY); } catch { /* ignore */ }
  }
}

/** Old behaviour, kept only as a fallback when IndexedDB cannot be opened. */
class LocalStorageDriver implements Driver {
  name = 'browser-localstorage';
  private data: { kv: Record<string, string>; rec: RecordRow[] } = { kv: {}, rec: [] };

  async init() {
    try { const raw = localStorage.getItem(OLD_KEY); if (raw) this.data = JSON.parse(raw); } catch { /* start empty */ }
  }
  private save() { localStorage.setItem(OLD_KEY, JSON.stringify(this.data)); }

  async loadKv() { return { ...this.data.kv }; }
  async loadRecords() { return [...this.data.rec]; }
  async setKv(key: string, value: string) { this.data.kv[key] = value; this.save(); }

  async upsertRecords(collection: string, rows: { id: string; json: string }[]) {
    for (const r of rows) {
      const i = this.data.rec.findIndex(x => x.collection === collection && x.id === r.id);
      if (i >= 0) this.data.rec[i] = { collection, id: r.id, json: r.json };
      else this.data.rec.push({ collection, id: r.id, json: r.json });
    }
    this.save();
  }
  async deleteRecords(collection: string, ids: string[]) {
    const del = new Set(ids);
    this.data.rec = this.data.rec.filter(x => !(x.collection === collection && del.has(x.id)));
    this.save();
  }
  async reset() { this.data = { kv: {}, rec: [] }; localStorage.removeItem(OLD_KEY); }
}

/** Picks IndexedDB, or the localStorage fallback if the browser will not open it. */
export class WebDriver implements Driver {
  name = 'browser';
  private impl: Driver = new IndexedDbDriver();

  async init() {
    try { await this.impl.init(); }
    catch (e) {
      console.warn('[storage] IndexedDB unavailable, using localStorage', e);
      this.impl = new LocalStorageDriver();
      await this.impl.init();
    }
    this.name = this.impl.name;
  }
  loadKv() { return this.impl.loadKv(); }
  loadRecords() { return this.impl.loadRecords(); }
  setKv(k: string, v: string) { return this.impl.setKv(k, v); }
  upsertRecords(c: string, rows: { id: string; json: string }[]) { return this.impl.upsertRecords(c, rows); }
  deleteRecords(c: string, ids: string[]) { return this.impl.deleteRecords(c, ids); }
  reset() { return this.impl.reset(); }
}
