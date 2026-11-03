import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Calendar of end-of-day results. Click a date, a month or a year to see its EOD totals.
 * A shift counts toward the day it was OPENED, so a bar that closes at 3 AM still reports as one business day.
 */
type Mode = 'day' | 'month' | 'year';
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const blank = () => ({ total: 0, count: 0, cash: 0, mobile: 0, card: 0, barSales: 0, retailSales: 0, shrinkageValue: 0, shrinkageUnits: 0, expenses: 0, tillExpenses: 0, cashVariance: 0, cashCounted: 0, refundTotal: 0, shifts: [] as any[] });
const addTo = (a: any, s: any) => {
  a.total += s.total || 0; a.count += s.count || 0; a.cash += s.cash || 0; a.mobile += s.mobile || 0; a.card += s.card || 0;
  a.barSales += s.barSales || 0; a.retailSales += s.retailSales || 0;
  a.refundTotal += s.refundTotal || 0; a.cashVariance += s.cashVariance || 0; a.cashCounted += s.cashVariance != null ? 1 : 0;
  a.expenses += s.expenses || 0; a.tillExpenses += s.tillExpenses || 0;
  a.shrinkageValue += s.shrinkageValue || 0; a.shrinkageUnits += s.shrinkageUnits || 0; a.shifts.push(s);
};
const compact = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : n.toFixed(0));

