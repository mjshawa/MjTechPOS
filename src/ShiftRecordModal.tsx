import React from 'react';
import { X, Printer } from 'lucide-react';
import MoneySimple, { dayLabel } from './MoneySimple';

/**
 * The complete record of ONE shift: money in by payment type, refunds, cost of goods, expenses, lost stock, profit,
 * the cash drawer, every item sold, every sale, each cashier, staff drawers and the stock count.
 * Everything is worked out from the very same records of that shift (see shiftReport in App.tsx).
 */
type Props = {
  report: any;
  title: string; // e.g. "Bar"
  money: (n: any) => string;
  fmtDateTime: (ts: number) => string;
  onClose: () => void;
  onPrint: (html: string) => void;
};

const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const neg = (n: number) => (n < 0 ? 'text-rose-400' : 'text-emerald-400');
const methodName = (m: string) => (m === 'mobile' ? 'Mobile money' : m === 'card' ? 'Card' : m === 'cash' ? 'Cash' : m || '-');

export function buildShiftRecordHtml(r: any, title: string, money: Props['money'], fmt: Props['fmtDateTime']): string {
  const row = (cells: any[], head = false) => `<tr>${cells.map((c, i) => `<${head ? 'th' : 'td'}${i > 0 && !head && typeof c === 'string' && /^[-\u2212]?[A-Z]{2,4} [\d,.]+$|^[\d,.]+$/.test(c) ? ' class="r"' : ''}>${esc(c)}</${head ? 'th' : 'td'}>`).join('')}</tr>`;
  const table = (head: string[], rows: any[][]) => `<table>${row(head, true)}${rows.map(x => row(x)).join('')}</table>`;
  const sec = (t: string, body: string) => `<h2>${esc(t)}</h2>${body}`;
  const kv = (rows: [string, string][]) => `<table class="kv">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r"><b>${esc(v)}</b></td></tr>`).join('')}</table>`;

  const parts: string[] = [];
  parts.push(`<h1>Shift Record: ${esc(title)}</h1><p>${esc(fmt(r.openedAt))} to ${r.closedAt ? esc(fmt(r.closedAt)) : 'still open'}${r.closedBy ? ` · closed by ${esc(r.closedBy)}` : ''}${r.deviceName ? ` · ${esc(r.deviceName)}` : ''}</p>`);
  parts.push(sec('Summary', kv([
    ['Number of sales', String(r.salesCount)],
    ['Total sold (before refunds)', money(r.grossSold)],
    ['Refunds', `-${money(r.refundTotal)} (${r.refundCount})`],
    ['NET SALES', money(r.netSales)],
    ['   Cash', money(r.byMethod.cash)], ['   Mobile money', money(r.byMethod.mobile)], ['   Card', money(r.byMethod.card)],
    ['Cost of goods sold', `-${money(r.cogs)}`],
    ['GROSS PROFIT', money(r.grossProfit)],
    ['Expenses', `-${money(r.expenseTotal)}`],
    ['Lost stock (End of Day count + write-offs)', `-${money(r.shrinkValue)}`],
    ['NET PROFIT', money(r.netProfit)],
  ])));
  parts.push(sec('Cash drawer', kv([
    ['Opening float', money(r.cash.float)], ['Cash sales (after cash refunds)', money(r.cash.sales)], ['Paid out of the till', `-${money(r.cash.tillOut)}`],
    ['Cash expected', money(r.cash.expected)], ['Cash counted', r.cash.counted == null ? 'not counted' : money(r.cash.counted)],
    ['Difference', r.cash.variance == null ? '-' : r.cash.variance === 0 ? 'correct' : r.cash.variance < 0 ? `missing ${money(Math.abs(r.cash.variance))}` : `extra ${money(r.cash.variance)}`],
  ])));
  parts.push(sec('Expenses', r.expenses.length ? table(['Time', 'Category', 'Paid to / note', 'Paid from', 'By', 'Amount'], r.expenses.map((e: any) => [fmt(e.ts), e.category, [e.payee, e.note].filter(Boolean).join(' · ') + (e.afterClose ? ' (added after close)' : ''), e.paidFromLabel, e.by || '', money(e.amount)])) : '<p>No expenses.</p>'));
  if (r.stockBuys.length) parts.push(sec('Stock bought with till cash (not an expense)', table(['Time', 'Supplier', 'Note', 'By', 'Amount'], r.stockBuys.map((e: any) => [fmt(e.ts), e.payee || '', e.note || '', e.by || '', money(e.amount)]))));
  parts.push(sec('Items sold', r.items.length ? table(['Item', 'Qty', 'Bottles/units out', 'Sales', 'Cost', 'Profit'], r.items.map((i: any) => [i.name, i.qty, i.bottles, money(i.revenue), money(i.cost), money(i.revenue - i.cost)])) : '<p>Nothing sold.</p>'));
  parts.push(sec('By cashier', r.staff.length ? table(['Cashier', 'Sales', 'Total', 'Cash', 'Mobile money', 'Card'], r.staff.map((s: any) => [s.name, s.count, money(s.total), money(s.cash), money(s.mobile), money(s.card)])) : '<p>No sales.</p>'));
  if (r.refundRows.length) parts.push(sec('Refunds', table(['Time', 'Receipt', 'Method', 'Reason', 'By', 'Amount'], r.refundRows.map((x: any) => [fmt(x.ts), x.txId || '', methodName(x.method), x.reason || '', x.by || '', `-${money(x.amount)}`]))));
  if (r.drawers.length) parts.push(sec('Staff drawers', table(['Staff', 'Float', 'Sales', 'Cash sales', 'Expected', 'Counted', 'Difference'], r.drawers.map((d: any) => [d.staffName, money(d.float), d.salesCount, money(d.cashSales), money(d.expected), money(d.counted), money(d.variance)]))));
  if (r.stock) parts.push(sec('Stock count at close', table(['Item', 'At start', 'Sold', 'Expected', 'Counted', 'Difference'], r.stock.map((p: any) => [p.name, p.start, p.sold, p.expected, p.actual, p.actual - p.expected]))));
  if (r.tabsOpen) parts.push(`<p>Open tabs left at close: ${r.tabsOpen.count} (${esc(money(r.tabsOpen.total))}). Their items were already taken out of stock.</p>`);
  parts.push(sec('Every sale', r.sales.length ? table(['Time', 'Receipt', 'Customer', 'Cashier', 'Paid by', 'Items', 'Total'], r.sales.map((s: any) => [fmt(s.ts), s.txId || '', s.customer || '', s.cashier || '', methodName(s.method || s.paymentMethod), (s.items || []).map((i: any) => `${i.qty}x ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', '), money(s.total)])) : '<p>No sales.</p>'));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shift Record</title><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:18px}
    h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:16px 0 4px;border-bottom:1px solid #999;padding-bottom:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:4px} th,td{border-bottom:1px solid #ddd;padding:3px 4px;text-align:left;vertical-align:top}
    th{background:#f0f0f0;font-size:10px;text-transform:uppercase} .r{text-align:right;white-space:nowrap} .kv td:first-child{width:60%}
  </style></head><body>${parts.join('')}</body></html>`;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wide">{title}</h4>
    {children}
  </div>
);

const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead className="text-slate-500 uppercase text-[10px]"><tr>{head.map((h, i) => <th key={i} className={`py-1 pr-3 ${i === 0 ? 'text-left' : 'text-left'}`}>{h}</th>)}</tr></thead>
      <tbody className="text-slate-300">
        {rows.map((r, i) => <tr key={i} className="border-t border-slate-800/70">{r.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top">{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

export default function ShiftRecordModal({ report: r, title, money, fmtDateTime, onClose, onPrint }: Props) {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[94vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold text-slate-100">{r.closedAt ? dayLabel(r.closedAt) : 'This shift'} · Your money</h3>
            <p className="text-xs text-slate-400">
              {fmtDateTime(r.openedAt)} → {r.closedAt ? fmtDateTime(r.closedAt) : 'still open'}
              {r.closedBy ? ` · closed by ${r.closedBy}` : ''}{r.deviceName ? ` · ${r.deviceName}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
        </div>

        <MoneySimple r={r} money={money} />

        <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wide pt-2 border-t border-slate-800">More details (for the owner)</h4>

        <Section title={`Expenses (${money(r.expenseTotal)})`}>
          {r.expenses.length === 0 ? <p className="text-xs text-slate-500">No expenses were recorded for this shift.</p> : (
            <Table head={['Time', 'Category', 'Paid to / note', 'Paid from', 'By', 'Amount']}
              rows={r.expenses.map((e: any) => [fmtDateTime(e.ts), e.category, <>{[e.payee, e.note].filter(Boolean).join(' · ')}{e.afterClose && <span className="text-amber-400"> (added after close)</span>}</>, e.paidFromLabel, e.by || '', <span className="font-mono text-rose-400">-{money(e.amount)}</span>])} />
          )}
        </Section>

        {r.stockBuys.length > 0 && (
          <Section title="Stock bought with till cash (not an expense)">
            <Table head={['Time', 'Supplier', 'Note', 'By', 'Amount']} rows={r.stockBuys.map((e: any) => [fmtDateTime(e.ts), e.payee || '', e.note || '', e.by || '', <span className="font-mono">{money(e.amount)}</span>])} />
          </Section>
        )}

        <Section title="Items sold">
          {r.items.length === 0 ? <p className="text-xs text-slate-500">Nothing was sold.</p> : (
            <Table head={['Item', 'Qty', 'Out of stock', 'Sales', 'Cost', 'Profit']}
              rows={r.items.map((i: any) => [i.name, i.qty, i.bottles, <span className="font-mono">{money(i.revenue)}</span>, <span className="font-mono">{money(i.cost)}</span>, <span className={`font-mono ${neg(i.revenue - i.cost)}`}>{money(i.revenue - i.cost)}</span>])} />
          )}
          <p className="text-[11px] text-slate-500">Item sales are at list price before any discount and before refunds.</p>
        </Section>

        <Section title="By cashier">
          {r.staff.length === 0 ? <p className="text-xs text-slate-500">No sales.</p> : (
            <Table head={['Cashier', 'Sales', 'Total', 'Cash', 'Mobile money', 'Card']}
              rows={r.staff.map((s: any) => [s.name, s.count, <span className="font-mono">{money(s.total)}</span>, <span className="font-mono">{money(s.cash)}</span>, <span className="font-mono">{money(s.mobile)}</span>, <span className="font-mono">{money(s.card)}</span>])} />
          )}
        </Section>

        {r.refundRows.length > 0 && (
          <Section title="Refunds">
            <Table head={['Time', 'Receipt', 'Method', 'Reason', 'By', 'Amount']}
              rows={r.refundRows.map((x: any) => [fmtDateTime(x.ts), x.txId || '', methodName(x.method), x.reason || '', x.by || '', <span className="font-mono text-rose-400">-{money(x.amount)}</span>])} />
          </Section>
        )}

        {r.drawers.length > 0 && (
          <Section title="Staff drawers">
            <Table head={['Staff', 'Float', 'Sales', 'Cash sales', 'Expected', 'Counted', 'Difference']}
              rows={r.drawers.map((d: any) => [d.staffName, money(d.float), d.salesCount, money(d.cashSales), money(d.expected), money(d.counted), <span className={d.variance === 0 ? 'text-emerald-400' : d.variance < 0 ? 'text-rose-400' : 'text-amber-400'}>{money(d.variance)}</span>])} />
          </Section>
        )}

        <Section title="Stock count at close">
          {r.stock ? (
            <Table head={['Item', 'At start', 'Sold', 'Expected', 'Counted', 'Difference']}
              rows={r.stock.map((p: any) => [p.name, p.start, p.sold, p.expected, p.actual, <span className={p.actual - p.expected === 0 ? 'text-slate-400' : 'text-rose-400'}>{p.actual - p.expected}</span>])} />
          ) : <p className="text-xs text-slate-500">The stock count was not saved for this shift (it was closed before this record existed).</p>}
          {r.tabsOpen && <p className="text-[11px] text-slate-400">Open tabs left at close: {r.tabsOpen.count} ({money(r.tabsOpen.total)}). Their items were already taken out of stock.</p>}
        </Section>

        <Section title={`Every sale (${r.salesCount})`}>
          {r.sales.length === 0 ? <p className="text-xs text-slate-500">No sales in this shift.</p> : (
            <Table head={['Time', 'Receipt', 'Customer', 'Cashier', 'Paid by', 'Items', 'Total']}
              rows={r.sales.map((s: any) => [fmtDateTime(s.ts), s.txId || '', s.customer || '', s.cashier || '', methodName(s.method || s.paymentMethod), (s.items || []).map((i: any) => `${i.qty}x ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', '), <span className="font-mono">{money(s.total)}</span>])} />
          )}
        </Section>

        <div className="flex gap-2 pt-2">
          <button onClick={() => onPrint(buildShiftRecordHtml(r, title, money, fmtDateTime))}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700">
            <Printer className="h-4 w-4" /> Print full record
          </button>
          <button onClick={onClose} className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl">Close</button>
        </div>
      </div>
    </div>
  );
}
