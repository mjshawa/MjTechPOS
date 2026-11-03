import React, { useMemo, useState } from 'react';
import { RotateCcw, X, Search, Lock } from 'lucide-react';

/**
 * Sales list + refunds.
 *  - A sale is never edited or deleted. A refund is a NEW record pointing at the sale (append-only, synced like everything else).
 *  - A refund reduces the sales of the shift it is ISSUED in (the cash leaves the till today), not the shift of the original sale.
 *  - Partial refunds are supported; refunded quantities are tracked so an item cannot be refunded twice.
 *  - Owner and staff can issue a refund, only while the shift is open.
 */
export const lineKey = (i: any) => `${i.productId}|${i.variant || ''}`;
/** Share of the line price actually paid (accounts for any discount given on the whole sale). */
export const refundFactor = (sale: any) => (sale.subtotal > 0 ? (sale.grandTotal ?? sale.total) / sale.subtotal : 1);

export const REFUND_REASONS = ['Wrong item rung', 'Customer changed mind', 'Spilled / quality complaint', 'Overcharged', 'Other'];

type Period = 'shift' | '7d' | '30d';

export default function SalesView({
  shiftSales, allSales, refundedQty, refundsBySale, isOwner, isLocked, onRefund, shiftStart, money, fmtDateTime, currency,
}: {
  shiftSales: any[]; allSales: any[]; refundedQty: Map<string, Map<string, number>>; refundsBySale: Map<string, number>;
  isOwner: boolean; isLocked: boolean; shiftStart: number;
  onRefund: (p: { sale: any; lines: any[]; method: string; reason: string }) => void;
  money: (n: any) => string; fmtDateTime: (ts: number) => string; currency: string;
}) {
  const [period, setPeriod] = useState<Period>('shift');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<any>(null);

  const list = useMemo(() => {
    const base = period === 'shift' ? shiftSales : allSales.filter(s => s.ts >= Date.now() - (period === '7d' ? 7 : 30) * 864e5);
    const needle = q.trim().toLowerCase();
    return base
      .filter(s => !needle || `${s.txId} ${s.customer} ${s.cashier} ${(s.items || []).map((i: any) => i.name).join(' ')}`.toLowerCase().includes(needle))
      .slice(0, 100);
  }, [period, shiftSales, allSales, q]);

  const remainingFor = (sale: any) => (sale.items || []).map((i: any) => ({
    ...i, remaining: i.qty - (refundedQty.get(sale.id)?.get(lineKey(i)) || 0),
  }));

  return (
    <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2"><RotateCcw className="h-6 w-6 text-amber-400" /> Sales &amp; Refunds</h2>
            <p className="text-sm text-slate-400">Find a sale to look at it{' or refund it'}. Sales are never deleted. A refund is saved as a separate record.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Receipt, item, customer…"
                className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
            </div>
            {isOwner && (
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                {([['shift', 'This shift'], ['7d', '7 days'], ['30d', '30 days']] as [Period, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setPeriod(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLocked && (
          <p className="text-xs text-rose-400 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> The shift is closed. Refunds can be issued once a new shift is started.</p>
        )}

        {list.length === 0 ? (
          <p className="text-sm text-slate-500">No sales found.</p>
        ) : (
          <div className="space-y-2">
            {list.map((s: any) => {
              const refunded = refundsBySale.get(s.id) || 0;
              const left = remainingFor(s).reduce((a: number, i: any) => a + i.remaining, 0);
              return (
                <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs flex flex-wrap justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100 text-sm">
                      #{s.txId} <span className="text-slate-500 font-normal">· {fmtDateTime(s.ts)} · {s.method} · {s.cashier}</span>
                      {refunded > 0 && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">{left === 0 ? 'FULLY REFUNDED' : 'PART REFUNDED'}</span>}
                    </p>
                    <p className="text-slate-400">{(s.items || []).map((i: any) => `${i.qty}× ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ')}</p>
                    {s.customer && s.customer !== 'Walk-In Guest' && <p className="text-slate-500">{s.customer}</p>}
                  </div>
                  <div className="text-right flex items-start gap-3">
                    <div>
                      <p className="font-mono font-extrabold text-amber-400 text-base">{money(s.total)}</p>
                      {refunded > 0 && <p className="text-rose-400 font-mono">refunded -{money(refunded)}</p>}
                    </div>
                    {left > 0 && !isLocked && (
                      <button onClick={() => setTarget(s)} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold">Refund</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {list.length === 100 && <p className="text-[11px] text-slate-600">Showing the last 100 sales. Use search to find older ones.</p>}
      </div>

      {target && (
        <RefundModal sale={target} lines={remainingFor(target)} money={money} currency={currency}
          onClose={() => setTarget(null)}
          onConfirm={(p) => { onRefund({ sale: target, ...p }); setTarget(null); }} />
      )}
    </div>
  );
}

function RefundModal({ sale, lines, money, currency, onClose, onConfirm }: {
  sale: any; lines: any[]; money: (n: any) => string; currency: string; onClose: () => void;
  onConfirm: (p: { lines: any[]; method: string; reason: string }) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map(l => [lineKey(l), 0])));
  const [restock, setRestock] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.map(l => [lineKey(l), true])));
  const [method, setMethod] = useState(sale.method || 'cash');
  const [reason, setReason] = useState(REFUND_REASONS[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const factor = refundFactor(sale);
  const picked = lines.filter(l => (qty[lineKey(l)] || 0) > 0);
  const amount = Math.round(picked.reduce((a, l) => a + qty[lineKey(l)] * l.price, 0) * factor * 100) / 100;
  const allQty = () => setQty(Object.fromEntries(lines.map(l => [lineKey(l), l.remaining])));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked.length) { setError('Choose at least one item to refund.'); return; }
    if (reason === 'Other' && !note.trim()) { setError('Add a note for "Other".'); return; }
    if (!window.confirm(`Refund ${money(amount)} by ${method}? This cannot be undone.`)) return;
    onConfirm({
      lines: picked.map(l => ({ key: lineKey(l), productId: l.productId, name: l.name, variant: l.variant || null, size: l.size || 1, price: l.price, cost: l.cost || 0, qty: qty[lineKey(l)], restock: !!restock[lineKey(l)] })),
      method, reason: note.trim() ? `${reason}: ${note.trim()}` : reason,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl text-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-extrabold">Refund sale #{sale.txId}</h3>
            <p className="text-xs text-slate-400">Paid {money(sale.total)} by {sale.method}{factor < 1 ? ` · a discount applies (${(factor * 100).toFixed(0)}% of list price)` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-bold uppercase text-slate-500"><span>Items</span><button type="button" onClick={allQty} className="text-amber-400 normal-case">Refund everything</button></div>
          {lines.filter(l => l.remaining > 0).map(l => {
            const k = lineKey(l);
            return (
              <div key={k} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-slate-200">{l.name}{l.variant ? ` (${l.variant})` : ''}</span>
                  <span className="font-mono text-slate-400">{money(l.price)} · {l.remaining} left</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setQty({ ...qty, [k]: Math.max(0, (qty[k] || 0) - 1) })} className="w-8 h-8 rounded-lg bg-slate-800 font-bold">−</button>
                    <span className="w-8 text-center font-mono font-bold text-base">{qty[k] || 0}</span>
                    <button type="button" onClick={() => setQty({ ...qty, [k]: Math.min(l.remaining, (qty[k] || 0) + 1) })} className="w-8 h-8 rounded-lg bg-slate-800 font-bold">+</button>
                  </div>
                  <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={!!restock[k]} onChange={e => setRestock({ ...restock, [k]: e.target.checked })} />
                    Put back in stock
                  </label>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500">Untick "Put back in stock" if the item was spilled, damaged or already served. The cost will count as a loss.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="text-xs font-bold text-slate-400">Refund paid by</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm mt-1">
              <option value="cash">Cash (from till)</option><option value="mobile">Mobile money</option><option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm mt-1">
              {REFUND_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={`Note${reason === 'Other' ? ' (required)' : ' (optional)'}`}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500" />

        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button className="w-full py-3 bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-sm rounded-2xl">
          Refund {amount > 0 ? money(amount) : currency + ' 0.00'}
        </button>
      </form>
    </div>
  );
}
