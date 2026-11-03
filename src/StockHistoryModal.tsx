import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';

/** Delivery (restock) history: filter by period or item, totals for the period, grouped by day. */
const RANGES: [string, string, number][] = [['today', 'Today', 1], ['7d', '7 days', 7], ['30d', '30 days', 30], ['all', 'All', 0]];

export default function StockHistoryModal({ log, money, fmtDateTime, onClose }: {
  log: any[]; money: (n: number) => string; fmtDateTime: (ts: number) => string; onClose: () => void;
}) {
  const [range, setRange] = useState('30d');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const days = RANGES.find(r => r[0] === range)![2];
    const since = range === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : days ? Date.now() - days * 86400000 : 0;
    return log.filter(l => l.ts >= since && l.name.toLowerCase().includes(q.toLowerCase()));
  }, [log, range, q]);

  const units = rows.reduce((a, l) => a + l.qty, 0);
  const value = rows.reduce((a, l) => a + l.qty * l.cost, 0);

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    rows.forEach(l => { const k = new Date(l.ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); m.set(k, [...(m.get(k) || []), l]); });
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-200">
        <div className="p-6 pb-3 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold">Delivery History</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              {RANGES.map(([id, label]) => (
                <button key={id} onClick={() => setRange(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${range === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>{label}</button>
              ))}
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item…"
              className="flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[['Deliveries', rows.length], ['Units received', units], ['Cost value', money(value)]].map(([l, v]) => (
              <div key={String(l)} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">{l}</p>
                <p className="text-lg font-extrabold font-mono text-slate-100 whitespace-nowrap">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          {groups.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">No deliveries in this period.</p>}
          {groups.map(([day, items]) => (
            <div key={day} className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase text-slate-500">{day}</p>
              {items.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100 truncate">{l.name}</p>
                    <p className="text-xs text-slate-500">{fmtDateTime(l.ts)} · received by {l.by}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <p className="font-mono font-bold text-emerald-400">+{l.qty}</p>
                    <p className="text-xs text-slate-500">{money(l.cost)} each · {money(l.qty * l.cost)}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
