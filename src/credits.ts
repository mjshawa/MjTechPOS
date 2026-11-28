/**
 * Customer credit (selling now, paying later): pure helpers (no React), so the SAME maths is used at the till,
 * on the Credits screen, in the owner's Staff Drawers and in the shift records.
 *
 *  - A credit SALE is a normal sale with method 'credit' and sale.credit = { customerId, customerName, phone, dueDate, note }.
 *    It reduces stock and counts as a sale, but NO money is received, so it never touches the cash drawer.
 *  - A credit PAYMENT (append-only, synced like refunds) is money received later: cash / mobile money / card.
 *    Cash received goes into the drawer of the staff member who collected it, in the shift it was collected.
 *  - What a customer owes = their credit sales - refunds on those sales - payments received. Payments are matched to the
 *    OLDEST unpaid sale first.
 *  - The owner approves credit customers and sets a limit for each. A limit left empty means "no limit".
 */

export const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

export type CreditCustomer = {
  kind: 'cust'; id: string; name: string; phone: string;
  limit: number | null;      // most this customer may owe at one time; null = no limit
  blocked: boolean;          // no more credit until the owner unblocks
  createdAt: number; createdBy: string; addedByStaff?: boolean;
};
export type CreditPolicy = { kind: 'cpol'; staffMayAdd: boolean; defaultLimit: number | null };
export const DEFAULT_POLICY: CreditPolicy = { kind: 'cpol', staffMayAdd: false, defaultLimit: 100 };

export const isCreditSale = (s: any) => (s?.method || s?.paymentMethod) === 'credit' && !!s?.credit?.customerId;
export const payLabel = (m: string) => (m === 'mobile' ? 'Mobile money' : m === 'card' ? 'Card' : m === 'cash' ? 'Cash' : m === 'credit' ? 'On credit' : m || '-');

/** "2026-12-05" -> the end of that day, or null */
export const dueTs = (d: any): number | null => {
  if (!d || typeof d !== 'string') return null;
  const t = new Date(`${d}T23:59:59`).getTime();
  return isNaN(t) ? null : t;
};

export type SaleRow = { sale: any; due: number; paid: number; open: number; overdue: boolean };
export type CustLedger = {
  id: string; billed: number; refunded: number; paid: number; balance: number;
  rows: SaleRow[]; openRows: SaleRow[]; payments: any[]; lastTs: number; overdue: boolean; overdueAmount: number;
};

/** One ledger line per customer id, from every credit sale, refund and (non-cancelled) payment. */
export function buildLedger(sales: any[], refunds: any[], payments: any[], now = Date.now()): Map<string, CustLedger> {
  const out = new Map<string, CustLedger>();
  const creditSales = sales.filter(isCreditSale);
  const saleIds = new Set(creditSales.map(s => s.id));
  const refBySale = new Map<string, number>();
  refunds.forEach(r => { if (saleIds.has(r.saleId)) refBySale.set(r.saleId, (refBySale.get(r.saleId) || 0) + (r.amount || 0)); });

  const get = (id: string): CustLedger => {
    if (!out.has(id)) out.set(id, { id, billed: 0, refunded: 0, paid: 0, balance: 0, rows: [], openRows: [], payments: [], lastTs: 0, overdue: false, overdueAmount: 0 });
    return out.get(id)!;
  };
  const byCust = new Map<string, any[]>();
  creditSales.forEach(s => { const a = byCust.get(s.credit.customerId) || []; a.push(s); byCust.set(s.credit.customerId, a); });
  payments.forEach(p => { if (p.customerId) get(p.customerId).payments.push(p); });

  byCust.forEach((list, id) => {
    const L = get(id);
    list.sort((a, b) => a.ts - b.ts);
    let pool = L.payments.reduce((a, p) => a + (p.amount || 0), 0);
    L.paid = r2(pool);
    list.forEach(s => {
      const refunded = Math.min(s.total || 0, refBySale.get(s.id) || 0);
      const due = r2((s.total || 0) - refunded);
      const apply = Math.min(pool, due); pool -= apply;
      const open = r2(due - apply);
      const dt = dueTs(s.credit?.dueDate);
      const overdue = open > EPS && dt !== null && dt < now;
      const row = { sale: s, due, paid: r2(apply), open, overdue };
      L.rows.push(row);
      L.billed += s.total || 0; L.refunded += refunded;
      if (open > EPS) { L.openRows.push(row); L.balance += open; if (overdue) { L.overdue = true; L.overdueAmount += open; } }
      L.lastTs = Math.max(L.lastTs, s.ts || 0);
    });
    L.billed = r2(L.billed); L.refunded = r2(L.refunded); L.balance = r2(L.balance); L.overdueAmount = r2(L.overdueAmount);
    L.payments.sort((a, b) => b.ts - a.ts);
  });
  return out;
}

export const balanceOf = (ledger: Map<string, CustLedger>, id: string) => ledger.get(id)?.balance || 0;

/** May this customer be given `amount` more on credit right now? (Staff are stopped; the owner may override.) */
export function checkGive(c: CreditCustomer | undefined, balance: number, amount: number): { ok: boolean; reason: string; room: number | null } {
  if (!c) return { ok: false, reason: 'Choose the customer who is taking credit.', room: null };
  if (c.blocked) return { ok: false, reason: `${c.name} is blocked from credit. Ask the owner.`, room: 0 };
  if (c.limit === null || c.limit === undefined) return { ok: true, reason: '', room: null };
  const room = r2(c.limit - balance);
  if (amount > room + EPS) return { ok: false, reason: `${c.name} can only take ${Math.max(0, room)} more on credit (limit ${c.limit}, already owes ${balance}).`, room: Math.max(0, room) };
  return { ok: true, reason: '', room: Math.max(0, room) };
}

/** Credit given by one staff member in a time window (used for drawers and shifts). */
export function creditGiven(sales: any[], match: (s: any) => boolean) {
  const mine = sales.filter(s => isCreditSale(s) && match(s));
  return { count: mine.length, total: r2(mine.reduce((a, s) => a + (s.total || 0), 0)) };
}
