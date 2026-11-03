/**
 * Stock sync as MOVEMENTS (pure functions, no network, easy to test).
 *
 * Problem this solves: stock lives inside each product, and products sync as whole records, so two devices selling the
 * same item offline would overwrite each other's stock count (last writer wins). Instead:
 *  - a device never uploads its stock number. It uploads the CHANGE (a "move": +/- on stock, unitsSold, startingStock),
 *    keyed by a client UUID so a retry can never apply it twice;
 *  - the server adds every move to the product atomically (trigger in supabase/migrations/6_stock_moves.sql) and ignores
 *    stock numbers sent in a plain product upload;
 *  - when a device pulls a product, its stock becomes  server value + moves not yet uploaded + changes made since.
 *
 * `acct` (per product) = the local stock values already accounted for by the server or by a queued move.
 * So  local - acct  = a change made on this device that has not been turned into a move yet.
 */
export type StockVals = { stock: number; unitsSold: number; startingStock: number };
export type Move = { id: string; productId: string; d: StockVals; ts: number };

const FIELDS: (keyof StockVals)[] = ['stock', 'unitsSold', 'startingStock'];
const round = (x: number) => Math.round(x * 1e6) / 1e6; // quantities can be fractional (litres, kg): no float noise
const num = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

export const ZERO: StockVals = { stock: 0, unitsSold: 0, startingStock: 0 };
export const pickStock = (p: any): StockVals => ({ stock: num(p?.stock), unitsSold: num(p?.unitsSold), startingStock: num(p?.startingStock) });
export const addStock = (a: StockVals, b: StockVals): StockVals => ({ stock: round(a.stock + b.stock), unitsSold: round(a.unitsSold + b.unitsSold), startingStock: round(a.startingStock + b.startingStock) });
export const subStock = (a: StockVals, b: StockVals): StockVals => ({ stock: round(a.stock - b.stock), unitsSold: round(a.unitsSold - b.unitsSold), startingStock: round(a.startingStock - b.startingStock) });
export const isZero = (d: StockVals) => d.stock === 0 && d.unitsSold === 0 && d.startingStock === 0;

const stable = (v: any): string =>
  Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : JSON.stringify(v) ?? 'null';

/** Signature of everything EXCEPT the stock numbers: this is what decides whether a product needs a plain upload. */
export const sig = (p: any): string => { const { stock, unitsSold, startingStock, ...rest } = p || {}; return stable(rest); };
export const sigOfJson = (json: string | undefined): string => { try { return sig(JSON.parse(json as string)); } catch { return ''; } };

/** Step 0 of a sync: what changed in stock here since it was last accounted for? Only for products the server already knows
 *  (a brand new product carries its current stock in its first upload instead). */
export function deriveMoves(products: any[], hashes: Record<string, string>, acct: Record<string, StockVals>) {
  const nextAcct: Record<string, StockVals> = { ...acct };
  const moves: { productId: string; d: StockVals }[] = [];
  for (const p of products) {
    const h = hashes[p.id];
    if (h === undefined) continue;
    const cur = pickStock(p);
    let base = nextAcct[p.id];
    if (!base) { try { base = pickStock(JSON.parse(h)); } catch { base = cur; } }
    const d = subStock(cur, base);
    if (!isZero(d)) moves.push({ productId: p.id, d });
    nextAcct[p.id] = cur;
  }
  return { moves, acct: nextAcct };
}

/** Total of the moves still waiting to upload, per product (the server value does not include them yet). */
export function sumPending(moves: Move[]): Record<string, StockVals> {
  const out: Record<string, StockVals> = {};
  for (const m of moves) out[m.productId] = addStock(out[m.productId] || ZERO, m.d);
  return out;
}

/**
 * Step 2 of a sync: fold the products changed on the server into the local list. Does not modify its inputs.
 *  - other fields (name, price...): the server copy, unless this device edited them and has not uploaded yet (then ours wins);
 *  - stock numbers: server value + pending moves + changes made here since the last accounting.
 */
export function mergePulled(prev: any[], hashes: Record<string, string>, acct: Record<string, StockVals>,
                            pending: Record<string, StockVals>, pulled: { id: string; data: any }[]) {
  const map = new Map<string, any>(prev.map(p => [p.id, p]));
  const nextHashes = { ...hashes };
  const nextAcct = { ...acct };
  for (const r of pulled) {
    const local = map.get(r.id);
    const S = pickStock(r.data);
    if (!local) { map.set(r.id, r.data); nextHashes[r.id] = JSON.stringify(r.data); nextAcct[r.id] = S; continue; }

    const target = addStock(S, pending[r.id] || ZERO);                 // what the server + queued moves add up to
    const unmoved = subStock(pickStock(local), acct[r.id] || pickStock(local)); // changed here, not turned into a move yet
    const edited = hashes[r.id] === undefined || sigOfJson(hashes[r.id]) !== sig(local); // name/price... edited here, not uploaded
    const val = addStock(target, unmoved);

    let merged: any = edited ? { ...local } : { ...r.data };
    for (const f of FIELDS) if (local[f] !== undefined || r.data[f] !== undefined || val[f] !== 0) merged[f] = val[f];
    if (!edited) nextHashes[r.id] = JSON.stringify(r.data);
    nextAcct[r.id] = target;
    map.set(r.id, JSON.stringify(merged) === JSON.stringify(local) ? local : merged);
  }
  return { list: Array.from(map.values()), hashes: nextHashes, acct: nextAcct };
}
