import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Driver } from './types';
import { SqliteDriver } from './sqliteDriver';
import { WebDriver } from './webDriver';
import { IdbDriver } from './idbDriver';

// ───────── In-memory cache in front of SQLite ─────────
// Everything is loaded ONCE at startup (initStorage), so React state initialises synchronously.
// Every change is written through to SQLite in order, in the background.
let driver: Driver;
const kv = new Map<string, string>();
type Entry = { obj: any; json: string };
const collections = new Map<string, Map<string, Entry>>();

let queue: Promise<unknown> = Promise.resolve();
const enqueue = (fn: () => Promise<unknown>) => {
  queue = queue.then(fn).catch(e => console.error('[storage]', e));
};

async function pickDriver(): Promise<Driver> {
  if ((window as any).electronSQLite) {
    const { createElectronExecutor } = await import('./electronDriver');
    return new SqliteDriver('electron-sqlite', createElectronExecutor());
  }
  if (Capacitor.isNativePlatform()) {
    const { createCapacitorExecutor } = await import('./capacitorDriver');
    return new SqliteDriver('android-sqlite', await createCapacitorExecutor());
  }
  // Browser / installed PWA: IndexedDB (no 5 MB cap). localStorage only if IndexedDB is blocked (some private modes).
  if ('indexedDB' in window) {
    const idb = new IdbDriver();
    try { await idb.init(); return idb; } catch (e) { console.warn('[storage] IndexedDB unavailable, using localStorage', e); }
  }
  return new WebDriver();
}

export async function initStorage() {
  driver = await pickDriver();
  await driver.init();
  Object.entries(await driver.loadKv()).forEach(([k, v]) => kv.set(k, v));
  for (const r of await driver.loadRecords()) {
    if (!collections.has(r.collection)) collections.set(r.collection, new Map());
    collections.get(r.collection)!.set(r.id, { obj: JSON.parse(r.json), json: r.json });
  }
  console.info(`[storage] using ${driver.name}`);
}

export const storageName = () => driver?.name ?? 'none';

export async function resetAllData() {
  await queue;
  await driver.reset();
  window.location.reload();
}

/** Single value (object/array/number/bool) stored in the `kv` table. */
export function usePersistentState(key: string, initial: any): [any, React.Dispatch<React.SetStateAction<any>>] {
  const [value, setValue] = useState<any>(() => (kv.has(key) ? JSON.parse(kv.get(key)!) : initial));
  useEffect(() => {
    const json = JSON.stringify(value);
    if (kv.get(key) === json) return;
    kv.set(key, json);
    enqueue(() => driver.setKv(key, json));
  }, [key, value]);
  return [value, setValue];
}

/**
 * List of records with an `id`, one SQLite row each. Only rows that actually changed are written,
 * so a new sale writes one row, not the whole history.
 * newestFirst: the app prepends new items, so the list is restored in reverse insertion order.
 */
export function usePersistentCollection(
  name: string,
  initial: any[],
  opts: { newestFirst?: boolean } = {}
): [any[], React.Dispatch<React.SetStateAction<any[]>>] {
  const marker = `__col:${name}`;
  const [list, setList] = useState<any[]>(() => {
    if (kv.get(marker) !== '1') return initial; // first run: seed with defaults
    const arr = Array.from(collections.get(name)?.values() ?? [], e => e.obj);
    return opts.newestFirst ? arr.reverse() : arr;
  });

  useEffect(() => {
    if (!collections.has(name)) collections.set(name, new Map());
    const cache = collections.get(name)!;
    const seen = new Set<string>();
    const upserts: { id: string; json: string }[] = [];

    const ordered = opts.newestFirst ? [...list].reverse() : list; // oldest first => stable insertion order
    for (const item of ordered) {
      const id = String(item.id);
      seen.add(id);
      const entry = cache.get(id);
      if (entry && entry.obj === item) continue; // same object, nothing to do
      const json = JSON.stringify(item);
      cache.set(id, { obj: item, json });
      if (!entry || entry.json !== json) upserts.push({ id, json });
    }
    const removed = [...cache.keys()].filter(id => !seen.has(id));
    removed.forEach(id => cache.delete(id));

    if (kv.get(marker) !== '1') { kv.set(marker, '1'); enqueue(() => driver.setKv(marker, '1')); }
    if (upserts.length) enqueue(() => driver.upsertRecords(name, upserts));
    if (removed.length) enqueue(() => driver.deleteRecords(name, removed));
  }, [list]);

  return [list, setList];
}

/** Read-only snapshot of a stored collection (used by the Excel export to read BOTH workspaces, whichever one is open). */
export function readCollection(name: string): any[] {
  return Array.from(collections.get(name)?.values() ?? [], e => e.obj);
}
