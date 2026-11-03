import type { Driver, RecordRow } from './types';

/** Last-resort browser fallback (used only when IndexedDB is blocked; see idbDriver.ts). Backed by localStorage. */
const KEY = 'barpos.web.v1';

export class WebDriver implements Driver {
  name = 'browser-localstorage';
  private data: { kv: Record<string, string>; rec: RecordRow[] } = { kv: {}, rec: [] };

  async init() {
    try { const raw = localStorage.getItem(KEY); if (raw) this.data = JSON.parse(raw); } catch { /* start empty */ }
  }
  private save() { localStorage.setItem(KEY, JSON.stringify(this.data)); }

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
  async reset() { this.data = { kv: {}, rec: [] }; localStorage.removeItem(KEY); }
}
