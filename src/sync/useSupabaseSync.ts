import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { usePersistentState } from '../storage';
import { EMPTY_BUSINESS } from '../brand';
import { syncMutableRecords } from './mutableSync';
import { uid } from '../auth/crypto';
import { deriveMoves, mergePulled, pickStock, sig, sigOfJson, sumPending } from './stockMerge';

/**
 * SQLite stays the source of truth on the device. This hook mirrors it to Supabase:
 *
 *  1. PUSH outbox  – sales + closed shifts + deliveries + expenses, oldest first. Insert-only with ON CONFLICT DO NOTHING on the
 *                    client UUID, so a retry after a lost response can never double-count a sale.
 *  1c. PUSH stock moves – STOCK is never uploaded as a number. Each change (a sale, a delivery, a stock count) becomes a
 *                    move with a client UUID; the server adds it to the product atomically and ignores a retry. So two devices
 *                    selling the same item can no longer overwrite each other (see stockMerge.ts, migrations/6_stock_moves.sql).
 *  2. PULL catalog – products changed on the server since our cursor (server-side updated_at).
 *                    Name/price edited locally and not yet pushed win over the incoming copy; stock = server + our unsent moves.
 *  3. PUSH catalog – products whose NON-stock content differs from the last version we synced (new products carry their stock).
 *
 * Runs on sign-in, every 30 s, when the network returns, and right after each sale/shift is queued.
 * Offline = every step is skipped and retried later; nothing is lost.
 */
