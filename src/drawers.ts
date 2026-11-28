/**
 * Staff cash drawers: pure helpers (no React), so the SAME maths is used when a drawer is closed and when the owner reviews it.
 *
 * One drawer = one staff member's cash for one stretch of work:
 *   should be in drawer = starting cash + their cash sales - cash refunds on their sales - cash they paid out of the till
 * The staff member counts the cash and types it WITHOUT seeing the expected figure (a "blind count"). The owner sees the
 * difference: tick = exact, cross = short or over.
 */

/** false = staff only see that their count was handed in. true = they also see their own tick/cross and the difference. */
export const STAFF_SEE_RESULT = false;

const EPS = 0.005;
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** A drawer that is open right now (kept on the device until the staff member closes it). */
export type OpenDrawer = { staffId: string; staffName: string; openedAt: number; float: number; deviceId: string };

export type Verdict = 'ok' | 'short' | 'over' | 'none';
export const verdictOf = (variance: number | null | undefined): Verdict =>
  variance === null || variance === undefined || isNaN(variance as number) ? 'none' : Math.abs(variance) < EPS ? 'ok' : variance < 0 ? 'short' : 'over';

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Does a record (sale / expense) belong to this staff member? Newer records carry the id; older ones only the name. */
const isMine = (id: any, name: any, staffId: string, staffName: string) => (id ? id === staffId : !!name && name === staffName);
const onDevice = (recDeviceId: any, deviceId: string) => !recDeviceId || recDeviceId === deviceId;

export type Figures = {
  salesCount: number; salesTotal: number; cashSales: number; cashRefunds: number; tillExpenses: number; stockBought: number;
  // how this staff member's sales were paid, credit given (nothing received yet) and debts collected in this drawer
  mobileSales?: number; cardSales?: number; creditCount?: number; creditTotal?: number;
  collectedCash?: number; collectedMobile?: number; collectedCard?: number;
};

/** Everything that should be reflected in one staff member's drawer between `from` and `to` on one device. */
export function drawerFigures(o: {
  staffId: string; staffName: string; from: number; to: number; deviceId: string;
  sales: any[]; refunds: any[]; liveExpenses: any[]; payments?: any[]; // payments = credit payments received (cancelled ones already removed)
}): Figures {
  const inWindow = (ts: number) => ts >= o.from && ts <= o.to;
  const mine = o.sales.filter(s => inWindow(s.ts) && onDevice(s.deviceId, o.deviceId) && isMine(s.cashierId, s.cashier, o.staffId, o.staffName));
  const saleById = new Map<string, any>(o.sales.map(s => [s.id, s]));
  const cashSales = mine.filter(s => (s.method || s.paymentMethod) === 'cash').reduce((a, s) => a + (s.total || 0), 0);
  // A cash refund comes out of the drawer of whoever rang the original sale.
  const cashRefunds = o.refunds.filter(r => {
    if (r.method !== 'cash' || !inWindow(r.ts)) return false;
    const s = saleById.get(r.saleId);
    return !!s && onDevice(s.deviceId, o.deviceId) && isMine(s.cashierId, s.cashier, o.staffId, o.staffName);
  }).reduce((a, r) => a + (r.amount || 0), 0);
  // Cash that left the drawer: running costs (ice, transport...) and stock bought with drawer cash. Both are real money out of the
  // drawer, but only the first is an expense; stock is kept apart because it is not a cost until it is sold.
  const cashOut = o.liveExpenses.filter(e =>
    e.paidFrom === 'till' && inWindow(e.ts) && isMine(e.byId, e.by, o.staffId, o.staffName) &&
    (!e.shiftKey || String(e.shiftKey).startsWith(`${o.deviceId}:`))
  );
  const tillExpenses = cashOut.filter(e => e.kind !== 'stockbuy').reduce((a, e) => a + (e.amount || 0), 0);
  const stockBought = cashOut.filter(e => e.kind === 'stockbuy').reduce((a, e) => a + (e.amount || 0), 0);
  const sumBy = (m: string) => r2(mine.filter(s => (s.method || s.paymentMethod) === m).reduce((a, s) => a + (s.total || 0), 0));
  const credit = mine.filter(s => (s.method || s.paymentMethod) === 'credit');
  // Money received from credit customers by this staff member: cash goes into THIS drawer.
  const got = (o.payments || []).filter(p => p.kind === 'creditpay' && inWindow(p.ts) && onDevice(p.deviceId, o.deviceId) && isMine(p.byId, p.by, o.staffId, o.staffName));
  const gotBy = (m: string) => r2(got.filter(p => p.method === m).reduce((a, p) => a + (p.amount || 0), 0));
  return {
    salesCount: mine.length, salesTotal: r2(mine.reduce((a, s) => a + (s.total || 0), 0)), cashSales: r2(cashSales), cashRefunds: r2(cashRefunds), tillExpenses: r2(tillExpenses), stockBought: r2(stockBought),
    mobileSales: sumBy('mobile'), cardSales: sumBy('card'), creditCount: credit.length, creditTotal: r2(credit.reduce((a, s) => a + (s.total || 0), 0)),
    collectedCash: gotBy('cash'), collectedMobile: gotBy('mobile'), collectedCard: gotBy('card'),
  };
}

