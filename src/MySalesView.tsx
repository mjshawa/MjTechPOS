import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

/**
 * Staff: "My Sales". Shows ONLY the sales this staff member rang, with a calendar of the days they sold.
 *  - Tap a day to see every sale they made that day (items, time, how it was paid, receipt number).
 *  - No costs, profit, stock or other staff members' figures are shown here.
 *  - A bar that closes after midnight is still ONE business day, so anything sold before DAY_STARTS_AT
 *    in the morning counts toward the day before (a sale at 01:30 belongs to the previous evening).
 */
const DAY_STARTS_AT = 6; // hours; sales before 06:00 belong to the previous business day
const pad = (n: number) => String(n).padStart(2, '0');
const keyOfDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const businessDay = (ts: number) => keyOfDate(new Date(ts - DAY_STARTS_AT * 36e5));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const compact = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : n.toFixed(0));
const methodOf = (s: any) => s.method || s.paymentMethod || 'cash';
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', mobile: 'Mobile money', card: 'Card', credit: 'On credit' };

export default function MySalesView({ sales, user, refundsBySale, money, fmtDateTime, currency }: {
  sales: any[]; user: { id: string; name: string }; refundsBySale: Map<string, number>;
  money: (n: any) => string; fmtDateTime: (ts: number) => string; currency: string;
}) {
  const todayKey = businessDay(Date.now());
  const [cursor, setCursor] = useState(() => { const [y, m] = todayKey.split('-').map(Number); return new Date(y, m - 1, 1); });
  const [selected, setSelected] = useState(todayKey);

  // Only this staff member's sales. Newer sales carry the staff id; older ones only the name.
  const mine = useMemo(
    () => sales.filter(s => (s.cashierId ? s.cashierId === user.id : !!s.cashier && s.cashier === user.name)),
    [sales, user.id, user.name]
  );

  // What was sold each business day (refunds on a sale are taken off that sale's day)
  const byDay = useMemo(() => {
    const m = new Map<string, { total: number; count: number; sales: any[] }>();
    for (const s of mine) {
      const k = businessDay(s.ts);
      const d = m.get(k) || { total: 0, count: 0, sales: [] };
      d.total += (s.total || 0) - (refundsBySale.get(s.id) || 0);
      d.count += 1;
      d.sales.push(s);
      m.set(k, d);
    }
    m.forEach(d => d.sales.sort((a, b) => b.ts - a.ts));
    return m;
  }, [mine, refundsBySale]);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const monthKey = `${year}-${pad(month + 1)}`;
  const monthTotal = useMemo(() => {
    let total = 0, count = 0, days = 0;
    byDay.forEach((d, k) => { if (k.startsWith(monthKey)) { total += d.total; count += d.count; days += 1; } });
    return { total, count, days };
  }, [byDay, monthKey]);

  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // week starts Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = byDay.get(selected);

  // Totals and item summary for the selected day
  const summary = useMemo(() => {
    const by: Record<string, number> = { cash: 0, mobile: 0, card: 0 };
    const items = new Map<string, number>();
    (day?.sales || []).forEach(s => {
      by[methodOf(s)] = (by[methodOf(s)] || 0) + (s.total || 0) - (refundsBySale.get(s.id) || 0);
      (s.items || []).forEach((i: any) => {
        const name = `${i.name}${i.variant ? ` (${i.variant})` : ''}`;
        items.set(name, (items.get(name) || 0) + (i.qty || 0));
      });
    });
    return { by, items: [...items.entries()].sort((a, b) => b[1] - a[1]) };
  }, [day, refundsBySale]);

  const heading = new Date(selected + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const kpi = (label: string, value: React.ReactNode, tone = 'text-slate-100') => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 min-w-0">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className={`text-xl font-extrabold font-mono mt-1 whitespace-nowrap ${tone}`}>{value}</p>
    </div>
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 } as React.CSSProperties;

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2"><CalendarDays className="h-6 w-6 text-amber-400" /> My Sales</h2>
        <p className="text-sm text-slate-400">Everything you have sold. Tap a day on the calendar to see what you sold that day. Sales made after midnight count for the evening before.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-lg hover:bg-slate-800 text-slate-300" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
          <div className="text-center">
            <p className="font-extrabold text-slate-100">{MONTHS[month]} {year}</p>
            <p className="text-[11px] text-slate-500">{monthTotal.days} day{monthTotal.days === 1 ? '' : 's'} sold · {monthTotal.count} sale{monthTotal.count === 1 ? '' : 's'} · <span className="text-emerald-400 font-mono font-bold">{money(monthTotal.total)}</span></p>
          </div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-lg hover:bg-slate-800 text-slate-300" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {WEEK.map(w => <div key={w} className="text-center text-[11px] font-bold text-slate-500 pb-1">{w}</div>)}
          {Array.from({ length: offset }).map((_, i) => <div key={'e' + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const k = `${monthKey}-${pad(i + 1)}`;
            const d = byDay.get(k);
            const active = k === selected;
            return (
              <button key={k} onClick={() => setSelected(k)}
                className={`min-h-[64px] rounded-xl border p-1.5 text-left transition-all flex flex-col justify-between ${
                  active ? 'bg-amber-500/15 border-amber-500' : d ? 'bg-slate-950/60 border-slate-700 hover:border-amber-500/50' : 'bg-slate-950/30 border-slate-800 hover:border-slate-700'
                }`}>
                <span className={`text-xs font-bold ${k === todayKey ? 'text-amber-400' : 'text-slate-300'}`}>{i + 1}</span>
                {d && <span className="text-[11px] font-mono font-bold text-emerald-400 whitespace-nowrap">{currency}{compact(d.total)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-extrabold text-slate-100 text-lg">{heading}</h3>
        {!day ? (
          <p className="text-sm text-slate-500">You made no sales on this day.</p>
        ) : (
          <>
            <div style={grid}>
              {kpi('You sold', money(day.total), 'text-emerald-400')}
              {kpi('Sales', day.count)}
              {kpi('Cash', money(summary.by.cash))}
              {kpi('Mobile money', money(summary.by.mobile))}
              {kpi('Card', money(summary.by.card))}
            </div>

            {summary.items.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase text-slate-500">Items you sold</p>
                <div className="flex flex-wrap gap-2">
                  {summary.items.map(([name, qty]) => (
                    <span key={name} className="text-xs bg-slate-950/60 border border-slate-800 rounded-full px-3 py-1 text-slate-300">
                      <b className="font-mono text-amber-400">{qty}×</b> {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-slate-500">Each sale</p>
              {day.sales.map((s: any) => {
                const refunded = refundsBySale.get(s.id) || 0;
                return (
                  <div key={s.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-100 text-sm">#{s.txId} <span className="text-slate-500 font-normal">· {fmtDateTime(s.ts)} · {METHOD_LABEL[methodOf(s)] || methodOf(s)}</span></p>
                      <p className="text-slate-400">{(s.items || []).map((i: any) => `${i.qty}× ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ')}</p>
                      {s.customer && s.customer !== 'Walk-In Guest' && <p className="text-slate-500">{s.customer}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-extrabold text-amber-400 text-base">{money(s.total)}</p>
                      {refunded > 0 && <p className="text-rose-400 font-mono">refunded -{money(refunded)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