export function useSupabaseSync({ outbox, setOutbox, products, setProducts, collections, tabs, setTabs, business, setBusiness, storeId, workspace }: {
  outbox: any[]; setOutbox: any; products: any[]; setProducts: any; collections: Record<string, any>;
  tabs: any[]; setTabs: any; business: any; setBusiness: any; // open bar tabs and the business details are synced too
  storeId: string;   // e.g. bar-main-bar / bar-main-retail: Bar and Retail never mix on the server
  workspace: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = usePersistentState(`${workspace}:sync:lastSync`, 0);
  const [lastPull, setLastPull] = usePersistentState(`${workspace}:sync:lastPull`, '1970-01-01T00:00:00Z');
  const [hashes, setHashes] = usePersistentState(`${workspace}:sync:productHashes`, {});
  // Stock sync bookkeeping, ONE record so it is saved atomically: queued moves + the stock values they already account for.
  // Declared right after the hashes so a crash can never leave "hashes updated, ledger not" the wrong way round (see stockMerge.ts).
  const [ledger, setLedger] = usePersistentState(`${workspace}:sync:stockLedger`, { acct: {}, moves: [] });
  const [cursors, setCursors] = usePersistentState(`${workspace}:sync:cursors`, {});
  const [mut, setMut] = usePersistentState(`${workspace}:sync:mutable`, {}); // hashes + cursors for open tabs and business details

  // Always-fresh copies so the (stable) sync function never reads stale state.
  const ref = useRef<any>({});
  ref.current = { outbox, products, hashes, lastPull, session, cursors, collections, tabs, business, mut, ledger };
  const running = useRef(false);
  const stockTableOk = useRef(false);

  const syncNow = useCallback(async () => {
    if (!supabase || running.current || !navigator.onLine || !ref.current.session) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      // 1. PUSH outbox (sales, closed shifts)
      for (const item of ref.current.outbox) {
        if (item.failed) continue;
        const table = item.table || 'sales';
        const row: any = table === 'closed_shifts'
          ? { id: item.id, store_id: storeId, payload: item.payload, closed_at: new Date(item.payload.closedAt).toISOString() }
          : { id: item.id, store_id: storeId, payload: item.payload, created_at: new Date(item.payload.ts).toISOString() };
        const { error: err } = await supabase.from(table).upsert(row, { onConflict: 'id', ignoreDuplicates: true });
        if (!err) {
          setOutbox((p: any[]) => p.filter(o => o.id !== item.id));
        } else if (/^(22|23)/.test((err as any).code || '')) {
          setOutbox((p: any[]) => p.map(o => (o.id === item.id ? { ...o, failed: true } : o))); // bad data: park it
        } else if (['42P01', 'PGRST205'].includes((err as any).code)) {
          setError(`Table "${table}" is missing in Supabase. Run the files in supabase/migrations/ (2_stock_log.sql, 3_expenses.sql, 4_refunds.sql).`);
          continue; // leave it queued, but don't hold up sales behind it
        } else {
          throw err; // auth/network/server problem: stop, retry later (order preserved)
        }
      }

      // 1c. STOCK MOVES. (Sales above are already safe; if this table is missing we stop here rather than let plain product
      //     uploads overwrite stock the old way and then double count when the table appears.)
      if (!stockTableOk.current) {
        const { error: e0 } = await supabase.from('stock_moves').select('id').eq('store_id', storeId).limit(1);
        if (e0) {
          if (['42P01', 'PGRST205'].includes((e0 as any).code)) throw new Error('Table "stock_moves" is missing in Supabase. Run supabase/migrations/6_stock_moves.sql (stock now syncs as movements).');
          throw e0;
        }
        stockTableOk.current = true;
      }
      const hashes0: Record<string, string> = ref.current.hashes;
      const ledger0 = ref.current.ledger || { acct: {}, moves: [] };
      const derived = deriveMoves(ref.current.products, hashes0, ledger0.acct || {});
      let acct: Record<string, any> = derived.acct;
      let queue: any[] = [...(ledger0.moves || []), ...derived.moves.map(m => ({ id: uid(), productId: m.productId, d: m.d, ts: Date.now() }))];
      if (derived.moves.length) setLedger({ acct, moves: queue }); // saved together: the moves AND what they account for
      while (queue.length) {
        const chunk = queue.slice(0, 200);
        const { error: err } = await supabase.from('stock_moves').upsert(
          chunk.map(m => ({ id: m.id, store_id: storeId, product_id: m.productId, d_stock: m.d.stock, d_sold: m.d.unitsSold, d_start: m.d.startingStock, created_at: new Date(m.ts).toISOString() })),
          { onConflict: 'id', ignoreDuplicates: true });
        if (err) throw err; // stay queued, retry later (idempotent)
        queue = queue.slice(chunk.length);
        setLedger({ acct, moves: queue });
      }

      // 1b. PULL what OTHER devices recorded (sales, closed shifts, deliveries), so the owner sees the bar and the
      //     retail store together. Rows are matched by id, so our own uploads coming back change nothing.
      const sortKey: Record<string, string> = { sales: 'ts', closed_shifts: 'closedAt', stock_log: 'ts', expenses: 'ts', refunds: 'ts' };
      const nextCursors: Record<string, string> = { ...ref.current.cursors };
      for (const table of ['sales', 'closed_shifts', 'stock_log', 'expenses', 'refunds']) {
        let c: string = nextCursors[table] || new Date(Date.now() - 60 * 86400000).toISOString(); // first pull: last 60 days
        for (;;) {
          const { data, error: err } = await supabase.from(table).select('id, payload, received_at')
            .eq('store_id', storeId).gt('received_at', new Date(Date.parse(c) - 10000).toISOString()) // 10 s overlap, de-duplicated below
            .order('received_at', { ascending: true }).limit(1000);
          if (err) { if (['42P01', 'PGRST205'].includes((err as any).code)) break; throw err; }
          if (!data || !data.length) break;
          const incoming = data.map((r: any) => r.payload);
          const key = sortKey[table];
          ref.current.collections[table]((prev: any[]) => {
            const have = new Set(prev.map(x => x.id));
            const add = incoming.filter((x: any) => !have.has(x.id));
            return add.length ? [...add, ...prev].sort((a, b) => (b[key] || 0) - (a[key] || 0)) : prev;
          });
          const newest = data[data.length - 1].received_at;
          if (newest <= c && data.length < 1000) break;
          c = newest;
          if (data.length < 1000) break;
        }
        nextCursors[table] = c;
      }
      setCursors(nextCursors);

      // 2. PULL catalog changes
      let cursor: string = ref.current.lastPull;
      let pulled: any[] = [];
      for (;;) {
        const { data, error: err } = await supabase.from('products')
          .select('id, data, updated_at').eq('store_id', storeId).gt('updated_at', cursor)
          .order('updated_at', { ascending: true }).limit(1000);
        if (err) throw err;
        if (!data || !data.length) break;
        pulled = pulled.concat(data);
        cursor = data[data.length - 1].updated_at;
        if (data.length < 1000) break;
      }
      // Fold the server's products into ours. The inputs are captured as constants: the updater below runs later, on the
      // newest local list, so a sale made while this sync was running is kept.
      const acct0 = acct;
      const pendingSum = sumPending(queue);
      const merged = mergePulled(ref.current.products, hashes0, acct0, pendingSum, pulled);
      if (pulled.length) setProducts((prev: any[]) => mergePulled(prev, hashes0, acct0, pendingSum, pulled).list);
      acct = merged.acct;

      // 3. PUSH catalog changes: new products, and products whose name/price/etc. we changed (stock numbers never go this way)
      const nextHashes = merged.hashes;
      const dirty = merged.list.filter(p => nextHashes[p.id] === undefined || sigOfJson(nextHashes[p.id]) !== sig(p));
      for (let i = 0; i < dirty.length; i += 200) {
        const chunk = dirty.slice(i, i + 200);
        const { error: err } = await supabase.from('products')
          .upsert(chunk.map(p => ({ store_id: storeId, id: p.id, data: p })), { onConflict: 'store_id,id' });
        if (err) throw err;
        chunk.forEach(p => { if (nextHashes[p.id] === undefined) acct[p.id] = pickStock(p); nextHashes[p.id] = JSON.stringify(p); });
      }

      // 4. OPEN TABS and 5. BUSINESS DETAILS: small records that change over time. Same idea as products: pull what others changed,
      //    then push what we changed here (a record edited here and not yet pushed wins). A paid/closed tab is pushed as a tombstone.
      const mutNext: any = { ...ref.current.mut };
      let mutProblem = '';
      const runMutable = async (table: string, name: string, local: { id: string; data: any }[], pristine: (d: any) => boolean,
                                apply: (incoming: { id: string; data: any }[], removed: string[]) => void, tombstones: boolean) => {
        const problem = await syncMutableRecords(supabase, storeId, mutNext, table, name, local, pristine, apply, tombstones);
        if (problem) mutProblem = problem;
      };
      await runMutable('open_tabs', 'tabs', (ref.current.tabs || []).map((t: any) => ({ id: String(t.id), data: t })), () => false,
        (inc, rem) => setTabs((prev: any[]) => {
          const m = new Map(prev.map(t => [String(t.id), t]));
          rem.forEach(id => m.delete(id));
          inc.forEach(r => m.set(r.id, r.data));
          return Array.from(m.values()).sort((a: any, b: any) => (b.openedTs || 0) - (a.openedTs || 0));
        }), true);
      await runMutable('settings', 'settings', [{ id: 'business', data: ref.current.business }],
        d => JSON.stringify(d) === JSON.stringify(EMPTY_BUSINESS),            // never typed on this device yet: take the cloud copy, don't overwrite it
        inc => { const b = inc.find(r => r.id === 'business'); if (b) setBusiness(b.data); }, false);
      setMut(mutNext);
      if (mutProblem) setError(mutProblem);
      setHashes(nextHashes);
      setLedger({ acct, moves: queue });
      setLastPull(cursor);
      setLastSync(Date.now());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  // Auth session
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Triggers: sign-in, timer, network back
  useEffect(() => {
    const on = () => { setOnline(true); syncNow(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(syncNow, 30000);
    syncNow();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [session, syncNow]);
  useEffect(() => { syncNow(); }, [outbox.length]);
  // an open tab or the business details changed: upload soon (a short delay groups quick edits together)
  const mutKey = JSON.stringify(tabs) + JSON.stringify(business);
  useEffect(() => { const t = setTimeout(syncNow, 1500); return () => clearTimeout(t); }, [mutKey]);

  const pending = outbox.filter(o => !o.failed).length + ((ledger?.moves as any[])?.length || 0);
  const failed = outbox.filter(o => o.failed).length;
  const label = !supabase ? 'Saved on this device'
    : !session ? 'Sign in to back up online'
    : busy ? 'Uploading…'
    : !online ? `Offline${pending ? ` · ${pending} waiting` : ''}`
    : failed ? `${failed} could not upload`
    : pending ? `${pending} waiting to upload`
    : 'All uploaded';

  return {
    retryFailed() { setOutbox((p: any[]) => p.map(o => (o.failed ? { ...o, failed: false } : o))); setTimeout(syncNow, 300); },
    configured: !!supabase, session, online, busy, error, lastSync, pending, failed, label, syncNow,
    async signIn(email: string, password: string) {
      if (!supabase) return 'Supabase is not configured (.env)';
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      return err ? err.message : '';
    },
    async signOut() { await supabase?.auth.signOut(); },
  };
}
