import React, { useMemo, useState } from 'react';
import { Printer, Search } from 'lucide-react';

/**
 * Find an old sale and reprint its receipt (a customer lost theirs, the printer jammed, ...).
 * The owner can reprint any sale; a staff member can reprint only the sales they rang up themselves.
 * The reprint is clearly marked DUPLICATE COPY so it cannot pass for the original.
 */
type Props = {
  sales: any[];
  isOwner: boolean;
  user: { id: string; name: string };
  money: (n: any) => string;
  fmtDateTime: (ts: number) => string;
  onReprint: (sale: any) => void;
};

const SHOW_MAX = 60;
const dayOf = (ts: number) => { const d = new Date(ts); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const methodName = (m: string) => (m === 'mobile' ? 'Mobile money' : m === 'card' ? 'Card' : 'Cash');

export default function ReprintView({ sales, isOwner, user, money, fmtDateTime, onReprint }: Props) {
  const [q, setQ] = useState('');
  const [day, setDay] = useState('');

  const mine = useMemo(
    () => (isOwner ? sales : sales.filter((s: any) => (s.cashierId ? s.cashierId === user.id : s.cashier === user.name))),
    [sales, isOwner, user.id, user.name],
  );

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mine
      .filter((s: any) => (!day || dayOf(s.ts) === day))
      .filter((s: any) => {
        if (!needle) return true;
        const hay = [
          s.txId, s.customer, s.cashier, s.date, s.timestamp || s.time, String(s.total ?? s.grandTotal ?? ''),
          ...(s.items || []).map((i: any) => `${i.name} ${i.variant || ''}`),
        ].join(' ').toLowerCase();
        return hay.includes(needle);
      })
      .sort((a: any, b: any) => b.ts - a.ts);
  }, [mine, q, day]);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-100">Reprint Receipt</h2>
          <p className="text-sm text-slate-400">
            Lost a receipt? Find the sale and print it again. A reprint is marked <span className="font-bold text-amber-400">DUPLICATE COPY</span>.
            {!isOwner && ' You can reprint the sales you rang up.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder="Receipt no. (e.g. TX-1A2B), customer, item or amount"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500"
            />
          </div>
          <input
            type="date" value={day} onChange={e => setDay(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500"
          />
          {(q || day) && (
            <button onClick={() => { setQ(''); setDay(''); }} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700">Clear</button>
          )}
        </div>

        {found.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">No sales found.</p>
        ) : (
          <div className="space-y-2">
            {found.slice(0, SHOW_MAX).map((s: any) => (
              <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-100">
                    {s.txId} <span className="text-xs font-normal text-slate-500">· {fmtDateTime(s.ts)}</span>
                  </p>
                  <p className="text-xs text-slate-400 truncate max-w-[34rem]">
                    {(s.items || []).map((i: any) => `${i.qty}x ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ')}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {s.customer || 'Walk-In Guest'} · {s.cashier || '-'} · {methodName(s.method || s.paymentMethod)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-extrabold text-amber-400">{money(s.total ?? s.grandTotal)}</span>
                  <button
                    onClick={() => onReprint(s)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" /> Reprint
                  </button>
                </div>
              </div>
            ))}
            {found.length > SHOW_MAX && (
              <p className="text-[11px] text-slate-500 text-center">Showing the latest {SHOW_MAX} of {found.length}. Type a receipt number or pick a date to narrow it down.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