export default function CalendarView({ shifts: allShifts, money, fmtDateTime, currency, showLosses = true }: {
  shifts: any[]; showLosses?: boolean; money: (n: number) => string; fmtDateTime: (ts: number) => string; currency: string;
}) {
  const today = new Date();
  const [mode, setMode] = useState<Mode>('day');
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(dayKey(Date.now()));
  const [deviceFilter, setDeviceFilter] = useState('all');
  const devices = useMemo(() => [...new Set(allShifts.map((s: any) => s.deviceName).filter(Boolean))] as string[], [allShifts]);
  const shifts = useMemo(() => (deviceFilter === 'all' ? allShifts : allShifts.filter((s: any) => s.deviceName === deviceFilter)), [allShifts, deviceFilter]);

  const { byDay, byMonth, byYear } = useMemo(() => {
    const byDay = new Map<string, any>(), byMonth = new Map<string, any>(), byYear = new Map<string, any>();
    for (const s of shifts) {
      const k = dayKey(s.openedAt);
      for (const [map, key] of [[byDay, k], [byMonth, k.slice(0, 7)], [byYear, k.slice(0, 4)]] as [Map<string, any>, string][]) {
        if (!map.has(key)) map.set(key, blank());
        addTo(map.get(key), s);
      }
    }
    return { byDay, byMonth, byYear };
  }, [shifts]);

  const year = cursor.getFullYear();
  const data = mode === 'day' ? byDay : mode === 'month' ? byMonth : byYear;
  const result = data.get(selected);

  const go = (delta: number) => {
    if (mode === 'day') setCursor(new Date(year, cursor.getMonth() + delta, 1));
    else if (mode === 'month') setCursor(new Date(year + delta, 0, 1));
    else setCursor(new Date(year + delta * 12, 0, 1));
  };
  const switchMode = (m: Mode, sel: string) => { setMode(m); setSelected(sel); };

  const title = mode === 'day' ? `${MONTHS[cursor.getMonth()]} ${year}` : mode === 'month' ? String(year) : `${year - 5} – ${year + 6}`;

  // Cell grids
  const first = new Date(year, cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // week starts Monday
  const daysInMonth = new Date(year, cursor.getMonth() + 1, 0).getDate();

  const cell = (key: string, label: React.ReactNode, active: boolean, isNow: boolean) => {
    const d = data.get(key);
    return (
      <button key={key} onClick={() => setSelected(key)}
        className={`min-h-[64px] rounded-xl border p-1.5 text-left transition-all flex flex-col justify-between ${
          active ? 'bg-amber-500/15 border-amber-500' : d ? 'bg-slate-950/60 border-slate-700 hover:border-amber-500/50' : 'bg-slate-950/30 border-slate-800 hover:border-slate-700'
        }`}>
        <span className={`text-xs font-bold ${isNow ? 'text-amber-400' : 'text-slate-300'}`}>{label}</span>
        {d && <span className="text-[11px] font-mono font-bold text-emerald-400 whitespace-nowrap">{currency}{compact(d.total)}</span>}
      </button>
    );
  };

  const heading = mode === 'day'
    ? new Date(selected + 'T00:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : mode === 'month' ? `${MONTHS[Number(selected.slice(5, 7)) - 1]} ${selected.slice(0, 4)}` : selected;

  const kpi = (label: string, value: React.ReactNode, tone = 'text-slate-100') => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 min-w-0">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className={`text-xl font-extrabold font-mono mt-1 whitespace-nowrap ${tone}`}>{value}</p>
    </div>
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 } as React.CSSProperties;

  // Breakdown rows under the KPIs
  const breakdown = useMemo(() => {
    if (!result) return [];
    if (mode === 'day') return result.shifts.map((s: any) => ({ key: s.id, label: `${s.deviceName ? s.deviceName + ' · ' : ''}${fmtDateTime(s.openedAt)} → ${s.closedAt ? fmtDateTime(s.closedAt) : 'in progress'}`, total: s.total, sub: `${s.count} sales`, open: !s.closedAt }));
    const src = mode === 'month' ? byDay : byMonth;
    return [...src.entries()].filter(([k]) => k.startsWith(selected)).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ key: k, label: mode === 'month' ? new Date(k + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : MONTHS[Number(k.slice(5, 7)) - 1], total: v.total, sub: `${v.count} sales`, drill: k }));
  }, [result, mode, selected, byDay, byMonth]);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-100">Sales Calendar</h2>
          <p className="text-xs text-slate-400">Tap a date, month or year to see the End of Day results. A shift counts for the day it was opened.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {devices.length > 1 && (
          <select value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-2xl px-3 text-xs font-bold text-slate-200">
            <option value="all">All devices</option>
            {devices.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800">
          {(['day', 'month', 'year'] as Mode[]).map(m => (
            <button key={m} onClick={() => switchMode(m, m === 'day' ? dayKey(Date.now()) : m === 'month' ? dayKey(Date.now()).slice(0, 7) : String(today.getFullYear()))}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize ${mode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{m}</button>
          ))}
        </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => go(-1)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"><ChevronLeft className="h-5 w-5" /></button>
          <button
            onClick={() => { if (mode === 'day') switchMode('month', `${year}-${pad(cursor.getMonth() + 1)}`); else if (mode === 'month') switchMode('year', String(year)); }}
            className="font-extrabold text-slate-100 hover:text-amber-400">{title}</button>
          <button onClick={() => go(1)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"><ChevronRight className="h-5 w-5" /></button>
        </div>

        {mode === 'day' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
            {WEEK.map(w => <div key={w} className="text-center text-[11px] font-bold text-slate-500 pb-1">{w}</div>)}
            {Array.from({ length: offset }).map((_, i) => <div key={'e' + i} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const k = `${year}-${pad(cursor.getMonth() + 1)}-${pad(i + 1)}`;
              return cell(k, i + 1, k === selected, k === dayKey(Date.now()));
            })}
          </div>
        )}
        {mode === 'month' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
            {MONTHS.map((m, i) => { const k = `${year}-${pad(i + 1)}`; return cell(k, m.slice(0, 3), k === selected, k === dayKey(Date.now()).slice(0, 7)); })}
          </div>
        )}
        {mode === 'year' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
            {Array.from({ length: 12 }).map((_, i) => { const y = String(year - 5 + i); return cell(y, y, y === selected, y === String(today.getFullYear())); })}
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-extrabold text-slate-100 text-lg">{heading}</h3>
        {!result ? (
          <p className="text-sm text-slate-500">No end-of-day results for this {mode}. Close a shift on the EOD tab to record one.</p>
        ) : (
          <>
            <div style={grid}>
              {kpi('Revenue', money(result.total), 'text-emerald-400')}
              {kpi('Sales', result.count)}
              {kpi('Average sale', money(result.count ? result.total / result.count : 0))}
              {showLosses && kpi('Shrinkage', <>-{money(result.shrinkageValue)}<span className="block text-xs font-sans font-semibold text-slate-400">{result.shrinkageUnits} units</span></>, 'text-rose-400')}
            </div>
            {showLosses && (
              <div style={grid}>
                {kpi('Expenses', <>-{money(result.expenses)}</>, 'text-rose-400')}
                {result.refundTotal > 0 ? kpi('Refunds (already deducted)', <>-{money(result.refundTotal)}</>, 'text-rose-400') : null}
                {kpi('Net after expenses', money(result.total - result.expenses), result.total - result.expenses < 0 ? 'text-rose-400' : 'text-amber-400')}
                {kpi('Cash to hand over', money(result.cash - result.tillExpenses))}
                {result.cashCounted > 0 ? kpi('Cash over / short', result.cashVariance === 0 ? 'Balanced' : (result.cashVariance < 0 ? '-' : '+') + money(Math.abs(result.cashVariance)).trim(), result.cashVariance < 0 ? 'text-rose-400' : result.cashVariance > 0 ? 'text-amber-400' : 'text-emerald-400') : null}
              </div>
            )}
            <div style={grid}>
              {kpi('Cash', money(result.cash))}
              {kpi('Mobile money', money(result.mobile))}
              {kpi('Card', money(result.card))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-slate-500">{mode === 'day' ? 'Shifts' : mode === 'month' ? 'Days' : 'Months'}</p>
              {breakdown.map((b: any) => (
                <button key={b.key} disabled={!b.drill} onClick={() => b.drill && (mode === 'month' ? (setCursor(new Date(Number(b.drill.slice(0, 4)), Number(b.drill.slice(5, 7)) - 1, 1)), switchMode('day', b.drill)) : (setCursor(new Date(Number(b.drill.slice(0, 4)), Number(b.drill.slice(5, 7)) - 1, 1)), switchMode('month', b.drill)))}
                  className="w-full flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-left text-sm enabled:hover:border-amber-500/50">
                  <span className="text-slate-300">{b.label}{b.open && <span className="ml-2 text-[10px] font-bold text-amber-400">LIVE</span>}</span>
                  <span className="text-right whitespace-nowrap"><span className="font-mono font-bold text-slate-100">{money(b.total)}</span><span className="text-xs text-slate-500 ml-3">{b.sub}</span></span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