export const expectedCash = (float: number, f: Figures) => r2(float + f.cashSales + (f.collectedCash || 0) - f.cashRefunds - f.tillExpenses - (f.stockBought || 0));

/** A row of the owner's per-staff record: one closed drawer, or a stretch of sales nobody counted. */
export type DayRow = {
  id: string; day: string; ts: number; openedAt: number; closedAt: number | null;
  salesCount: number; salesTotal: number; float: number; stockBought: number; tillExpenses: number; expected: number | null; counted: number | null; variance: number | null;
  verdict: Verdict; noCount: boolean; open: boolean; closedBy?: string;
  // payment split of this shift (hasSplit = false for drawers closed before credit existed)
  hasSplit: boolean; cashSales: number; mobileSales: number; cardSales: number; creditCount: number; creditTotal: number; collected: number;
};
export type StaffRecord = {
  key: string; id: string; name: string; rows: DayRow[];
  daysWorked: number; counted: number; ok: number; bad: number; shortTotal: number; overTotal: number; noCountDays: number; salesTotal: number;
  creditCount: number; creditTotal: number;
};

/**
 * Builds the owner's per-staff history from closed drawers, drawers still open, and sales nobody counted.
 * `staff` is the list of accounts (so people with no work yet still appear); `ownerIds` are left out (the owner's own sales need no drawer).
 */
export function buildStaffRecords(o: {
  drawers: any[]; open: OpenDrawer[]; sales: any[]; staff: { id: string; name: string; role?: string }[]; from: number;
}): StaffRecord[] {
  const ownerIds = new Set(o.staff.filter(s => s.role === 'owner').map(s => s.id));
  const nameOf = new Map(o.staff.map(s => [s.id, s.name]));
  const keyOf = (id: any, name: any) => (id ? `id:${id}` : `name:${name}`);
  const map = new Map<string, StaffRecord>();
  const rec = (id: any, name: any) => {
    const key = keyOf(id, name);
    if (!map.has(key)) map.set(key, { key, id: id || '', name: (id && nameOf.get(id)) || name || 'Unknown', rows: [], daysWorked: 0, counted: 0, ok: 0, bad: 0, shortTotal: 0, overTotal: 0, noCountDays: 0, salesTotal: 0, creditCount: 0, creditTotal: 0 });
    return map.get(key)!;
  };
  o.staff.filter(s => s.role !== 'owner').forEach(s => rec(s.id, s.name));

  o.drawers.filter(d => d.openedAt >= o.from).forEach(d => {
    rec(d.staffId, d.staffName).rows.push({
      id: d.id, day: dayKey(d.openedAt), ts: d.closedAt, openedAt: d.openedAt, closedAt: d.closedAt,
      salesCount: d.salesCount || 0, salesTotal: d.salesTotal || 0, float: d.float || 0, stockBought: d.stockBought || 0, tillExpenses: d.tillExpenses || 0, expected: d.expected ?? null, counted: d.counted ?? null,
      variance: d.variance ?? null, verdict: verdictOf(d.variance), noCount: false, open: false, closedBy: d.closedBy,
      hasSplit: d.mobileSales !== undefined, cashSales: d.cashSales || 0, mobileSales: d.mobileSales || 0, cardSales: d.cardSales || 0,
      creditCount: d.creditCount || 0, creditTotal: d.creditTotal || 0, collected: r2((d.collectedCash || 0) + (d.collectedMobile || 0) + (d.collectedCard || 0)),
    });
  });
  o.open.filter(d => d.openedAt >= o.from).forEach(d => {
    rec(d.staffId, d.staffName).rows.push({
      id: `open-${d.staffId}`, day: dayKey(d.openedAt), ts: d.openedAt, openedAt: d.openedAt, closedAt: null,
      salesCount: 0, salesTotal: 0, float: d.float, stockBought: 0, tillExpenses: 0, expected: null, counted: null, variance: null, verdict: 'none', noCount: false, open: true,
      hasSplit: false, cashSales: 0, mobileSales: 0, cardSales: 0, creditCount: 0, creditTotal: 0, collected: 0,
    });
  });

  // Sales that fall inside no drawer (staff sold without opening one, or never counted): shown per day as "not counted".
  const covered = (s: any) =>
    o.drawers.some(d => isMine(s.cashierId, s.cashier, d.staffId, d.staffName) && s.ts >= d.openedAt && s.ts <= d.closedAt && onDevice(s.deviceId, d.deviceId)) ||
    o.open.some(d => isMine(s.cashierId, s.cashier, d.staffId, d.staffName) && s.ts >= d.openedAt && onDevice(s.deviceId, d.deviceId));
  const loose = new Map<string, { id: any; name: any; day: string; ts: number; count: number; total: number; cash: number; mobile: number; card: number; cc: number; ct: number }>();
  o.sales.filter(s => s.ts >= o.from && !(s.cashierId && ownerIds.has(s.cashierId)) && !covered(s)).forEach(s => {
    const k = `${keyOf(s.cashierId, s.cashier)}|${dayKey(s.ts)}`;
    const g = loose.get(k) || { id: s.cashierId, name: s.cashier, day: dayKey(s.ts), ts: s.ts, count: 0, total: 0, cash: 0, mobile: 0, card: 0, cc: 0, ct: 0 };
    g.count += 1; g.total += s.total || 0; g.ts = Math.max(g.ts, s.ts);
    const m = s.method || s.paymentMethod || 'cash';
    if (m === 'cash') g.cash += s.total || 0; else if (m === 'mobile') g.mobile += s.total || 0; else if (m === 'card') g.card += s.total || 0; else if (m === 'credit') { g.cc += 1; g.ct += s.total || 0; }
    loose.set(k, g);
  });
  loose.forEach((g, k) => {
    rec(g.id, g.name).rows.push({
      id: `loose-${k}`, day: g.day, ts: g.ts, openedAt: g.ts, closedAt: g.ts, salesCount: g.count, salesTotal: r2(g.total),
      float: 0, stockBought: 0, tillExpenses: 0, expected: null, counted: null, variance: null, verdict: 'none', noCount: true, open: false,
      hasSplit: true, cashSales: r2(g.cash), mobileSales: r2(g.mobile), cardSales: r2(g.card), creditCount: g.cc, creditTotal: r2(g.ct), collected: 0,
    });
  });

  const out = [...map.values()];
  out.forEach(r => {
    r.rows.sort((a, b) => b.ts - a.ts);
    r.daysWorked = new Set(r.rows.map(x => x.day)).size;
    r.rows.forEach(x => {
      r.salesTotal += x.salesTotal; r.creditCount += x.creditCount; r.creditTotal += x.creditTotal;
      if (x.noCount) r.noCountDays += 1;
      if (x.verdict === 'none') return;
      r.counted += 1;
      if (x.verdict === 'ok') r.ok += 1; else r.bad += 1;
      if (x.verdict === 'short') r.shortTotal += -(x.variance as number);
      if (x.verdict === 'over') r.overTotal += x.variance as number;
    });
    r.salesTotal = r2(r.salesTotal); r.creditTotal = r2(r.creditTotal); r.shortTotal = r2(r.shortTotal); r.overTotal = r2(r.overTotal);
  });
  // Biggest shortage first, then most recent work; people with nothing to show go last.
  return out.sort((a, b) => b.shortTotal - a.shortTotal || (b.rows[0]?.ts || 0) - (a.rows[0]?.ts || 0) || a.name.localeCompare(b.name));
}
